import { callAndParse } from '../ai/utils/jsonParser.js';
import {
  buildExplainPrompt,
  buildFlashcardsPrompt,
  buildSummaryPrompt,
} from '../ai/prompts/explain.js';
import { runStudyPlannerAgent } from '../ai/agents/studyPlanner.js';
import { withInFlightLock } from '../ai/utils/requestLock.js';
import LearningSession from '../models/LearningSession.js';
import StudyPlan from '../models/StudyPlan.js';
import Progress from '../models/Progress.js';

export async function explainAnswer(req, res, next) {
  try {
    const { question, userAnswer, correctAnswer, options } = req.body;

    if (!question || !correctAnswer) {
      return res.status(400).json({ message: 'Question and correct answer are required' });
    }

    const messages = buildExplainPrompt({ question, userAnswer, correctAnswer, options });
    const result = await callAndParse(messages);

    res.json({ explanation: result });
  } catch (err) {
    next(err);
  }
}

export async function generateStudyPlan(req, res, next) {
  try {
    const { sessionId, regenerate } = req.body;
    const forceRegenerate = Boolean(regenerate);

    const session = await LearningSession.findOne({ _id: sessionId, user: req.userId });
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const existingPlan = await StudyPlan.findOne({ user: req.userId, sessionId: session._id })
      .sort({ createdAt: -1 });

    if (existingPlan && !forceRegenerate) {
      return res.json({ studyPlan: existingPlan });
    }

    const studyPlan = await withInFlightLock(`studyplan:${session._id}:${forceRegenerate}`, async () => {
      // Re-check cache in case another request already generated it.
      if (!forceRegenerate) {
        const cached = await StudyPlan.findOne({ user: req.userId, sessionId: session._id })
          .sort({ createdAt: -1 });
        if (cached) return cached;
      }

      const weakProgress = await Progress.find({
        user: req.userId,
        subject: session.subject,
        mastery: { $lt: 50 },
      });

      const weakTopics = weakProgress.map((p) => p.topic);

      const plan = await runStudyPlannerAgent({
        weakTopics,
        subject: session.subject,
        sessionSummary: session.summary,
      });

      try {
        return await StudyPlan.create({
          user: req.userId,
          sessionId: session._id,
          topics: plan.topics,
          dailyPlan: plan.dailyPlan,
          estimatedDuration: plan.estimatedDuration,
        });
      } catch (createError) {
        console.error('StudyPlan create validation failure:', createError.message);
        throw new Error('Unable to save the generated study plan. Please try again.');
      }
    });

    res.status(201).json({ studyPlan });
  } catch (err) {
    next(err);
  }
}

function normalizeSummaryResult(result) {
  if (!result || typeof result !== 'object') {
    return {
      summary: '',
      keyTakeaways: [],
      reviewTips: [],
      details: {},
    };
  }

  const keyTakeaways = Array.isArray(result.keyConcepts)
    ? result.keyConcepts
    : Array.isArray(result.importantDefinitions)
    ? result.importantDefinitions
    : Array.isArray(result.keyTakeaways)
    ? result.keyTakeaways
    : [];

  const reviewTips = Array.isArray(result.reviewTips)
    ? result.reviewTips
    : Array.isArray(result.memoryTricks)
    ? result.memoryTricks
    : [];

  return {
    summary: result.quickSummary || result.summary || '',
    keyTakeaways: keyTakeaways.map((item) => (typeof item === 'string' ? item : String(item))).filter(Boolean),
    reviewTips: reviewTips.map((item) => (typeof item === 'string' ? item : String(item))).filter(Boolean),
    details: result,
  };
}

export async function generateSummary(req, res, next) {
  try {
    const { sessionId, regenerate } = req.body;
    const forceRegenerate = Boolean(regenerate);

    const session = await LearningSession.findOne({ _id: sessionId, user: req.userId });
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (!forceRegenerate && session.studySummary) {
      return res.json({ summary: session.studySummary });
    }

    const studySummary = await withInFlightLock(`summary:${session._id}:${forceRegenerate}`, async () => {
      if (!forceRegenerate && session.studySummary) return session.studySummary;

      const messages = buildSummaryPrompt({
        content: session.sourceContent,
        title: session.title,
      });

      const result = await callAndParse(messages, { agentName: 'Summary' });
      const parsed = normalizeSummaryResult(result);

      const hasContent =
        Boolean(parsed.summary) ||
        (Array.isArray(parsed.keyTakeaways) && parsed.keyTakeaways.length > 0) ||
        (Array.isArray(parsed.reviewTips) && parsed.reviewTips.length > 0);

      if (!hasContent) {
        // Never persist malformed/empty AI output. Surface a clear error instead.
        throw new Error('The AI returned an empty or invalid summary. Please try again.');
      }

      session.studySummary = parsed;
      await session.save();
      return parsed;
    });

    res.json({ summary: studySummary });
  } catch (err) {
    next(err);
  }
}

export async function generateFlashcards(req, res, next) {
  try {
    const { sessionId, count, regenerate } = req.body;
    const forceRegenerate = Boolean(regenerate);
    // Cap at 10 cards max to limit output tokens.
    const requestedCount = Math.max(5, Math.min(10, Number(count) || 5));

    const session = await LearningSession.findOne({ _id: sessionId, user: req.userId });
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (!forceRegenerate && Array.isArray(session.flashcards) && session.flashcards.length > 0) {
      return res.json({ flashcards: session.flashcards });
    }

    const flashcards = await withInFlightLock(`flashcards:${session._id}:${forceRegenerate}`, async () => {
      if (!forceRegenerate && Array.isArray(session.flashcards) && session.flashcards.length > 0) {
        return session.flashcards;
      }

      const topics = session.topics?.map((t) => t.name) || [session.subject];
      const messages = buildFlashcardsPrompt({
        topics,
        content: session.sourceContent,
        count: requestedCount,
      });

      const result = await callAndParse(messages, { agentName: 'Flashcards' });
      const cards = Array.isArray(result.flashcards)
        ? result.flashcards.filter((fc) => fc && (fc.question || fc.answer))
        : [];

      if (cards.length === 0) {
        throw new Error('Flashcards agent returned no results');
      }

      session.flashcards = cards;
      await session.save();
      return cards;
    });

    res.json({ flashcards });
  } catch (err) {
    next(err);
  }
}

export async function getStudyPlans(req, res, next) {
  try {
    const plans = await StudyPlan.find({ user: req.userId })
      .populate('sessionId', 'title subject')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({ plans });
  } catch (err) {
    next(err);
  }
}
