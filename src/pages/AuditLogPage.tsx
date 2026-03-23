import { useEffect, useState } from 'react';
import { runQuery } from '@/lib/database';
import { Shield, Clock } from 'lucide-react';

interface AuditEntry {
  id: number; entity_type: string; entity_id: number; action: string;
  details: string; created_at: string; display_name: string;
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    async function load() {
      const results = await runQuery(`
        SELECT a.*, COALESCE(u.display_name, 'System') as display_name
        FROM audit_log a LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC LIMIT 200
      `);
      setEntries(results as AuditEntry[]);
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Audit Log</h2>
      </div>

      <div className="panel">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-4 py-2">Timestamp</th>
                <th className="text-left px-4 py-2">User</th>
                <th className="text-left px-4 py-2">Entity</th>
                <th className="text-left px-4 py-2">Action</th>
                <th className="text-left px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b hover:bg-secondary/30">
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-foreground text-xs">{e.display_name}</td>
                  <td className="px-4 py-3 text-xs text-secondary-foreground capitalize">{e.entity_type} #{e.entity_id}</td>
                  <td className="px-4 py-3 text-xs text-primary capitalize">{e.action.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-xs text-secondary-foreground">{e.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
