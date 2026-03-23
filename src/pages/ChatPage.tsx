import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { queryHybrid, QueryMode, HybridQueryResult } from '@/lib/rag';
import { getLMStudioConfig } from '@/lib/lmstudio';
import {
  MessageSquare, Send, Bot, User, Database, BookOpen,
  Zap, Loader2, Trash2, ChevronDown, ChevronUp, Code2,
  AlertCircle, Cpu
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: HybridQueryResult['mode'];
  sql?: string;
  sqlResults?: Record<string, unknown>[];
  kbSources?: Array<{ docTitle: string; docType: string; chunkText: string; score: number }>;
  error?: boolean;
  timestamp: Date;
}

const MODE_OPTIONS: Array<{ value: QueryMode; label: string; icon: React.ElementType; desc: string }> = [
  { value: 'auto', label: 'Auto', icon: Zap, desc: 'Automatically routes to best source' },
  { value: 'kb', label: 'Knowledge Base', icon: BookOpen, desc: 'Search uploaded documents' },
  { value: 'sql', label: 'SQL / Data', icon: Database, desc: 'Query ticket database' },
  { value: 'general', label: 'General', icon: Bot, desc: 'General AI conversation' },
];

const SUGGESTIONS = [
  'How many open tickets are there right now?',
  'What is the procedure for submitting an issue voucher?',
  'Show me all critical priority tickets',
  'Who has the most assigned tickets?',
  'List all unresolved security incidents',
  'What are the SOP steps for equipment deposit?',
];

export default function ChatPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<QueryMode>('auto');
  const [loading, setLoading] = useState(false);
  const [expandedSQL, setExpandedSQL] = useState<Record<string, boolean>>({});
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const config = getLMStudioConfig();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    abortRef.current = new AbortController();

    try {
      const result = await queryHybrid(question, mode, config);

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.answer,
        mode: result.mode,
        sql: result.sql,
        sqlResults: result.sqlResults,
        kbSources: result.kbSources,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
      if (!isAbort) {
        const errMsg =
          err instanceof Error ? err.message : 'Unknown error';
        const isConnection = errMsg.includes('fetch') || errMsg.includes('Failed to fetch') || errMsg.includes('ECONNREFUSED');
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: isConnection
              ? `Cannot connect to LM Studio. Please ensure:\n1. LM Studio is running\n2. A model is loaded\n3. The server is started (port 1234)\n4. Base URL is set correctly in Settings\n\nError: ${errMsg}`
              : `Error: ${errMsg}`,
            error: true,
            timestamp: new Date(),
          },
        ]);
        if (!isConnection) {
          toast({ title: 'Error', description: errMsg, variant: 'destructive' });
        }
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, mode, config, toast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => setMessages([]);

  const modeLabelMap: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    kb: { label: 'Knowledge Base', color: 'bg-primary/10 text-primary border-primary/20', icon: BookOpen },
    sql: { label: 'SQL Data', color: 'bg-accent/10 text-accent border-accent/20', icon: Database },
    hybrid: { label: 'Hybrid', color: 'bg-warning/10 text-warning border-warning/20', icon: Zap },
    general: { label: 'General', color: 'bg-muted text-muted-foreground border-border', icon: Bot },
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">AI Assistant</h1>
            <p className="text-xs text-muted-foreground">
              Powered by LM Studio &middot; {config.baseUrl}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={mode} onValueChange={(v) => setMode(v as QueryMode)}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <opt.icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearChat} title="Clear chat">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Mode description */}
      {mode !== 'auto' && (
        <div className="mb-3 shrink-0">
          {MODE_OPTIONS.filter((o) => o.value === mode).map((opt) => (
            <div key={opt.value} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">
              <opt.icon className="w-3.5 h-3.5" />
              <span><strong>{opt.label}:</strong> {opt.desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-primary/60" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Ask anything about your system</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Query your ticket database, search knowledge base documents, or ask general questions. All processing is local via LM Studio.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left text-xs p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Bubble */}
            <div className={`flex-1 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              {msg.role === 'assistant' && msg.mode && (
                <div className="flex items-center gap-1.5 mb-0.5">
                  {(() => {
                    const m = modeLabelMap[msg.mode];
                    if (!m) return null;
                    return (
                      <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${m.color}`}>
                        <m.icon className="w-2.5 h-2.5 mr-1" />
                        {m.label}
                      </Badge>
                    );
                  })()}
                  <span className="text-[10px] text-muted-foreground">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              <div
                className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : msg.error
                    ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm'
                    : 'bg-card border border-border rounded-tl-sm text-foreground'
                }`}
              >
                {msg.error && <AlertCircle className="w-4 h-4 inline mr-2 mb-0.5" />}
                {msg.content}
              </div>

              {/* SQL details */}
              {msg.sql && (
                <Card className="w-full border-border bg-muted/30">
                  <CardContent className="p-0">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setExpandedSQL((p) => ({ ...p, [msg.id]: !p[msg.id] }))}
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>SQL Query</span>
                      <span className="ml-auto text-[10px] bg-muted rounded px-1">
                        {msg.sqlResults?.length ?? 0} rows
                      </span>
                      {expandedSQL[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {expandedSQL[msg.id] && (
                      <div className="px-3 pb-3 space-y-2">
                        <pre className="text-[11px] bg-background rounded p-2 overflow-x-auto border border-border font-mono text-foreground">
                          {msg.sql}
                        </pre>
                        {msg.sqlResults && msg.sqlResults.length > 0 && (
                          <div className="overflow-x-auto rounded border border-border">
                            <table className="w-full text-[10px]">
                              <thead className="bg-muted">
                                <tr>
                                  {Object.keys(msg.sqlResults[0]).map((k) => (
                                    <th key={k} className="px-2 py-1 text-left text-muted-foreground font-medium">{k}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {msg.sqlResults.slice(0, 10).map((row, i) => (
                                  <tr key={i} className="border-t border-border even:bg-muted/20">
                                    {Object.values(row).map((v, j) => (
                                      <td key={j} className="px-2 py-1 text-foreground max-w-[200px] truncate">
                                        {String(v ?? '')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {msg.sqlResults.length > 10 && (
                              <p className="text-[10px] text-muted-foreground px-2 py-1 border-t border-border">
                                Showing 10 of {msg.sqlResults.length} rows
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* KB Sources */}
              {msg.kbSources && msg.kbSources.length > 0 && (
                <Card className="w-full border-border bg-muted/30">
                  <CardContent className="p-0">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setExpandedSources((p) => ({ ...p, [msg.id]: !p[msg.id] }))}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Sources ({msg.kbSources.length})</span>
                      {expandedSources[msg.id] ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                    </button>
                    {expandedSources[msg.id] && (
                      <div className="px-3 pb-3 space-y-2">
                        {msg.kbSources.map((s, i) => (
                          <div key={i} className="rounded border border-border bg-background p-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-semibold text-foreground">{s.docTitle}</span>
                              <Badge variant="outline" className="text-[9px] py-0 px-1">{s.docType}</Badge>
                              <span className="ml-auto text-[9px] text-muted-foreground">
                                {Math.round(s.score * 100)}% match
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground line-clamp-2">{s.chunkText}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {msg.role === 'user' && (
                <span className="text-[10px] text-muted-foreground px-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-secondary-foreground" />
            </div>
            <div className="bg-card border border-border rounded-xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 pt-3 border-t border-border">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about tickets, procedures, or any data... (Enter to send, Shift+Enter for new line)"
            className="resize-none min-h-[52px] max-h-[160px] bg-secondary border-border text-sm"
            rows={2}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="h-[52px] w-[52px] shrink-0 p-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          All queries processed locally via LM Studio &middot; No data leaves your machine
        </p>
      </div>
    </div>
  );
}
