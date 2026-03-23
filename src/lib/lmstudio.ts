const CONFIG_KEY = 'lmstudio_config';

export interface LMStudioConfig {
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
}

export const DEFAULT_CONFIG: LMStudioConfig = {
  baseUrl: 'http://localhost:1234/v1',
  chatModel: '',
  embeddingModel: '',
};

export function getLMStudioConfig(): LMStudioConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveLMStudioConfig(config: LMStudioConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatCompletion(
  messages: ChatMessage[],
  config?: Partial<LMStudioConfig>,
  signal?: AbortSignal
): Promise<string> {
  const cfg = { ...getLMStudioConfig(), ...config };
  const body: Record<string, unknown> = {
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  };
  if (cfg.chatModel) body.model = cfg.chatModel;

  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Local AI error ${response.status}: ${text}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function streamChatCompletion(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  config?: Partial<LMStudioConfig>,
  signal?: AbortSignal
): Promise<void> {
  const cfg = { ...getLMStudioConfig(), ...config };
  const body: Record<string, unknown> = {
    messages,
    temperature: 0.7,
    max_tokens: 2048,
    stream: true,
  };
  if (cfg.chatModel) body.model = cfg.chatModel;

  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Local AI error ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const raw = trimmed.slice(6);
      if (raw === '[DONE]') return;
      try {
        const parsed = JSON.parse(raw);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      } catch {}
    }
  }
}

export async function createEmbedding(
  text: string,
  config?: Partial<LMStudioConfig>
): Promise<number[]> {
  const cfg = { ...getLMStudioConfig(), ...config };
  const body: Record<string, unknown> = { input: text };
  if (cfg.embeddingModel) body.model = cfg.embeddingModel;

  const response = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Embeddings error ${response.status}`);
  }
  const data = await response.json();
  return data.data?.[0]?.embedding ?? [];
}

export async function createEmbeddings(
  texts: string[],
  config?: Partial<LMStudioConfig>,
  onProgress?: (done: number, total: number) => void
): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    results.push(await createEmbedding(texts[i], config));
    onProgress?.(i + 1, texts.length);
  }
  return results;
}

export async function listModels(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/models`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data ?? []).map((m: { id: string }) => m.id);
  } catch {
    return [];
  }
}

export async function testConnection(
  baseUrl: string
): Promise<{ ok: boolean; models: string[] }> {
  try {
    const models = await listModels(baseUrl);
    return { ok: true, models };
  } catch {
    return { ok: false, models: [] };
  }
}
