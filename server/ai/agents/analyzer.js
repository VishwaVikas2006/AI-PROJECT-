import { callAndParse } from '../utils/jsonParser.js';
import { isRateLimit } from '../utils/gemini.js';
import { buildAnalyzerPrompt } from '../prompts/analyzer.js';
import { normalizeDifficulty, normalizeString, normalizeStringArray, normalizeTopicObjects } from '../utils/validation.js';

async function tryCall(messages, attempts = 2, delayMs = 500, agentName = 'AI Agent') {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callAndParse(messages, { agentName });
    } catch (err) {
      lastErr = err;
      // Never retry a rate limit — stop immediately.
      if (isRateLimit(err) || i >= attempts - 1) {
        break;
      }
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

export async function runAnalyzerAgent({ content, title, subject, mode = 'analyze' }) {
  console.log('[DEBUG analyzer] input content length =', content ? content.length : 0, '| mode =', mode);
  const messages = buildAnalyzerPrompt(content, title, subject, mode);
  console.log('[DEBUG analyzer] prompt input length =', JSON.stringify(messages).length);

  try {
    const analysisRaw = await tryCall(messages, 2, 700, 'Analyzer');
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
