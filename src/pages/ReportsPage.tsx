import { useEffect, useState } from 'react';
import { runQuery } from '@/lib/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell,
  ResponsiveContainer,
} from 'recharts';

interface StatusData { name: string; count: number }
interface PriorityData { name: string; count: number }
interface TeamData { name: string; count: number }
interface ResolutionData { range: string; count: number }

const STATUS_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899'];
const PRIORITY_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#6b7280'];

const statusConfig: ChartConfig = { count: { label: 'Tickets', color: 'hsl(var(--primary))' } };
const priorityConfig: ChartConfig = { count: { label: 'Tickets', color: 'hsl(var(--primary))' } };
const teamConfig: ChartConfig = { count: { label: 'Tickets', color: 'hsl(var(--primary))' } };
const resConfig: ChartConfig = { count: { label: 'Tickets', color: 'hsl(var(--accent))' } };

export default function ReportsPage() {
  const [byStatus, setByStatus] = useState<StatusData[]>([]);
  const [byPriority, setByPriority] = useState<PriorityData[]>([]);
  const [byTeam, setByTeam] = useState<TeamData[]>([]);
  const [byResolution, setByResolution] = useState<ResolutionData[]>([]);

  useEffect(() => {
    (async () => {
      const s = await runQuery(`SELECT status as name, COUNT(*) as count FROM tickets GROUP BY status ORDER BY count DESC`);
      setByStatus(s);

      const p = await runQuery(`SELECT priority as name, COUNT(*) as count FROM tickets GROUP BY priority ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END`);
      setByPriority(p);

      const t = await runQuery(`SELECT COALESCE(te.name, 'Unassigned') as name, COUNT(*) as count FROM tickets tk LEFT JOIN teams te ON tk.assigned_team_id = te.id GROUP BY te.name ORDER BY count DESC`);
      setByTeam(t);

      const r = await runQuery(`
        SELECT
          CASE
            WHEN resolved_at IS NULL THEN 'Unresolved'
            WHEN (julianday(resolved_at) - julianday(created_at)) < 1 THEN '< 1 day'
            WHEN (julianday(resolved_at) - julianday(created_at)) < 3 THEN '1-3 days'
            WHEN (julianday(resolved_at) - julianday(created_at)) < 7 THEN '3-7 days'
            ELSE '7+ days'
          END as range,
          COUNT(*) as count
        FROM tickets GROUP BY range ORDER BY
          CASE range WHEN '< 1 day' THEN 1 WHEN '1-3 days' THEN 2 WHEN '3-7 days' THEN 3 WHEN '7+ days' THEN 4 ELSE 5 END
      `);
      setByResolution(r);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-mono text-foreground tracking-tight">Reports &amp; Analytics</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono">Tickets by Status</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={statusConfig} className="h-[280px] w-full">
              <PieChart>
                <Pie data={byStatus} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, count }) => `${name} (${count})`}>
                  {byStatus.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Priority */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono">Tickets by Priority</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={priorityConfig} className="h-[280px] w-full">
              <BarChart data={byPriority}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {byPriority.map((_, i) => <Cell key={i} fill={PRIORITY_COLORS[i % PRIORITY_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Team */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono">Tickets by Team</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={teamConfig} className="h-[280px] w-full">
              <BarChart data={byTeam} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Resolution Time */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono">Resolution Time Distribution</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={resConfig} className="h-[280px] w-full">
              <BarChart data={byResolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="range" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
