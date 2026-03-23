import { useAuth } from '@/lib/auth-context';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Ticket, Inbox, Users, ClipboardList,
  Search, FileText, Shield, Settings, LogOut, Bell
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: 'all' },
  { icon: Inbox, label: 'Incoming Queue', path: '/queue', roles: 'super_admin,g1_triage,admin' },
  { icon: Ticket, label: 'My Tickets', path: '/my-tickets', roles: 'all' },
  { icon: ClipboardList, label: 'Team Queue', path: '/team-queue', roles: 'resolver,miso_officer,super_admin,admin' },
  { icon: Search, label: 'All Tickets', path: '/search', roles: 'all' },
  { icon: FileText, label: 'Create Ticket', path: '/create', roles: 'unit_user,super_admin,admin,g1_triage' },
  { icon: Users, label: 'Users & Teams', path: '/admin/users', roles: 'super_admin,admin' },
  { icon: Shield, label: 'Audit Log', path: '/audit', roles: 'super_admin,auditor' },
  { icon: Settings, label: 'Settings', path: '/settings', roles: 'super_admin' },
];

export default function AppSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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

  return (
    <aside className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground tracking-wide">SENTINEL</h1>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Ticketing System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
