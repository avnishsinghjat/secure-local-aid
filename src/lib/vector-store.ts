import { get, set } from 'idb-keyval';

const STORE_KEY = 'kb-vector-store-v1';
const PROCESSED_KEY = 'kb-processed-docs-v1';

export interface VectorRecord {
  docId: number;
  chunkIdx: number;
  chunkText: string;
  embedding: number[];
  docTitle: string;
  docCategory: string;
  docType: string;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom < 1e-10 ? 0 : dot / denom;
}

async function loadStore(): Promise<VectorRecord[]> {
  return (await get<VectorRecord[]>(STORE_KEY)) ?? [];
}

async function saveStore(records: VectorRecord[]): Promise<void> {
  await set(STORE_KEY, records);
}

async function loadProcessed(): Promise<number[]> {
  return (await get<number[]>(PROCESSED_KEY)) ?? [];
}

async function saveProcessed(ids: number[]): Promise<void> {
  await set(PROCESSED_KEY, ids);
}

export async function storeEmbeddings(
  docId: number,
  chunks: string[],
  embeddings: number[][],
  metadata: { docTitle: string; docCategory: string; docType: string }
): Promise<void> {
  // Remove old records for this doc, then add new ones
  const existing = await loadStore();
  const filtered = existing.filter((r) => r.docId !== docId);
  for (let i = 0; i < chunks.length; i++) {
    filtered.push({
      docId,
      chunkIdx: i,
      chunkText: chunks[i],
      embedding: embeddings[i],
      ...metadata,
    });
  }
  await saveStore(filtered);

  // Mark doc as processed
  const processed = await loadProcessed();
  if (!processed.includes(docId)) {
    await saveProcessed([...processed, docId]);
  }
}

export async function deleteDocumentEmbeddings(docId: number): Promise<void> {
  const existing = await loadStore();
  await saveStore(existing.filter((r) => r.docId !== docId));
  const processed = await loadProcessed();
  await saveProcessed(processed.filter((id) => id !== docId));
}

export async function searchSimilar(
  queryEmbedding: number[],
  topK = 5,
  minScore = 0.05
): Promise<Array<{ record: VectorRecord; score: number }>> {
  const store = await loadStore();
  const scored = store
    .map((r) => ({ record: r, score: cosineSimilarity(queryEmbedding, r.embedding) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export async function hasEmbeddings(docId: number): Promise<boolean> {
  const processed = await loadProcessed();
  return processed.includes(docId);
}

export async function getProcessedDocIds(): Promise<number[]> {
  return loadProcessed();
}

export async function getTotalChunks(): Promise<number> {
  const store = await loadStore();
  return store.length;
}

export async function clearAllEmbeddings(): Promise<void> {
  await saveStore([]);
  await saveProcessed([]);
}
