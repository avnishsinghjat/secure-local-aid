import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runQuery } from '@/lib/database';
import { useAuth } from '@/lib/auth-context';
import StatusBadge from '@/components/StatusBadge';
import PriorityIndicator from '@/components/PriorityIndicator';
import SlaIndicator from '@/components/SlaIndicator';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Search, Filter } from 'lucide-react';

interface TicketRow {
  id: number; ticket_number: string; title: string; status: string;
  priority: string; unit: string; created_at: string;
  requester_name: string; assigned_team: string; ticket_type: string;
}

const STATUSES = ['all', 'draft', 'submitted', 'under_triage', 'allocated', 'forwarded', 'pending_validation', 'pending_documents', 'in_progress', 'awaiting_response', 'resolved', 'rejected', 'closed', 'reopened'];
const PRIORITIES_FILTER = ['all', 'critical', 'high', 'medium', 'low'];

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

  useEffect(() => {
    async function load() {
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
        SELECT t.id, t.ticket_number, t.title, t.status, t.priority, t.unit, t.created_at, t.ticket_type,
               u.display_name as requester_name,
               COALESCE(tm.name, 'Unassigned') as assigned_team
        FROM tickets t
        LEFT JOIN users u ON t.requester_id = u.id
        LEFT JOIN teams tm ON t.assigned_team_id = tm.id
        ${where}
        ORDER BY t.created_at DESC
      `, params.length ? params : undefined);
      setTickets(results as TicketRow[]);
    }
    load();
  }, [mode, user]);

  const titles: Record<string, string> = {
    all: 'All Tickets', my: 'My Tickets', queue: 'Incoming Queue', team: 'Team Queue',
  };

  const filtered = tickets.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.ticket_number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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

      {/* Table */}
      <div className="panel">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-4 py-2">Ticket</th>
                <th className="text-left px-4 py-2">Title</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Priority</th>
                <th className="text-left px-4 py-2">Requester</th>
                <th className="text-left px-4 py-2">Unit</th>
                <th className="text-left px-4 py-2">Team</th>
                <th className="text-left px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="data-table-row" onClick={() => navigate(`/ticket/${t.id}`)}>
                  <td className="px-4 py-3 ticket-id">{t.ticket_number}</td>
                  <td className="px-4 py-3 text-foreground max-w-[220px] truncate">{t.title}</td>
                  <td className="px-4 py-3 text-xs text-secondary-foreground capitalize">{t.ticket_type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3"><PriorityIndicator priority={t.priority} showLabel={false} /></td>
                  <td className="px-4 py-3 text-secondary-foreground">{t.requester_name}</td>
                  <td className="px-4 py-3 text-secondary-foreground">{t.unit}</td>
                  <td className="px-4 py-3 text-secondary-foreground">{t.assigned_team}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No tickets found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
