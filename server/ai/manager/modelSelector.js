// manager/modelSelector.js
//
// Maps agentName + provider to the most appropriate model for the task.
// This is informational — providers use it to pick a model but always have a
// sensible default if no mapping exists.
//
// To add task routing for a new provider, add a key to MODEL_MAP below.

/**
 * Task → model mapping per provider.
 *
 * Keys match the agentName values used throughout the codebase:
 *   Analyzer, QuizGenerator, Planner, StudyPlanner, Evaluator,
 *   Summary, Flashcards, Explain, Diagnose
 */
const MODEL_MAP = {
  gemini: {
    // Primary model used for all tasks unless GEMINI_MODEL overrides it.
    // The existing gemini.js reads process.env.GEMINI_MODEL so we don't need
    // to set anything here — this is just documentation.
    _default: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    _fast: process.env.GEMINI_FAST_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  },

  openrouter: {
    // Use the most capable model for reasoning-heavy tasks.
    Analyzer:     'deepseek/deepseek-chat-v3-0324',
    QuizGenerator:'deepseek/deepseek-chat-v3-0324',
    Evaluator:    'deepseek/deepseek-chat-v3-0324',
    StudyPlanner: 'qwen/qwen-2.5-72b-instruct',
    Summary:      'qwen/qwen-2.5-72b-instruct',
    Flashcards:   'meta-llama/llama-3.3-70b-instruct',
    Explain:      'meta-llama/llama-3.3-70b-instruct',
    Planner:      'mistralai/mistral-7b-instruct',
    _default:     'deepseek/deepseek-chat-v3-0324',
  },

  cohere: {
    _default: process.env.COHERE_MODEL || 'command-r-plus',
  },

  mistral: {
    _default: process.env.MISTRAL_MODEL || 'mistral-small-latest',
  },
};

/**
 * Get the best model name for a given provider + task.
 *
 * @param {string} providerName  - e.g. 'gemini', 'openrouter'
 * @param {string} agentName     - e.g. 'Analyzer', 'QuizGenerator'
 * @param {boolean} fast         - if true, prefer the lighter/faster model
 * @returns {string|undefined}   - model name, or undefined to use provider default
 */
export function getModel(providerName, agentName, fast = false) {
  const map = MODEL_MAP[providerName];
  if (!map) return undefined;

  if (fast && map._fast) return map._fast;
  if (agentName && map[agentName]) return map[agentName];
  return map._default;
}
