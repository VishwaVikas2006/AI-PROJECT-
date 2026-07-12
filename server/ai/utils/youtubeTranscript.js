// Fetches the real transcript for a YouTube video using only the built-in
// fetch API (no external libraries). If the transcript cannot be retrieved,
// it throws a clear error so the caller can surface it instead of letting the
// AI hallucinate content from the video title alone.

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

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parseCaptionTracks(html) {
  // YouTube embeds the player response as escaped JSON. Unescape the common
  // sequences so we can locate the captionTracks array.
  const decoded = html
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n');

  const match = decoded.match(/"captionTracks":(\[.*?\])/);
  if (!match) return [];

  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

function parseTranscriptXml(xml) {
  const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    decodeHtmlEntities(m[1]).replace(/\s+/g, ' ').trim()
  );
  return segments.filter(Boolean).join(' ');
}

export async function fetchYouTubeTranscript(url, { timeoutMs = 20000 } = {}) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL. Please provide a link to a single YouTube video.');
  }

  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const pageResponse = await fetch(pageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    if (!pageResponse.ok) {
      throw new Error(`YouTube returned HTTP ${pageResponse.status} for this video.`);
    }

    const html = await pageResponse.text();
    const tracks = parseCaptionTracks(html);
    if (!tracks.length) {
      throw new Error('No captions/transcripts are available for this video.');
    }

    const preferred =
      tracks.find((t) => t.languageCode === 'en') ||
      tracks.find((t) => !t.kind) ||
      tracks[0];

    const captionResponse = await fetch(preferred.baseUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });

    if (!captionResponse.ok) {
      throw new Error('Failed to download the transcript for this video.');
    }

    const xml = await captionResponse.text();
    const transcript = parseTranscriptXml(xml);

    if (!transcript || transcript.trim().length === 0) {
      throw new Error('The transcript for this video was empty.');
    }

    return {
      videoId,
      language: preferred.languageCode,
      transcript: transcript.trim(),
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Timed out while retrieving the transcript for this video.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export { extractVideoId };
