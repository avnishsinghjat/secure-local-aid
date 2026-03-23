import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Ticket, Inbox, Users, ClipboardList,
  Search, FileText, Shield, Settings, LogOut, Bell, BarChart3, Download, Sun, Moon
} from 'lucide-react';
import { getUnreadCount } from '@/lib/notifications';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: 'all' },
  { icon: Inbox, label: 'Incoming Queue', path: '/queue', roles: 'super_admin,g1_triage,admin' },
  { icon: Ticket, label: 'My Tickets', path: '/my-tickets', roles: 'all' },
  { icon: ClipboardList, label: 'Team Queue', path: '/team-queue', roles: 'resolver,miso_officer,super_admin,admin' },
  { icon: Search, label: 'All Tickets', path: '/search', roles: 'all' },
  { icon: FileText, label: 'Create Ticket', path: '/create', roles: 'unit_user,super_admin,admin,g1_triage' },
  { icon: Users, label: 'Users & Teams', path: '/admin/users', roles: 'super_admin,admin' },
  { icon: BarChart3, label: 'Reports', path: '/reports', roles: 'super_admin,admin,auditor' },
  { icon: Download, label: 'Export', path: '/export', roles: 'super_admin,admin,auditor' },
  { icon: Shield, label: 'Audit Log', path: '/audit', roles: 'super_admin,auditor' },
  { icon: Settings, label: 'Settings', path: '/settings', roles: 'super_admin' },
];

export default function AppSidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!user) return;
    const c = await getUnreadCount(user.id);
    setUnread(c);
  }, [user]);

  useEffect(() => {
    refreshUnread();
    const interval = setInterval(refreshUnread, 5000);
    return () => clearInterval(interval);
  }, [refreshUnread]);

  if (!user) return null;

  const filteredNav = navItems.filter(
    item => item.roles === 'all' || item.roles.split(',').includes(user.role)
  );

  const roleLabels: Record<string, string> = {
    super_admin: 'SUPER ADMIN',
    admin: 'ADMIN',
    g1_triage: 'G1 / TRIAGE',
    resolver: 'RESOLVER',
    miso_officer: 'MISO OFFICER',
    unit_user: 'UNIT USER',
    auditor: 'AUDITOR',
  };

  const isNotifActive = location.pathname === '/notifications';

  return (
    <aside className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-bold text-foreground tracking-wide">SENTINEL</h1>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Ticketing System</p>
          </div>
          <button onClick={toggleTheme} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-secondary">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <button
          onClick={() => navigate('/notifications')}
          className={`nav-item w-full text-left ${isNotifActive ? 'nav-item-active' : ''}`}
        >
          <div className="relative">
            <Bell className="w-4 h-4 shrink-0" />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-1">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
          <span>Notifications</span>
          {unread > 0 && (
            <span className="ml-auto text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded font-mono">
              {unread}
            </span>
          )}
        </button>

        <div className="h-px bg-sidebar-border my-2" />

        {filteredNav.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`nav-item w-full text-left ${active ? 'nav-item-active' : ''}`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground">
            {user.display_name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{user.display_name}</p>
            <p className="text-[10px] text-primary tracking-wider">{roleLabels[user.role] || user.role}</p>
          </div>
          <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
