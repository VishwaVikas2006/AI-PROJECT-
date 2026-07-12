import { runPlannerAgent } from '../agents/planner.js';
import { runAnalyzerAgent } from '../agents/analyzer.js';
import { runQuizGeneratorAgent } from '../agents/quiz.js';
import { runStudyPlannerAgent } from '../agents/studyPlanner.js';

export async function plannerNode(state) {
  const session = state.session;
  const plan = await runPlannerAgent({
    subject: session.subject,
    topics: session.topics || [],
    userProgress: state.userProgress || [],
    questionCount: state.questionCount || 10,
  });
  return { plan };
}

export async function analyzerNode(state) {
  const session = state.session;
  const analysis = await runAnalyzerAgent({
    content: state.content,
    title: session.title,
    subject: session.subject,
    mode: state.mode || 'analyze',
  });
  return {
    analysis,
    topics: analysis.topics,
    subject: analysis.subject,
  };
}

export async function quizGeneratorNode(state) {
  const plan = state.plan;
  const session = state.session;

  const quiz = await runQuizGeneratorAgent({
    topics: plan.topics,
    difficulty: plan.difficulty,
    questionCount: plan.questionCount,
    content: state.content || session.sourceContent,
    subject: session.subject,
  });

  return { quiz };
}

export async function studyPlannerNode(state) {
  const session = state.session;
  const studyPlan = await runStudyPlannerAgent({
    weakTopics: state.weakTopics || [],
    subject: session.subject,
    sessionSummary: session.summary,
  });
  return { studyPlan };
}

export function routeAfterEvaluation(state) {
  return state.passed ? 'dashboard' : 'study_planner';
}
