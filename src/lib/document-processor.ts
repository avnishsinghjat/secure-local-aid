import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure pdf.js worker using bundled build
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

export async function extractText(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const mime = file.type.toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') {
    return extractPDF(file);
  }
  if (
    ext === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDOCX(file);
  }
  // TXT, MD, CSV, JSON, XML, and other plain text formats
  return extractPlainText(file);
}

async function extractPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    if (pageText.trim()) parts.push(pageText.trim());
  }
  return parts.join('\n\n');
}

async function extractDOCX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

function extractPlainText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(((reader.result as string) ?? '').trim());
    reader.onerror = () => reject(new Error('Failed to read file as text'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Splits text into overlapping chunks suitable for embedding.
 * Tries to split on sentence boundaries; falls back to character-based.
 */
export function chunkText(
  text: string,
  chunkSize = 600,
  overlap = 80
): string[] {
  if (!text || text.length === 0) return [];

  // Normalise whitespace
  const normalised = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');

  // Split into sentences (naïve but fast)
  const sentences = normalised.split(/(?<=[.!?\n])\s+/).filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      // keep trailing overlap
      const words = current.split(' ');
      const overlapWords: string[] = [];
      let overlapLen = 0;
      for (let i = words.length - 1; i >= 0; i--) {
        overlapLen += words[i].length + 1;
        if (overlapLen > overlap) break;
        overlapWords.unshift(words[i]);
      }
      current = overlapWords.join(' ') + ' ' + sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());

  // Fallback: character-based split for texts without sentence terminators
  if (chunks.length === 0) {
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const chunk = text.slice(i, i + chunkSize).trim();
      if (chunk.length > 20) chunks.push(chunk);
    }
  }

  return chunks.filter((c) => c.length > 20);
}
