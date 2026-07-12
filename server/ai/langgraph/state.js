import { Annotation } from '@langchain/langgraph';

export const GraphState = Annotation.Root({
  userId: Annotation(),
  sessionId: Annotation(),
  session: Annotation(),
  content: Annotation(),
  mode: Annotation({
    default: () => 'analyze',
  }),
  subject: Annotation(),
  topics: Annotation({
    reducer: (_, next) => next,
    default: () => [],
  }),
  userProgress: Annotation({
    reducer: (_, next) => next,
    default: () => [],
  }),
  questionCount: Annotation({
    default: () => 10,
  }),
  plan: Annotation(),
  quiz: Annotation(),
  analysis: Annotation(),
  weakTopics: Annotation({
    reducer: (_, next) => next,
    default: () => [],
  }),
  studyPlan: Annotation(),
  passed: Annotation(),
  error: Annotation(),
});
