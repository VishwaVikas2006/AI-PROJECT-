import { callAndParse } from '../utils/jsonParser.js';
import { buildAnalyzerPrompt } from '../prompts/analyzer.js';
import { createTracer } from '../utils/perf.js';
import { normalizeDifficulty, normalizeString, normalizeStringArray, normalizeTopicObjects } from '../utils/validation.js';

// All retries (transient 5xx/timeout and the single polite 429 backoff) are
// handled centrally in gemini.js via callAndParse. We make exactly ONE attempt
// here so requests are never retried in nested layers (which multiplied the
// number of Gemini calls a single user action could trigger).
export async function runAnalyzerAgent({ content, title, subject, mode = 'analyze' }) {
  const tracer = createTracer(`analyzer:${title}`);
  console.log('[DEBUG analyzer] input content length =', content ? content.length : 0, '| mode =', mode);
  const messages = buildAnalyzerPrompt(content, title, subject, mode);
  console.log('[DEBUG analyzer] prompt input length =', JSON.stringify(messages).length);
  tracer.step('prompt built');

  try {
    const analysisRaw = await callAndParse(messages, { agentName: 'Analyzer' });
    tracer.step('gemini returned');
    console.log('[DEBUG analyzer] parsed JSON =', JSON.stringify(analysisRaw).slice(0, 800));
    const analysis = analysisRaw || {};

    const topicsValid = Array.isArray(analysis.topics);
    console.log('[DEBUG analyzer] validation result =', { topicsValid, hasTitle: Boolean(analysis.title) });

    if (!topicsValid) {
      throw new Error('Analyzer returned invalid topics list');
    }

    if (!Array.isArray(analysis.learningObjectives)) {
      throw new Error('Analyzer returned invalid learningObjectives');
    }

    const topics = normalizeTopicObjects(analysis.topics);

    return {
      title: normalizeString(analysis.title, title),
      subject: normalizeString(analysis.subject, subject),
      summary: normalizeString(analysis.summary, ''),
      difficulty: normalizeDifficulty(analysis.difficulty),
      estimatedTime: normalizeString(analysis.estimatedStudyTime || analysis.estimatedTime, '1 Hour'),
      learningObjectives: normalizeStringArray(analysis.learningObjectives),
      topics,
      keywords: normalizeStringArray(analysis.keywords),
    };
  } catch (err) {
    console.error('Analyzer AI failure: runAnalyzerAgent');
    console.error('Error message:', err.message);
    throw err;
  }
}
