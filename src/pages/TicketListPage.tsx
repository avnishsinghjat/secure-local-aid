import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runQuery, runExec } from '@/lib/database';
import { useAuth } from '@/lib/auth-context';
import StatusBadge from '@/components/StatusBadge';
import PriorityIndicator from '@/components/PriorityIndicator';
import SlaIndicator from '@/components/SlaIndicator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, Trash2, ArrowRightLeft, X } from 'lucide-react';

interface TicketRow {
  id: number; ticket_number: string; title: string; status: string;
  priority: string; unit: string; created_at: string; due_date: string;
  requester_name: string; assigned_team: string; ticket_type: string;
}

const STATUSES = ['all', 'draft', 'submitted', 'under_triage', 'allocated', 'forwarded', 'pending_validation', 'pending_documents', 'in_progress', 'awaiting_response', 'resolved', 'rejected', 'closed', 'reopened'];
const PRIORITIES_FILTER = ['all', 'critical', 'high', 'medium', 'low'];
const BULK_STATUSES = ['submitted', 'under_triage', 'allocated', 'in_progress', 'resolved', 'closed', 'rejected'];

interface Props {
  mode: 'all' | 'my' | 'queue' | 'team';
}

export default function TicketListPage({ mode }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadTickets = async () => {
    let where = '';
    const params: any[] = [];

    if (mode === 'my') {
      where = 'WHERE (t.requester_id = ? OR t.assigned_user_id = ?)';
      params.push(user!.id, user!.id);
    } else if (mode === 'queue') {
      where = "WHERE t.assigned_team_id IS NULL AND t.status IN ('submitted','under_triage')";
    } else if (mode === 'team') {
      where = 'WHERE t.assigned_team_id = ?';
      params.push(user!.team_id || -1);
    }

    const results = await runQuery(`
      SELECT t.id, t.ticket_number, t.title, t.status, t.priority, t.unit, t.created_at, t.due_date, t.ticket_type,
             u.display_name as requester_name,
             COALESCE(tm.name, 'Unassigned') as assigned_team
      FROM tickets t
      LEFT JOIN users u ON t.requester_id = u.id
      LEFT JOIN teams tm ON t.assigned_team_id = tm.id
      ${where}
      ORDER BY t.created_at DESC
    `, params.length ? params : undefined);
    setTickets(results as TicketRow[]);
    setSelected(new Set());
  };

  useEffect(() => { loadTickets(); }, [mode, user]);

  const canModify = user?.role !== 'unit_user' && user?.role !== 'auditor';
  const canDelete = user?.role === 'super_admin' || user?.role === 'admin';

  const titles: Record<string, string> = {
    all: 'All Tickets', my: 'My Tickets', queue: 'Incoming Queue', team: 'Team Queue',
  };

  const filtered = tickets.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.ticket_number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(t => t.id)));
    }
  };

  const bulkChangeStatus = async () => {
    if (!bulkStatus || selected.size === 0) return;
    for (const ticketId of selected) {
      await runExec('UPDATE tickets SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [bulkStatus, ticketId]);
      await runExec(
        "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('ticket', ?, 'status_changed', ?, ?)",
        [ticketId, user!.id, `Bulk status changed to ${bulkStatus}`]
      );
    }
    setBulkStatus('');
    loadTickets();
  };

  const bulkDelete = async () => {
    for (const ticketId of selected) {
      await runExec('DELETE FROM notifications WHERE ticket_id = ?', [ticketId]);
      await runExec('DELETE FROM comments WHERE ticket_id = ?', [ticketId]);
      await runExec("DELETE FROM audit_log WHERE entity_type = 'ticket' AND entity_id = ?", [ticketId]);
      await runExec('DELETE FROM attachments WHERE ticket_id = ?', [ticketId]);
      await runExec('DELETE FROM tickets WHERE id = ?', [ticketId]);
    }
    setShowDeleteConfirm(false);
    loadTickets();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">{titles[mode]}</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-secondary h-9" placeholder="Search tickets..." />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9 bg-secondary text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace(/_/g, ' ').toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px] h-9 bg-secondary text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRIORITIES_FILTER.map(p => <SelectItem key={p} value={p}>{p === 'all' ? 'All Priorities' : p.toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} tickets</span>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && canModify && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <span className="text-xs font-semibold text-foreground">{selected.size} selected</span>
          <div className="flex items-center gap-2 flex-1">
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger className="w-[160px] h-8 text-xs bg-secondary">
                <SelectValue placeholder="Change status..." />
              </SelectTrigger>
              <SelectContent>
                {BULK_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
            {bulkStatus && (
              <Button size="sm" className="text-xs h-8" onClick={bulkChangeStatus}>
                <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" /> Apply
              </Button>
            )}
          </div>
          {canDelete && (
            <Button size="sm" variant="outline" className="text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setSelected(new Set())}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="panel">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                {canModify && (
                  <th className="px-3 py-2 w-8">
                    <Checkbox
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                )}
                <th className="text-left px-4 py-2">Ticket</th>
                <th className="text-left px-4 py-2">Title</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Priority</th>
                <th className="text-left px-4 py-2">SLA</th>
                <th className="text-left px-4 py-2">Requester</th>
                <th className="text-left px-4 py-2">Unit</th>
                <th className="text-left px-4 py-2">Team</th>
                <th className="text-left px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className={`data-table-row ${selected.has(t.id) ? 'bg-primary/5' : ''}`}>
                  {canModify && (
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(t.id)}
                        onCheckedChange={() => toggleSelect(t.id)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 ticket-id cursor-pointer" onClick={() => navigate(`/ticket/${t.id}`)}>{t.ticket_number}</td>
                  <td className="px-4 py-3 text-foreground max-w-[220px] truncate cursor-pointer" onClick={() => navigate(`/ticket/${t.id}`)}>{t.title}</td>
                  <td className="px-4 py-3 text-xs text-secondary-foreground capitalize cursor-pointer" onClick={() => navigate(`/ticket/${t.id}`)}>{t.ticket_type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3"><PriorityIndicator priority={t.priority} showLabel={false} /></td>
                  <td className="px-4 py-3"><SlaIndicator dueDate={t.due_date} status={t.status} showLabel compact /></td>
                  <td className="px-4 py-3 text-secondary-foreground">{t.requester_name}</td>
                  <td className="px-4 py-3 text-secondary-foreground">{t.unit}</td>
                  <td className="px-4 py-3 text-secondary-foreground">{t.assigned_team}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={canModify ? 11 : 10} className="px-4 py-8 text-center text-muted-foreground">No tickets found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} ticket{selected.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected tickets and all their comments, attachments, and audit trails. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
