import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { runQuery, runExec } from './database';

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: string;
  team_id: number | null;
  unit: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('current_user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const results = await runQuery(
      'SELECT id, username, display_name, role, team_id, unit FROM users WHERE username = ? AND password_hash = ? AND active = 1',
      [username, password]
    );
    if (results.length > 0) {
      const u = results[0] as User;
      setUser(u);
      localStorage.setItem('current_user', JSON.stringify(u));
      await runExec(
        "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('user', ?, 'login', ?, ?)",
        [u.id, u.id, `${u.display_name} logged in`]
      );
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('current_user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
