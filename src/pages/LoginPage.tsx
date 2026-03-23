import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Shield, Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const success = await login(username, password);
    if (!success) setError('Invalid credentials');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-lg bg-primary mx-auto mb-4 flex items-center justify-center">
            <Shield className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide">SENTINEL</h1>
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
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 panel p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Demo Accounts</p>
          <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-secondary-foreground">
            <span>admin / admin123</span>
            <span className="text-primary">Super Admin</span>
            <span>g1_officer / pass123</span>
            <span className="text-primary">G1 Triage</span>
            <span>unit_alpha / pass123</span>
            <span className="text-primary">Unit User</span>
            <span>miso_officer / pass123</span>
            <span className="text-primary">MISO Officer</span>
          </div>
        </div>
      </div>
    </div>
  );
}
