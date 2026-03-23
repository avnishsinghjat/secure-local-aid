import { useEffect, useState } from 'react';
import { runQuery, runExec } from '@/lib/database';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Plus, Pencil, Ban, CheckCircle2, ShieldAlert, UserPlus, Building2 } from 'lucide-react';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'g1_triage', label: 'G1 / Triage' },
  { value: 'resolver', label: 'Resolver' },
  { value: 'miso_officer', label: 'MISO Officer' },
  { value: 'unit_user', label: 'Unit User' },
  { value: 'auditor', label: 'Auditor' },
];

interface UserRow {
  id: number; username: string; display_name: string; role: string;
  team_id: number | null; unit: string; active: number; created_at: string;
  team_name: string | null;
}

interface TeamRow {
  id: number; name: string; description: string; created_at: string; member_count: number;
}

const emptyUser = { username: '', password: '', display_name: '', role: 'unit_user', team_id: '', unit: '' };
const emptyTeam = { name: '', description: '' };

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [userDialog, setUserDialog] = useState(false);
  const [teamDialog, setTeamDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editingTeam, setEditingTeam] = useState<number | null>(null);
  const [userForm, setUserForm] = useState(emptyUser);
  const [teamForm, setTeamForm] = useState(emptyTeam);

  const loadData = async () => {
    const u = await runQuery(`
      SELECT u.*, COALESCE(t.name, '') as team_name
      FROM users u LEFT JOIN teams t ON u.team_id = t.id ORDER BY u.id
    `);
    setUsers(u as UserRow[]);
    const t = await runQuery(`
      SELECT t.*, (SELECT COUNT(*) FROM users WHERE team_id = t.id) as member_count
      FROM teams t ORDER BY t.id
    `);
    setTeams(t as TeamRow[]);
  };

  useEffect(() => { loadData(); }, []);

  const setU = (k: string, v: string) => setUserForm(p => ({ ...p, [k]: v }));
  const setT = (k: string, v: string) => setTeamForm(p => ({ ...p, [k]: v }));

  const openCreateUser = () => { setEditingUser(null); setUserForm(emptyUser); setUserDialog(true); };
  const openEditUser = (u: UserRow) => {
    setEditingUser(u.id);
    setUserForm({ username: u.username, password: '', display_name: u.display_name, role: u.role, team_id: u.team_id ? String(u.team_id) : '', unit: u.unit || '' });
    setUserDialog(true);
  };
  const openCreateTeam = () => { setEditingTeam(null); setTeamForm(emptyTeam); setTeamDialog(true); };
  const openEditTeam = (t: TeamRow) => { setEditingTeam(t.id); setTeamForm({ name: t.name, description: t.description || '' }); setTeamDialog(true); };

  const saveUser = async () => {
    if (!userForm.username.trim() || !userForm.display_name.trim()) return;
    const teamId = userForm.team_id ? Number(userForm.team_id) : null;
    if (editingUser) {
      if (userForm.password) {
        await runExec('UPDATE users SET username=?, password_hash=?, display_name=?, role=?, team_id=?, unit=? WHERE id=?',
          [userForm.username, userForm.password, userForm.display_name, userForm.role, teamId, userForm.unit, editingUser]);
      } else {
        await runExec('UPDATE users SET username=?, display_name=?, role=?, team_id=?, unit=? WHERE id=?',
          [userForm.username, userForm.display_name, userForm.role, teamId, userForm.unit, editingUser]);
      }
      await runExec("INSERT INTO audit_log (entity_type,entity_id,action,user_id,details) VALUES ('user',?,'updated',?,?)",
        [editingUser, currentUser!.id, `User ${userForm.display_name} updated`]);
    } else {
      if (!userForm.password) return;
      await runExec('INSERT INTO users (username,password_hash,display_name,role,team_id,unit) VALUES (?,?,?,?,?,?)',
        [userForm.username, userForm.password, userForm.display_name, userForm.role, teamId, userForm.unit]);
      await runExec("INSERT INTO audit_log (entity_type,entity_id,action,user_id,details) VALUES ('user',last_insert_rowid(),'created',?,?)",
        [currentUser!.id, `User ${userForm.display_name} created`]);
    }
    setUserDialog(false);
    loadData();
  };

  const toggleUserActive = async (u: UserRow) => {
    const newActive = u.active ? 0 : 1;
    await runExec('UPDATE users SET active=? WHERE id=?', [newActive, u.id]);
    await runExec("INSERT INTO audit_log (entity_type,entity_id,action,user_id,details) VALUES ('user',?,?,?,?)",
      [u.id, newActive ? 'enabled' : 'disabled', currentUser!.id, `User ${u.display_name} ${newActive ? 'enabled' : 'disabled'}`]);
    loadData();
  };

  const saveTeam = async () => {
    if (!teamForm.name.trim()) return;
    if (editingTeam) {
      await runExec('UPDATE teams SET name=?, description=? WHERE id=?', [teamForm.name, teamForm.description, editingTeam]);
    } else {
      await runExec('INSERT INTO teams (name, description) VALUES (?,?)', [teamForm.name, teamForm.description]);
    }
    setTeamDialog(false);
    loadData();
  };

  const roleLabel = (r: string) => ROLES.find(x => x.value === r)?.label || r;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Users & Teams</h2>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-secondary">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>

        {/* USERS TAB */}
        <TabsContent value="users" className="space-y-3 mt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreateUser}><UserPlus className="w-4 h-4 mr-1.5" />Add User</Button>
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2">Username</th>
                  <th className="text-left px-4 py-2">Display Name</th>
                  <th className="text-left px-4 py-2">Role</th>
                  <th className="text-left px-4 py-2">Team</th>
                  <th className="text-left px-4 py-2">Unit</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b hover:bg-secondary/30">
                    <td className="px-4 py-3 font-mono text-xs text-primary">{u.username}</td>
                    <td className="px-4 py-3 text-foreground">{u.display_name}</td>
                    <td className="px-4 py-3 text-xs text-secondary-foreground">{roleLabel(u.role)}</td>
                    <td className="px-4 py-3 text-xs text-secondary-foreground">{u.team_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-secondary-foreground">{u.unit || '—'}</td>
                    <td className="px-4 py-3">
                      {u.active
                        ? <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="w-3 h-3" />Active</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-destructive"><Ban className="w-3 h-3" />Disabled</span>}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => openEditUser(u)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleUserActive(u)}>
                        {u.active ? <Ban className="w-3.5 h-3.5 text-destructive" /> : <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* TEAMS TAB */}
        <TabsContent value="teams" className="space-y-3 mt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreateTeam}><Plus className="w-4 h-4 mr-1.5" />Add Team</Button>
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-left px-4 py-2">Members</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(t => (
                  <tr key={t.id} className="border-b hover:bg-secondary/30">
                    <td className="px-4 py-3 text-foreground font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-xs text-secondary-foreground">{t.description || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-primary">{t.member_count}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEditTeam(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* User Dialog */}
      <Dialog open={userDialog} onOpenChange={setUserDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Create User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Username *</label>
              <Input value={userForm.username} onChange={e => setU('username', e.target.value)} className="bg-secondary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">{editingUser ? 'New Password (leave blank to keep)' : 'Password *'}</label>
              <Input type="password" value={userForm.password} onChange={e => setU('password', e.target.value)} className="bg-secondary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Display Name *</label>
              <Input value={userForm.display_name} onChange={e => setU('display_name', e.target.value)} className="bg-secondary" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Role</label>
                <Select value={userForm.role} onValueChange={v => setU('role', v)}>
                  <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Team</label>
                <Select value={userForm.team_id} onValueChange={v => setU('team_id', v)}>
                  <SelectTrigger className="bg-secondary"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {teams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Unit</label>
              <Input value={userForm.unit} onChange={e => setU('unit', e.target.value)} className="bg-secondary" placeholder="e.g., 14 Rajput" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialog(false)}>Cancel</Button>
            <Button onClick={saveUser}>{editingUser ? 'Save Changes' : 'Create User'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Dialog */}
      <Dialog open={teamDialog} onOpenChange={setTeamDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingTeam ? 'Edit Team' : 'Create Team'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Team Name *</label>
              <Input value={teamForm.name} onChange={e => setT('name', e.target.value)} className="bg-secondary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Description</label>
              <Input value={teamForm.description} onChange={e => setT('description', e.target.value)} className="bg-secondary" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamDialog(false)}>Cancel</Button>
            <Button onClick={saveTeam}>{editingTeam ? 'Save Changes' : 'Create Team'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
