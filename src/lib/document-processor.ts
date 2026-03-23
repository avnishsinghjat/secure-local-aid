import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { createWorker, OEM } from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'tiff', 'tif', 'bmp', 'webp', 'gif']);
const IMAGE_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/tiff', 'image/bmp', 'image/webp', 'image/gif',
]);

const MIN_TEXT_PER_PAGE = 40;

export interface ExtractionProgress {
  stage: 'extracting' | 'ocr';
  current: number;
  total: number;
  detail?: string;
}

type ProgressCallback = (progress: ExtractionProgress) => void;

export async function extractText(
  file: File,
  onProgress?: ProgressCallback
): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const mime = file.type.toLowerCase();

  if (IMAGE_EXTENSIONS.has(ext) || IMAGE_MIMES.has(mime)) {
    return extractImageOCR(file, onProgress);
  }
  if (ext === 'pdf' || mime === 'application/pdf') {
    return extractPDF(file, onProgress);
  }
  if (
    ext === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDOCX(file);
  }
  return extractPlainText(file);
}

async function extractImageOCR(
  file: File,
  onProgress?: ProgressCallback
): Promise<string> {
  onProgress?.({ stage: 'ocr', current: 0, total: 1, detail: 'Starting OCR...' });

  const worker = await createWorker('eng', OEM.DEFAULT, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        onProgress?.({
          stage: 'ocr',
          current: Math.round((m.progress ?? 0) * 100),
          total: 100,
          detail: `OCR: ${Math.round((m.progress ?? 0) * 100)}%`,
        });
      }
    },
  });

  try {
    const { data } = await worker.recognize(file);
    return (data.text ?? '').trim();
  } finally {
    await worker.terminate();
  }
}

async function extractPDF(
  file: File,
  onProgress?: ProgressCallback
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const numPages = pdf.numPages;

  const textParts: string[] = [];
  const ocrNeededPages: number[] = [];

  onProgress?.({ stage: 'extracting', current: 0, total: numPages, detail: 'Extracting text layers...' });

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();

    if (pageText.length >= MIN_TEXT_PER_PAGE) {
      textParts.push(pageText);
    } else {
      textParts.push('');
      ocrNeededPages.push(i);
    }
    onProgress?.({ stage: 'extracting', current: i, total: numPages });
  }

  if (ocrNeededPages.length > 0) {
    onProgress?.({
      stage: 'ocr',
      current: 0,
      total: ocrNeededPages.length,
      detail: `OCR needed for ${ocrNeededPages.length} scanned page(s)...`,
    });

    const worker = await createWorker('eng', OEM.DEFAULT);

    try {
      for (let idx = 0; idx < ocrNeededPages.length; idx++) {
        const pageNum = ocrNeededPages[idx];
        onProgress?.({
          stage: 'ocr',
          current: idx,
          total: ocrNeededPages.length,
          detail: `OCR page ${pageNum}/${numPages}...`,
        });

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;

        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const { data } = await worker.recognize(blob);
        const ocrText = (data.text ?? '').trim();

        if (ocrText) {
          textParts[pageNum - 1] = textParts[pageNum - 1]
            ? textParts[pageNum - 1] + '\n' + ocrText
            : ocrText;
        }

        onProgress?.({ stage: 'ocr', current: idx + 1, total: ocrNeededPages.length });
      }
    } finally {
      await worker.terminate();
    }
  }

  return textParts.filter(Boolean).join('\n\n');
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

  const normalised = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
  const sentences = normalised.split(/(?<=[.!?\n])\s+/).filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > chunkSize && current.length > 0) {
      chunks.push(current.trim());
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

  if (chunks.length === 0) {
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const chunk = text.slice(i, i + chunkSize).trim();
      if (chunk.length > 20) chunks.push(chunk);
    }
  }

  return chunks.filter((c) => c.length > 20);
}
