import { createEmbedding, chatCompletion, ChatMessage, LMStudioConfig } from './lmstudio';
import { searchSimilar, VectorRecord } from './vector-store';
import { runQuery } from './database';

// ---------- Schema context for SQL generation ----------
const SCHEMA_CONTEXT = `
SQLite database schema for a military ticketing system:

Tables:
- tickets(id, ticket_number, title, description, ticket_type, status, priority, severity,
          category_id, module, sub_module, observation_type, requester_id, assigned_team_id,
          assigned_user_id, unit, due_date, resolved_at, closed_at, created_at, updated_at)
- users(id, username, display_name, role, team_id, unit, active)
- teams(id, name, description)
- categories(id, name, parent_id)
- comments(id, ticket_id, user_id, content, is_internal, created_at)
- audit_log(id, entity_type, entity_id, action, user_id, details, created_at)
- kb_documents(id, title, description, category, doc_type, filename, tags, uploaded_by, version, status, created_at)

Enum values:
- ticket.status: draft | submitted | under_triage | allocated | forwarded | in_progress |
                 awaiting_response | pending_validation | pending_documents | resolved | closed |
                 rejected | reopened
- ticket.priority: low | medium | high | critical
- ticket.severity: normal | high | critical
- ticket.ticket_type: general | issue_voucher | deposit_voucher | transfer_voucher
- user.role: super_admin | admin | g1_triage | resolver | miso_officer | unit_user | auditor
`;

// ---------- Types ----------
export interface KBQueryResult {
  answer: string;
  sources: Array<{
    docTitle: string;
    docType: string;
    chunkText: string;
    score: number;
  }>;
}

export interface SQLQueryResult {
  answer: string;
  sql: string;
  results: Record<string, unknown>[];
  error?: string;
}

export type QueryMode = 'auto' | 'kb' | 'sql' | 'general';

export interface HybridQueryResult {
  answer: string;
  mode: 'kb' | 'sql' | 'hybrid' | 'general';
  kbSources?: KBQueryResult['sources'];
  sql?: string;
  sqlResults?: Record<string, unknown>[];
}

// ---------- Knowledge Base RAG ----------
export async function queryKnowledgeBase(
  question: string,
  config?: Partial<LMStudioConfig>
): Promise<KBQueryResult> {
  const queryEmbedding = await createEmbedding(question, config);
  const similar = await searchSimilar(queryEmbedding, 6, 0.05);

  if (similar.length === 0) {
    return {
      answer:
        'No relevant documents found in the knowledge base. Please upload and process documents first, or check that the embedding model is configured in Settings.',
      sources: [],
    };
  }

  const context = similar
    .map(
      (s, i) =>
        `[${i + 1}] "${s.record.docTitle}" (${s.record.docType}):\n${s.record.chunkText}`
    )
    .join('\n\n---\n\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a knowledgeable assistant for a military operations and ticketing system. Answer based strictly on the provided context. Be concise and accurate. Cite the source number in brackets when referencing content.',
    },
    {
      role: 'user',
      content: `Context from Knowledge Base:\n\n${context}\n\nQuestion: ${question}`,
    },
  ];

  const answer = await chatCompletion(messages, config);
  return {
    answer,
    sources: similar.map((s) => ({
      docTitle: s.record.docTitle,
      docType: s.record.docType,
      chunkText: s.record.chunkText,
      score: s.score,
    })),
  };
}

// ---------- SQL Query Generation ----------
function extractSQL(text: string): string {
  const codeBlock = text.match(/```(?:sql)?\s*([\s\S]*?)\s*```/i);
  if (codeBlock) return codeBlock[1].trim();
  const selectMatch = text.match(/SELECT[\s\S]+?(?=;|$)/i);
  if (selectMatch) return selectMatch[0].trim();
  return text.trim();
}

export async function querySQL(
  question: string,
  config?: Partial<LMStudioConfig>
): Promise<SQLQueryResult> {
  // Step 1: Generate SQL
  const sqlMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a SQL expert. Generate ONLY a valid SQLite SELECT query for the question below. No explanations. No markdown except for the SQL block. Schema:\n${SCHEMA_CONTEXT}`,
    },
    {
      role: 'user',
      content: `Generate SQLite query to answer: "${question}"`,
    },
  ];

  const sqlResponse = await chatCompletion(sqlMessages, config);
  const sql = extractSQL(sqlResponse);

  // Step 2: Execute SQL
  let results: Record<string, unknown>[] = [];
  let error: string | undefined;
  try {
    results = (await runQuery(sql)) as Record<string, unknown>[];
  } catch (e) {
    error = String(e);
  }

  // Step 3: Natural language answer
  const answerMessages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a helpful assistant for a military ticketing system. Present the database results clearly and concisely.',
    },
    {
      role: 'user',
      content: `Question: ${question}\n\nSQL: ${sql}\n\n${
        error ? `Error running query: ${error}` : `Results (${results.length} rows): ${JSON.stringify(results.slice(0, 30), null, 2)}`
      }\n\nProvide a clear, concise answer:`,
    },
  ];

  const answer = await chatCompletion(answerMessages, config);
  return { answer, sql, results, error };
}

// ---------- Hybrid / Auto Routing ----------
function detectMode(question: string): 'sql' | 'kb' | 'general' {
  const lq = question.toLowerCase();
  const sqlHints = [
    'how many', 'count', 'list all', 'show me', 'find tickets', 'how many tickets',
    'open tickets', 'closed tickets', 'resolved', 'pending', 'statistics', 'report',
    'average', 'total', 'assigned to', 'created by', 'last week', 'this month',
    'status is', 'priority', 'due today', 'overdue',
  ];
  const kbHints = [
    'procedure', 'policy', 'sop', 'manual', 'guideline', 'how to', 'what is the process',
    'steps to', 'according to', 'regulation', 'requirement', 'standard operating',
    'instructions', 'documentation', 'reference',
  ];

  const sqlScore = sqlHints.filter((k) => lq.includes(k)).length;
  const kbScore = kbHints.filter((k) => lq.includes(k)).length;

  if (sqlScore > kbScore) return 'sql';
  if (kbScore > sqlScore) return 'kb';
  return 'general';
}

export async function queryHybrid(
  question: string,
  mode: QueryMode = 'auto',
  config?: Partial<LMStudioConfig>
): Promise<HybridQueryResult> {
  if (mode === 'kb') {
    const r = await queryKnowledgeBase(question, config);
    return { answer: r.answer, mode: 'kb', kbSources: r.sources };
  }

  if (mode === 'sql') {
    const r = await querySQL(question, config);
    return { answer: r.answer, mode: 'sql', sql: r.sql, sqlResults: r.results };
  }

  if (mode === 'general') {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant for a military ticketing and operations system.',
      },
      { role: 'user', content: question },
    ];
    const answer = await chatCompletion(messages, config);
    return { answer, mode: 'general' };
  }

  // Auto routing
  const detected = detectMode(question);

  if (detected === 'sql') {
    const r = await querySQL(question, config);
    return { answer: r.answer, mode: 'sql', sql: r.sql, sqlResults: r.results };
  }

  if (detected === 'kb') {
    const r = await queryKnowledgeBase(question, config);
    return { answer: r.answer, mode: 'kb', kbSources: r.sources };
  }

  // General fallback
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a helpful assistant for a military ticketing and operations management system. You can answer questions about tickets, procedures, and general operations.',
    },
    { role: 'user', content: question },
  ];
  const answer = await chatCompletion(messages, config);
  return { answer, mode: 'general' };
}

// ---------- Ticket AI Analysis ----------
export interface TicketAnalysis {
  summary: string;
  suggestedPriority: string;
  suggestedCategory: string;
  suggestedActions: string[];
  estimatedResolutionTime: string;
  draftResponse: string;
  relatedKBArticles: Array<{ title: string; docType: string; relevance: string }>;
}

export async function analyzeTicket(
  ticket: {
    title: string;
    description: string;
    ticketType: string;
    status: string;
    priority: string;
    unit: string;
    comments?: Array<{ content: string; isInternal: boolean; author: string }>;
  },
  config?: Partial<LMStudioConfig>
): Promise<TicketAnalysis> {
  // Search KB for relevant docs
  let kbContext = '';
  try {
    const embedding = await createEmbedding(
      `${ticket.title} ${ticket.description}`,
      config
    );
    const similar = await searchSimilar(embedding, 3, 0.05);
    if (similar.length > 0) {
      kbContext =
        '\n\nRelevant Knowledge Base Articles:\n' +
        similar
          .map((s) => `- "${s.record.docTitle}" (${s.record.docType}): ${s.record.chunkText.slice(0, 200)}...`)
          .join('\n');
    }
  } catch {
    // KB search optional — don't fail if no embeddings exist
  }

  const commentContext =
    ticket.comments && ticket.comments.length > 0
      ? '\n\nActivity/Comments:\n' +
        ticket.comments
          .map((c) => `[${c.author}${c.isInternal ? ' (internal)' : ''}]: ${c.content}`)
          .join('\n')
      : '';

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are an intelligent ticket analysis assistant for a military operations ticketing system. Analyze tickets and provide actionable insights. Always respond with valid JSON matching the requested schema.',
    },
    {
      role: 'user',
      content: `Analyze this ticket and return a JSON object with this exact structure:
{
  "summary": "brief 1-2 sentence summary",
  "suggestedPriority": "low|medium|high|critical",
  "suggestedCategory": "category name",
  "suggestedActions": ["action 1", "action 2", "action 3"],
  "estimatedResolutionTime": "e.g. 2-4 hours",
  "draftResponse": "a professional response to the requester",
  "relatedKBArticles": [{"title":"...", "docType":"...", "relevance":"..."}]
}

Ticket Details:
Title: ${ticket.title}
Description: ${ticket.description}
Type: ${ticket.ticketType}
Status: ${ticket.status}
Priority: ${ticket.priority}
Unit: ${ticket.unit}${commentContext}${kbContext}

Return ONLY the JSON object, no other text:`,
    },
  ];

  const response = await chatCompletion(messages, config);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as TicketAnalysis;
    }
  } catch {}

  // Fallback if JSON parsing fails
  return {
    summary: response.slice(0, 200),
    suggestedPriority: ticket.priority,
    suggestedCategory: 'General',
    suggestedActions: ['Review ticket details', 'Assign to appropriate team'],
    estimatedResolutionTime: 'Unknown',
    draftResponse: 'Thank you for submitting this ticket. We are reviewing your request.',
    relatedKBArticles: [],
  };
}

// ---------- Related tickets ----------
export interface RelatedTicket {
  id: number;
  ticket_number: string;
  title: string;
  status: string;
  similarity: string;
}

export async function findRelatedTickets(
  title: string,
  description: string,
  currentTicketId: number
): Promise<RelatedTicket[]> {
  // Keyword search in SQL (no embedding needed)
  const keywords = title
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 5);

  if (keywords.length === 0) return [];

  const likeClause = keywords
    .map(() => '(title LIKE ? OR description LIKE ?)')
    .join(' OR ');
  const params: string[] = [];
  for (const kw of keywords) {
    params.push(`%${kw}%`, `%${kw}%`);
  }
  params.push(String(currentTicketId));

  const rows = await runQuery(
    `SELECT id, ticket_number, title, status
     FROM tickets
     WHERE (${likeClause}) AND id != ?
     ORDER BY created_at DESC LIMIT 5`,
    params
  );

  return (rows as RelatedTicket[]).map((r) => ({
    ...r,
    similarity: 'keyword match',
  }));
}
