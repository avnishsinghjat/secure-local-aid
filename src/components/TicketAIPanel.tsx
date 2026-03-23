import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { analyzeTicket, findRelatedTickets, TicketAnalysis, RelatedTicket } from '@/lib/rag';
import { getLMStudioConfig } from '@/lib/lmstudio';
import {
  Bot, Loader2, ChevronRight, AlertCircle, Lightbulb,
  Clock, MessageSquare, BookOpen, Link2, Sparkles, RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TicketAIPanelProps {
  ticket: {
    id: number;
    title: string;
    description: string;
    ticketType: string;
    status: string;
    priority: string;
    unit: string;
  };
  comments?: Array<{ content: string; is_internal: number; display_name: string }>;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground border-border',
  medium: 'bg-accent/10 text-accent border-accent/20',
  high: 'bg-warning/10 text-warning border-warning/20',
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
};

export default function TicketAIPanel({ ticket, comments }: TicketAIPanelProps) {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<TicketAnalysis | null>(null);
  const [related, setRelated] = useState<RelatedTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const config = getLMStudioConfig();
      const [analysisResult, relatedResult] = await Promise.allSettled([
        analyzeTicket(
          {
            title: ticket.title,
            description: ticket.description,
            ticketType: ticket.ticketType,
            status: ticket.status,
            priority: ticket.priority,
            unit: ticket.unit,
            comments: comments?.map((c) => ({
              content: c.content,
              isInternal: c.is_internal === 1,
              author: c.display_name,
            })),
          },
          config
        ),
        findRelatedTickets(ticket.title, ticket.description, ticket.id),
      ]);

      if (analysisResult.status === 'fulfilled') {
        setAnalysis(analysisResult.value);
      } else {
        throw analysisResult.reason;
      }
      if (relatedResult.status === 'fulfilled') {
        setRelated(relatedResult.value);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const isConn = msg.includes('fetch') || msg.includes('Failed to fetch');
      setError(
        isConn
          ? 'Cannot connect to Local AI. Ensure it is running with a model loaded on port 1234.'
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> AI Analysis
        </h4>
        {analysis && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={runAnalysis}
            disabled={loading}
            title="Re-analyse"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {!analysis && !loading && !error && (
          <div className="text-center py-4">
            <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground mb-3">
              Run AI analysis on this ticket to get insights, suggested actions, and related articles.
            </p>
            <Button size="sm" onClick={runAnalysis} className="gap-1.5 text-xs">
              <Sparkles className="w-3.5 h-3.5" /> Analyse with AI
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Analysing ticket...</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-2 rounded bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-destructive font-medium mb-1">Analysis failed</p>
              <p className="text-[10px] text-destructive/80 leading-relaxed">{error}</p>
              <Button size="sm" variant="outline" onClick={runAnalysis} className="mt-2 h-6 text-[10px]">
                Retry
              </Button>
            </div>
          </div>
        )}

        {analysis && !loading && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5">
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1 flex items-center gap-1">
                <Bot className="w-3 h-3" /> Summary
              </p>
              <p className="text-xs text-foreground leading-relaxed">{analysis.summary}</p>
            </div>

            {/* Suggested priority vs current */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Suggested priority:</span>
              <Badge
                variant="outline"
                className={`text-[10px] py-0 px-1.5 ${PRIORITY_COLORS[analysis.suggestedPriority] ?? ''}`}
              >
                {analysis.suggestedPriority}
              </Badge>
              {analysis.suggestedCategory && (
                <>
                  <span className="text-[10px] text-muted-foreground">Category:</span>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-muted text-muted-foreground">
                    {analysis.suggestedCategory}
                  </Badge>
                </>
              )}
            </div>

            {/* ETA */}
            {analysis.estimatedResolutionTime && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>Est. resolution: <span className="text-foreground font-medium">{analysis.estimatedResolutionTime}</span></span>
              </div>
            )}

            {/* Suggested actions */}
            {analysis.suggestedActions?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" /> Suggested Actions
                </p>
                <ul className="space-y-1">
                  {analysis.suggestedActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                      <ChevronRight className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* KB Articles */}
            {analysis.relatedKBArticles?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Related KB Articles
                </p>
                <ul className="space-y-1">
                  {analysis.relatedKBArticles.map((a, i) => (
                    <li key={i} className="text-xs bg-muted/50 rounded p-1.5">
                      <span className="font-medium text-foreground">{a.title}</span>
                      {a.docType && (
                        <Badge variant="outline" className="ml-1.5 text-[9px] py-0 px-1">{a.docType}</Badge>
                      )}
                      {a.relevance && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{a.relevance}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Draft response */}
            {analysis.draftResponse && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Draft Response
                </p>
                <div className="rounded bg-muted/50 border border-border p-2 text-xs text-foreground leading-relaxed">
                  {analysis.draftResponse}
                </div>
              </div>
            )}

            {/* Related tickets */}
            {related.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> Similar Tickets
                </p>
                <ul className="space-y-1">
                  {related.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => navigate(`/ticket/${t.id}`)}
                        className="w-full text-left flex items-center gap-1.5 p-1.5 rounded hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-[10px] font-mono text-primary">{t.ticket_number}</span>
                        <span className="text-[10px] text-foreground flex-1 truncate">{t.title}</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 shrink-0">{t.status}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
