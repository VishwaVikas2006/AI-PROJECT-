import { StateGraph, END } from '@langchain/langgraph';
import { GraphState } from './state.js';
import { plannerNode, analyzerNode, quizGeneratorNode, studyPlannerNode } from './nodes.js';

export function buildAnalysisGraph() {
  const graph = new StateGraph(GraphState)
    .addNode('analyzer', analyzerNode)
    .addEdge('__start__', 'analyzer')
    .addEdge('analyzer', END);

  return graph.compile();
}

export function buildQuizGenerationGraph() {
  const graph = new StateGraph(GraphState)
    .addNode('planner', plannerNode)
    .addNode('quiz_generator', quizGeneratorNode)
    .addEdge('__start__', 'planner')
    .addEdge('planner', 'quiz_generator')
    .addEdge('quiz_generator', END);

  return graph.compile();
}

export function buildRemediationGraph() {
  const graph = new StateGraph(GraphState)
    .addNode('study_planner', studyPlannerNode)
    .addEdge('__start__', 'study_planner')
    .addEdge('study_planner', END);

  return graph.compile();
}

export async function runContentAnalysis(input) {
  const graph = buildAnalysisGraph();
  return graph.invoke(input);
}

export async function runQuizWorkflow(input) {
  const graph = buildQuizGenerationGraph();
  return graph.invoke(input);
}

export async function runRemediationWorkflow(input) {
  const graph = buildRemediationGraph();
  return graph.invoke(input);
}
