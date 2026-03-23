import { useState } from 'react';
import { runQuery } from '@/lib/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, FileJson } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type ExportTarget = 'tickets' | 'audit';
type ExportFormat = 'csv' | 'json';

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.map(k => `"${k}"`).join(',');
  const lines = rows.map(r =>
    keys.map(k => {
      const v = r[k] ?? '';
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

export default function ExportPage() {
  const [target, setTarget] = useState<ExportTarget>('tickets');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      let rows: any[];
      if (target === 'tickets') {
        rows = await runQuery(`
          SELECT t.ticket_number, t.title, t.description, t.ticket_type, t.status, t.priority, t.severity,
                 t.module, t.sub_module, t.observation_type, t.unit, t.due_date,
                 t.created_at, t.updated_at, t.resolved_at, t.closed_at,
                 u.display_name as requester, te.name as assigned_team,
                 a.display_name as assigned_user
          FROM tickets t
          LEFT JOIN users u ON t.requester_id = u.id
          LEFT JOIN teams te ON t.assigned_team_id = te.id
          LEFT JOIN users a ON t.assigned_user_id = a.id
          ORDER BY t.id DESC
        `);
      } else {
        rows = await runQuery(`
          SELECT al.entity_type, al.entity_id, al.action, al.details, al.created_at,
                 u.display_name as user_name
          FROM audit_log al LEFT JOIN users u ON al.user_id = u.id
          ORDER BY al.id DESC
        `);
      }

      if (!rows.length) {
        toast({ title: 'No data', description: 'Nothing to export.' });
        return;
      }

      const ts = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        downloadFile(toCsv(rows), `${target}_${ts}.csv`, 'text/csv');
      } else {
        downloadFile(JSON.stringify(rows, null, 2), `${target}_${ts}.json`, 'application/json');
      }
      toast({ title: 'Export complete', description: `${rows.length} rows exported.` });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-mono text-foreground tracking-tight">Export Data</h1>
      <Card className="max-w-lg">
        <CardHeader><CardTitle className="text-sm font-mono">Configure Export</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground">Data</label>
            <Select value={target} onValueChange={v => setTarget(v as ExportTarget)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tickets">Tickets</SelectItem>
                <SelectItem value="audit">Audit Log</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground">Format</label>
            <Select value={format} onValueChange={v => setFormat(v as ExportFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleExport} disabled={loading} className="w-full gap-2">
            <Download className="h-4 w-4" />
            {loading ? 'Exporting…' : 'Export'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
