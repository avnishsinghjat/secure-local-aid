import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { runQuery } from '@/lib/database';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '@/components/StatusBadge';
import PriorityIndicator from '@/components/PriorityIndicator';
import SlaIndicator from '@/components/SlaIndicator';
import {
  Ticket, AlertTriangle, Clock, CheckCircle2,
  ArrowUpRight, Users, Timer
} from 'lucide-react';

interface Stats {
  total: number;
  open: number;
  critical: number;
  resolved: number;
  myTickets: number;
  unassigned: number;
  overdue: number;
}

interface TicketRow {
  id: number;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  unit: string;
  created_at: string;
  due_date: string;
  requester_name: string;
  assigned_team: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ total: 0, open: 0, critical: 0, resolved: 0, myTickets: 0, unassigned: 0, overdue: 0 });
  const [recentTickets, setRecentTickets] = useState<TicketRow[]>([]);

  useEffect(() => {
    async function load() {
      const [total] = await runQuery('SELECT COUNT(*) as c FROM tickets');
      const [open] = await runQuery("SELECT COUNT(*) as c FROM tickets WHERE status NOT IN ('closed','resolved','rejected')");
      const [critical] = await runQuery("SELECT COUNT(*) as c FROM tickets WHERE priority = 'critical' AND status NOT IN ('closed','resolved','rejected')");
      const [resolved] = await runQuery("SELECT COUNT(*) as c FROM tickets WHERE status = 'resolved'");
      const [mine] = await runQuery('SELECT COUNT(*) as c FROM tickets WHERE requester_id = ? OR assigned_user_id = ?', [user!.id, user!.id]);
      const [unassigned] = await runQuery('SELECT COUNT(*) as c FROM tickets WHERE assigned_team_id IS NULL AND assigned_user_id IS NULL AND status NOT IN (\'draft\',\'closed\',\'rejected\')');
      const [overdue] = await runQuery("SELECT COUNT(*) as c FROM tickets WHERE due_date < date('now') AND status NOT IN ('closed','resolved','rejected')");

      setStats({
        total: total.c, open: open.c, critical: critical.c,
        resolved: resolved.c, myTickets: mine.c, unassigned: unassigned.c, overdue: overdue.c,
      });

      const recent = await runQuery(`
        SELECT t.id, t.ticket_number, t.title, t.status, t.priority, t.unit, t.created_at, t.due_date,
               u.display_name as requester_name,
               COALESCE(tm.name, 'Unassigned') as assigned_team
        FROM tickets t
        LEFT JOIN users u ON t.requester_id = u.id
        LEFT JOIN teams tm ON t.assigned_team_id = tm.id
        ORDER BY t.created_at DESC LIMIT 10
      `);
      setRecentTickets(recent as TicketRow[]);
    }
    load();
  }, [user]);

  const statCards = [
    { label: 'Total Tickets', value: stats.total, icon: Ticket, color: 'text-foreground' },
    { label: 'Open', value: stats.open, icon: ArrowUpRight, color: 'text-info' },
    { label: 'Critical', value: stats.critical, icon: AlertTriangle, color: 'text-critical' },
    { label: 'Resolved', value: stats.resolved, icon: CheckCircle2, color: 'text-success' },
    { label: 'My Tickets', value: stats.myTickets, icon: Clock, color: 'text-primary' },
    { label: 'Overdue', value: stats.overdue, icon: Timer, color: 'text-critical' },
    { label: 'Unassigned', value: stats.unassigned, icon: Users, color: 'text-warning' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Operations Dashboard</h2>
        <p className="text-sm text-muted-foreground">Welcome back, {user?.display_name}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className={`stat-value ${s.color}`}>{s.value}</div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Recent Tickets */}
      <div className="panel">
        <div className="panel-header">
          <h3 className="text-sm font-semibold text-foreground">Recent Tickets</h3>
          <button onClick={() => navigate('/search')} className="text-xs text-primary hover:underline">View All</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-4 py-2">Ticket</th>
                <th className="text-left px-4 py-2">Title</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Priority</th>
                <th className="text-left px-4 py-2">SLA</th>
                <th className="text-left px-4 py-2">Requester</th>
                <th className="text-left px-4 py-2">Team</th>
                <th className="text-left px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentTickets.map((t) => (
                <tr key={t.id} className="data-table-row" onClick={() => navigate(`/ticket/${t.id}`)}>
                  <td className="px-4 py-3 ticket-id">{t.ticket_number}</td>
                  <td className="px-4 py-3 text-foreground max-w-[250px] truncate">{t.title}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3"><PriorityIndicator priority={t.priority} showLabel={false} /></td>
                  <td className="px-4 py-3"><SlaIndicator dueDate={t.due_date} status={t.status} showLabel compact /></td>
                  <td className="px-4 py-3 text-secondary-foreground">{t.requester_name}</td>
                  <td className="px-4 py-3 text-secondary-foreground">{t.assigned_team}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
