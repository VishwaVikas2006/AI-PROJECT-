import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();

  if (ext === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === '.docx' || ext === '.doc') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === '.txt') {
    return fs.readFile(filePath, 'utf-8');
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export function truncateContent(text, maxLength = 6000) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n[Content truncated for analysis]`;
}

// Strip noise before anything is sent to Gemini: collapsing repeated spaces,
// removing page numbers / headers / footers, dropping duplicate lines AND
// duplicate paragraphs. Smaller, cleaner input = fewer input tokens and
// better analysis quality.
export function cleanContent(text) {
  if (!text || typeof text !== 'string') return '';

  // Standalone page markers and common header/footer lines.
  const noise = /^(page\s*\d+|[-–—]*\s*\d+\s*[-–—]*|\d+|confidential|copyright|all rights reserved|www\.|https?:\/\/)/i;

  const seen = new Set();
  const paragraphs = [];

  for (const raw of text.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    // Within a paragraph: collapse whitespace and drop page markers/noise lines.
    const line = raw
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !noise.test(l))
      .join(' ');

    if (!line) continue;
    if (seen.has(line)) continue; // drop repeated paragraphs
    seen.add(line);
    paragraphs.push(line);
  }

  return paragraphs.join('\n\n').trim();
}
