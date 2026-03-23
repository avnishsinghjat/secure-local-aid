import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { getNotifications, markAsRead, markAllAsRead } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { CheckCheck, ExternalLink } from 'lucide-react';

interface Notif {
  id: number; title: string; message: string; read: number;
  ticket_id: number | null; created_at: string;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notif[]>([]);

  const load = async () => {
    if (!user) return;
    const r = await getNotifications(user.id);
    setNotifs(r as Notif[]);
  };

  useEffect(() => { load(); }, [user]);

  const handleRead = async (id: number) => {
    await markAsRead(id);
    load();
  };

  const handleMarkAll = async () => {
    if (!user) return;
    await markAllAsRead(user.id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-mono text-foreground tracking-tight">Notifications</h1>
        <Button variant="outline" size="sm" onClick={handleMarkAll} className="gap-2 text-xs">
          <CheckCheck className="w-3.5 h-3.5" /> Mark all read
        </Button>
      </div>

      <div className="panel divide-y divide-border">
        {notifs.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">No notifications</p>
        )}
        {notifs.map((n) => (
          <div
            key={n.id}
            className={`p-4 flex items-start gap-3 cursor-pointer hover:bg-secondary/50 transition-colors ${n.read ? 'opacity-60' : ''}`}
            onClick={() => {
              if (!n.read) handleRead(n.id);
              if (n.ticket_id) navigate(`/ticket/${n.ticket_id}`);
            }}
          >
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.read ? 'bg-muted' : 'bg-primary'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{n.title}</p>
              <p className="text-xs text-muted-foreground">{n.message}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
            </div>
            {n.ticket_id && <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />}
          </div>
        ))}
      </div>
    </div>
  );
}
