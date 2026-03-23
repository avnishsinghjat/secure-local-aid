import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { resetDatabase } from '@/lib/database';
import { Shield, Lock, User, Sun, Moon, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DEMO_ACCOUNTS = [
  { user: 'admin', pass: 'admin123', role: 'Super Admin' },
  { user: 'g1_officer', pass: 'pass123', role: 'G1 Triage' },
  { user: 'unit_alpha', pass: 'pass123', role: 'Unit User' },
  { user: 'unit_bravo', pass: 'pass123', role: 'Unit User' },
  { user: 'miso_officer', pass: 'pass123', role: 'MISO Officer' },
  { user: 'it_lead', pass: 'pass123', role: 'Resolver' },
  { user: 'net_tech', pass: 'pass123', role: 'Resolver' },
  { user: 'auditor', pass: 'pass123', role: 'Auditor' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const success = await login(username, password);
      if (!success) setError('Invalid credentials or account disabled');
    } catch (err) {
      setError('System initialization in progress. Please try again.');
      console.error('Login error:', err);
    }
    setLoading(false);
  };

  const quickLogin = async (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError('');
    setLoading(true);
    try {
      const success = await login(user, pass);
      if (!success) setError('Login failed. Try resetting the database.');
    } catch (err) {
      setError('System initialization in progress. Please try again.');
    }
    setLoading(false);
  };

  const handleReset = async () => {
    await resetDatabase();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4 flex gap-2">
        <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-lg bg-primary mx-auto mb-4 flex items-center justify-center">
            <Shield className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide">TICKETDESK</h1>
          <p className="text-xs text-muted-foreground tracking-[0.3em] uppercase mt-1">Secure Ticketing System</p>
        </div>

        <form onSubmit={handleSubmit} className="panel p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-10 bg-secondary border-border"
                placeholder="Enter username"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-secondary border-border"
                placeholder="Enter password"
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-4 panel p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Quick Login — Demo Accounts</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.user}
                onClick={() => quickLogin(acc.user, acc.pass)}
                className="text-left px-3 py-2 rounded border border-border hover:bg-secondary transition-colors"
              >
                <span className="text-xs font-mono text-foreground block">{acc.user}</span>
                <span className="text-[10px] text-primary">{acc.role}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 text-center">
          <button
            onClick={handleReset}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset Database (fresh seed data)
          </button>
        </div>
      </div>
    </div>
  );
}
