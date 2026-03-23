import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { runQuery, runExec } from '@/lib/database';
import { useAuth } from '@/lib/auth-context';
import { notifyTicketStatusChange, notifyNewComment, notifyTicketAssignment } from '@/lib/notifications';
import StatusBadge from '@/components/StatusBadge';
import PriorityIndicator from '@/components/PriorityIndicator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { ArrowLeft, Send, Clock, User, MessageSquare, Shield } from 'lucide-react';

interface TicketDetail {
  id: number; ticket_number: string; title: string; description: string;
  ticket_type: string; status: string; priority: string; severity: string;
  module: string; sub_module: string; observation_type: string;
  unit: string; due_date: string; created_at: string; updated_at: string;
  resolved_at: string; closed_at: string;
  requester_name: string; requester_role: string;
  assigned_team: string; assigned_user: string;
  category_name: string;
}

interface Comment {
  id: number; content: string; is_internal: number;
  created_at: string; display_name: string; role: string;
}

interface AuditEntry {
  action: string; details: string; created_at: string; display_name: string;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_triage', 'allocated', 'rejected'],
  under_triage: ['allocated', 'rejected'],
  allocated: ['forwarded', 'in_progress'],
  forwarded: ['in_progress', 'pending_validation', 'pending_documents'],
  pending_validation: ['in_progress', 'pending_documents', 'rejected'],
  pending_documents: ['in_progress', 'pending_validation'],
  in_progress: ['awaiting_response', 'resolved', 'rejected'],
  awaiting_response: ['in_progress', 'resolved'],
  resolved: ['closed', 'reopened'],
  rejected: ['reopened'],
  closed: ['reopened'],
  reopened: ['in_progress', 'allocated'],
};

export default function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [teams, setTeams] = useState<{id:number;name:string}[]>([]);
  const [resolvers, setResolvers] = useState<{id:number;display_name:string}[]>([]);

  const load = async () => {
    const [t] = await runQuery(`
      SELECT t.*, u.display_name as requester_name, u.role as requester_role,
             COALESCE(tm.name, 'Unassigned') as assigned_team,
             COALESCE(au.display_name, 'Unassigned') as assigned_user,
             COALESCE(c.name, '') as category_name
      FROM tickets t
      LEFT JOIN users u ON t.requester_id = u.id
      LEFT JOIN teams tm ON t.assigned_team_id = tm.id
      LEFT JOIN users au ON t.assigned_user_id = au.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `, [Number(id)]);
    setTicket(t as TicketDetail);

    const cmts = await runQuery(`
      SELECT c.*, u.display_name, u.role FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.ticket_id = ? ORDER BY c.created_at ASC
    `, [Number(id)]);
    setComments(cmts as Comment[]);

    const auditEntries = await runQuery(`
      SELECT a.action, a.details, a.created_at, COALESCE(u.display_name,'System') as display_name
      FROM audit_log a LEFT JOIN users u ON a.user_id = u.id
      WHERE a.entity_type = 'ticket' AND a.entity_id = ?
      ORDER BY a.created_at ASC
    `, [Number(id)]);
    setAudit(auditEntries as AuditEntry[]);

    const t2 = await runQuery('SELECT id, name FROM teams');
    setTeams(t2 as any[]);
    const r = await runQuery("SELECT id, display_name FROM users WHERE role IN ('resolver','miso_officer','g1_triage','admin','super_admin')");
    setResolvers(r as any[]);
  };

  useEffect(() => { load(); }, [id]);

  const addComment = async () => {
    if (!newComment.trim() || !ticket) return;
    await runExec(
      'INSERT INTO comments (ticket_id, user_id, content, is_internal) VALUES (?, ?, ?, ?)',
      [Number(id), user!.id, newComment, isInternal ? 1 : 0]
    );
    await runExec(
      "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('ticket', ?, 'comment_added', ?, ?)",
      [Number(id), user!.id, isInternal ? 'Internal note added' : 'Comment added']
    );
    // Get requester & assignee ids for notification
    const tkt = await runQuery('SELECT requester_id, assigned_user_id FROM tickets WHERE id = ?', [Number(id)]);
    if (tkt[0]) {
      await notifyNewComment(Number(id), ticket.ticket_number, user!.id, tkt[0].requester_id, tkt[0].assigned_user_id, isInternal);
    }
    setNewComment('');
    load();
  };

  const changeStatus = async (newStatus: string) => {
    if (!ticket) return;
    await runExec('UPDATE tickets SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [newStatus, Number(id)]);
    if (newStatus === 'resolved') await runExec("UPDATE tickets SET resolved_at = datetime('now') WHERE id = ?", [Number(id)]);
    if (newStatus === 'closed') await runExec("UPDATE tickets SET closed_at = datetime('now') WHERE id = ?", [Number(id)]);
    await runExec(
      "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('ticket', ?, 'status_changed', ?, ?)",
      [Number(id), user!.id, `Status changed to ${newStatus}`]
    );
    const tkt = await runQuery('SELECT requester_id, assigned_user_id FROM tickets WHERE id = ?', [Number(id)]);
    if (tkt[0]) {
      await notifyTicketStatusChange(Number(id), ticket.ticket_number, newStatus, tkt[0].requester_id, tkt[0].assigned_user_id);
    }
    load();
  };

  const assignTeam = async (teamId: string) => {
    await runExec('UPDATE tickets SET assigned_team_id = ?, updated_at = datetime(\'now\') WHERE id = ?', [Number(teamId), Number(id)]);
    await runExec(
      "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('ticket', ?, 'assigned_team', ?, ?)",
      [Number(id), user!.id, `Assigned to team ${teamId}`]
    );
    load();
  };

  const assignUser = async (userId: string) => {
    await runExec('UPDATE tickets SET assigned_user_id = ?, updated_at = datetime(\'now\') WHERE id = ?', [Number(userId), Number(id)]);
    await runExec(
      "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('ticket', ?, 'assigned_user', ?, ?)",
      [Number(id), user!.id, `Assigned to user ${userId}`]
    );
    load();
  };

  if (!ticket) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const canModify = user?.role !== 'unit_user' && user?.role !== 'auditor';
  const nextStatuses = STATUS_TRANSITIONS[ticket.status] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(-1)} className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="ticket-id text-base">{ticket.ticket_number}</span>
            <StatusBadge status={ticket.status} />
            <PriorityIndicator priority={ticket.priority} />
          </div>
          <h2 className="text-lg font-bold text-foreground">{ticket.title}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          <div className="panel">
            <div className="panel-header">
              <h3 className="text-sm font-semibold">Description</h3>
            </div>
            <div className="p-4 text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap">
              {ticket.description}
            </div>
          </div>

          {/* Comments */}
          <div className="panel">
            <div className="panel-header">
              <h3 className="text-sm font-semibold"><MessageSquare className="w-4 h-4 inline mr-2" />Activity ({comments.length})</h3>
            </div>
            <div className="divide-y divide-border">
              {comments.map((c) => (
                <div key={c.id} className={`p-4 ${c.is_internal ? 'bg-surface-elevated border-l-2 border-primary' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-foreground">{c.display_name}</span>
                    {c.is_internal ? <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider">Internal</span> : null}
                    <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-secondary-foreground">{c.content}</p>
                </div>
              ))}
              {comments.length === 0 && <p className="p-4 text-sm text-muted-foreground">No comments yet.</p>}
            </div>
            <div className="p-4 border-t space-y-3">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="bg-secondary border-border min-h-[80px]"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded" />
                  Internal note (not visible to requester)
                </label>
                <Button size="sm" onClick={addComment} disabled={!newComment.trim()}>
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Send
                </Button>
              </div>
            </div>
          </div>

          {/* Audit Trail */}
          <div className="panel">
            <div className="panel-header">
              <h3 className="text-sm font-semibold"><Clock className="w-4 h-4 inline mr-2" />Audit Trail</h3>
            </div>
            <div className="p-4 space-y-3">
              {audit.map((a, i) => (
                <div key={i} className="flex items-start gap-3 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div>
                    <span className="text-foreground font-medium">{a.display_name}</span>
                    <span className="text-muted-foreground"> — {a.details}</span>
                    <p className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          {canModify && nextStatuses.length > 0 && (
            <div className="panel p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</h4>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((s) => (
                  <Button key={s} size="sm" variant={s === 'resolved' ? 'default' : 'outline'} onClick={() => changeStatus(s)} className="text-xs">
                    {s.replace(/_/g, ' ').toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="panel p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Details</h4>
            <div className="space-y-2 text-xs">
              <Row label="Type" value={ticket.ticket_type.replace(/_/g, ' ')} />
              <Row label="Category" value={ticket.category_name || '—'} />
              <Row label="Module" value={ticket.module || '—'} />
              <Row label="Severity" value={ticket.severity} />
              <Row label="Unit" value={ticket.unit || '—'} />
              <Row label="Requester" value={ticket.requester_name} />
              <Row label="Created" value={new Date(ticket.created_at).toLocaleString()} />
              {ticket.resolved_at && <Row label="Resolved" value={new Date(ticket.resolved_at).toLocaleString()} />}
              {ticket.closed_at && <Row label="Closed" value={new Date(ticket.closed_at).toLocaleString()} />}
            </div>
          </div>

          {/* Assignment */}
          {canModify && (
            <div className="panel p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment</h4>
              <div className="space-y-2">
                <Select value={String(ticket.assigned_team === 'Unassigned' ? '' : teams.find(t => t.name === ticket.assigned_team)?.id || '')} onValueChange={assignTeam}>
                  <SelectTrigger className="h-8 text-xs bg-secondary">
                    <SelectValue placeholder="Assign team..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(ticket.assigned_user === 'Unassigned' ? '' : resolvers.find(r => r.display_name === ticket.assigned_user)?.id || '')} onValueChange={assignUser}>
                  <SelectTrigger className="h-8 text-xs bg-secondary">
                    <SelectValue placeholder="Assign resolver..." />
                  </SelectTrigger>
                  <SelectContent>
                    {resolvers.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium capitalize">{value}</span>
    </div>
  );
}
