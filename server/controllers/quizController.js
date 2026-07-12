import Quiz from '../models/Quiz.js';
import Attempt from '../models/Attempt.js';
import LearningSession from '../models/LearningSession.js';
import Progress from '../models/Progress.js';
import StudyPlan from '../models/StudyPlan.js';
import { runQuizWorkflow, runRemediationWorkflow } from '../ai/langgraph/graph.js';
import { runEvaluatorAgent } from '../ai/agents/evaluator.js';
import { withInFlightLock } from '../ai/utils/requestLock.js';

export async function generateQuiz(req, res, next) {
  try {
    const { sessionId, questionCount, regenerate } = req.body;
    const forceRegenerate = Boolean(regenerate);

    const session = await LearningSession.findOne({ _id: sessionId, user: req.userId });
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.analysisStatus !== 'completed') {
      return res.status(400).json({ message: 'Session analysis not complete yet' });
    }

    if (!Array.isArray(session.topics) || session.topics.length === 0) {
      return res.status(400).json({ message: 'Insufficient analysis data to generate quiz' });
    }

    // Free Tier optimization: always generate exactly 5 questions.
    const requestedCount = 5;
    const existingQuiz = await Quiz.findOne({
      sessionId: session._id,
      user: req.userId,
      questionCount: requestedCount,
    }).sort({ createdAt: -1 });

    if (existingQuiz && !forceRegenerate) {
      return res.json({ quiz: existingQuiz });
    }

    const quiz = await withInFlightLock(`quiz:${session._id}:${requestedCount}:${forceRegenerate}`, async () => {
      // Re-check cache in case a concurrent request already created it.
      if (!forceRegenerate) {
        const cached = await Quiz.findOne({
          sessionId: session._id,
          user: req.userId,
          questionCount: requestedCount,
        }).sort({ createdAt: -1 });
        if (cached) return cached;
      }

      const userProgress = await Progress.find({
        user: req.userId,
        subject: session.subject,
      });

      const result = await runQuizWorkflow({
        userId: req.userId,
        sessionId: session._id,
        session,
        content: session.sourceContent,
        userProgress,
        questionCount: requestedCount,
      });

      if (!result || !result.quiz || !Array.isArray(result.quiz.questions) || result.quiz.questions.length === 0) {
        throw new Error('Quiz workflow returned invalid quiz data');
      }

      return Quiz.create({
        sessionId: session._id,
        user: req.userId,
        title: result.quiz.title || `${session.subject} Quiz`,
        questions: result.quiz.questions,
        difficulty: result.plan?.difficulty || 'medium',
        questionCount: result.quiz.questions.length,
        plan: {
          topics: result.plan?.topics || [],
          reasoning: result.plan?.reasoning || '',
        },
      });
    });

    res.status(201).json({ quiz, plan: quiz.plan });
  } catch (err) {
    next(err);
  }
}

export async function getQuiz(req, res, next) {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, user: req.userId });
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    const sanitized = quiz.toObject();
    sanitized.questions = sanitized.questions.map((q) => {
      // Keep correctAnswer so the client can request an explanation before
      // submitting, but hide the explanation itself until after submission.
      const { explanation, ...rest } = q;
      return rest;
    });

    res.json({ quiz: sanitized });
  } catch (err) {
    next(err);
  }
}

export async function submitQuiz(req, res, next) {
  try {
    const { quizId, answers, timeTaken } = req.body;

    const quiz = await Quiz.findOne({ _id: quizId, user: req.userId });
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    const session = await LearningSession.findById(quiz.sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session for this quiz not found' });
    }
    const evaluation = await runEvaluatorAgent(quiz.questions, answers);

    const score = evaluation.evaluations.filter((e) => e.isCorrect).length;
    const total = quiz.questions.length;
    const passed = score / total >= 0.7;

    const attempt = await Attempt.create({
      quizId: quiz._id,
      sessionId: quiz.sessionId,
      user: req.userId,
      answers: evaluation.evaluations,
      score,
      totalQuestions: total,
      weakTopics: evaluation.weakTopics,
      strongTopics: evaluation.strongTopics,
      recommendations: evaluation.recommendations,
      timeTaken: timeTaken || 0,
      passed,
    });

    for (const q of quiz.questions) {
      const ev = evaluation.evaluations.find((e) => e.questionId?.toString() === q._id.toString());
      const topic = q.topic || 'General';
      const progress = await Progress.findOneAndUpdate(
        { user: req.userId, subject: session.subject, topic },
        {
          $inc: {
            attempts: 1,
            totalQuestions: 1,
            correctCount: ev?.isCorrect ? 1 : 0,
          },
          $set: { lastStudied: new Date() },
        },
        { upsert: true, new: true }
      );
      progress.accuracy = Math.round((progress.correctCount / progress.totalQuestions) * 100);
      progress.mastery = ev?.isCorrect
        ? Math.min(100, progress.mastery + 8)
        : Math.max(0, progress.mastery - 5);
      await progress.save();
    }

    let studyPlan = null;
    if (!passed && evaluation.weakTopics.length > 0) {
      const result = await runRemediationWorkflow({
        session,
        weakTopics: evaluation.weakTopics,
      });
      try {
        studyPlan = await StudyPlan.create({
          user: req.userId,
          sessionId: session._id,
          topics: result.studyPlan.topics,
          dailyPlan: result.studyPlan.dailyPlan,
          estimatedDuration: result.studyPlan.estimatedDuration,
        });
      } catch (createError) {
        console.error('StudyPlan create validation failure:', createError.message);
        studyPlan = null;
      }
    }

    res.json({
      attempt,
      score,
      total,
      passed,
      weakTopics: evaluation.weakTopics,
      strongTopics: evaluation.strongTopics,
      recommendations: evaluation.recommendations,
      overallFeedback: evaluation.overallFeedback,
      studyPlan,
    });
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req, res, next) {
  try {
    const attempts = await Attempt.find({ user: req.userId })
      .populate('quizId', 'title difficulty questionCount')
      .populate('sessionId', 'title subject')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ attempts });
  } catch (err) {
    next(err);
  }
}

export async function getAttempt(req, res, next) {
  try {
    const attempt = await Attempt.findOne({ _id: req.params.id, user: req.userId })
      .populate('quizId')
      .populate('sessionId', 'title subject');

    if (!attempt) {
      return res.status(404).json({ message: 'Attempt not found' });
    }

    res.json({ attempt });
  } catch (err) {
    next(err);
  }
}
