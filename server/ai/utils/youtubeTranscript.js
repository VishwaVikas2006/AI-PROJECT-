// Fetches the real transcript for a YouTube video.
//
// The legacy `timedtext` endpoint embedded in the watch page now returns an
// empty body, so we use the maintained `youtube-transcript` package, which
// talks to YouTube's Innertube `get_transcript` API. If the transcript cannot
// be retrieved we throw a clear error so the caller can surface it instead of
// letting the AI hallucinate content from the video title alone.

import { YoutubeTranscript } from 'youtube-transcript';

function extractVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:[^&]*&)*v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/live\/)([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function fetchTranscriptForLanguage(videoId, lang) {
  const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang });
  if (!segments || !segments.length) {
    throw new Error('No captions/transcripts are available for this video.');
  }
  const language = segments[0]?.lang || lang || 'en';
  const transcript = segments
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!transcript) {
    throw new Error('The transcript for this video was empty.');
  }
  return { language, transcript };
}

export async function fetchYouTubeTranscript(url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL. Please provide a link to a single YouTube video.');
  }

  // Prefer English; fall back to any available language track if English is
  // missing (e.g. a video only has captions in its original language).
  const preferred = ['en', 'en-US', 'en-GB'];
  for (const lang of preferred) {
    try {
      const result = await fetchTranscriptForLanguage(videoId, lang);
      return { videoId, ...result };
    } catch {
      // try the next preferred language
    }
  }

  // No English track — use whatever YouTube serves by default.
  try {
    const result = await fetchTranscriptForLanguage(videoId, undefined);
    return { videoId, ...result };
  } catch (err) {
    throw new Error(
      `Could not retrieve a transcript for this video: ${err.message} ` +
        'You can still learn from it by pasting the transcript or notes into the Paste Notes tab.'
    );
  }
}

export { extractVideoId };
