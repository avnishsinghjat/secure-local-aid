import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { runExec, resetDatabase } from '@/lib/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Settings, Sun, Moon, Shield, Database, Bell, Palette,
  RotateCcw, Save, User, Lock, AlertTriangle
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notifTicketAssigned, setNotifTicketAssigned] = useState(true);
  const [notifStatusChange, setNotifStatusChange] = useState(true);
  const [notifComment, setNotifComment] = useState(true);
  const [notifSla, setNotifSla] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState('30');
  const [defaultPriority, setDefaultPriority] = useState('medium');
  const [pageSize, setPageSize] = useState('25');

  const isSuperAdmin = user?.role === 'super_admin';

  const handleUpdateProfile = async () => {
    if (!user || !displayName.trim()) return;
    try {
      await runExec('UPDATE users SET display_name = ? WHERE id = ?', [displayName.trim(), user.id]);
      const stored = localStorage.getItem('current_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.display_name = displayName.trim();
        localStorage.setItem('current_user', JSON.stringify(parsed));
      }
      toast({ title: 'Profile updated', description: 'Your display name has been updated. Re-login to see changes.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to update profile.', variant: 'destructive' });
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 4) {
      toast({ title: 'Error', description: 'Password must be at least 4 characters.', variant: 'destructive' });
      return;
    }
    try {
      await runExec('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?', [newPassword, user.id, currentPassword]);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast({ title: 'Password changed', description: 'Your password has been updated.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to change password.', variant: 'destructive' });
    }
  };

  const handleResetDatabase = async () => {
    await resetDatabase();
    window.location.reload();
  };

  const handleSavePreferences = () => {
    localStorage.setItem('pref_auto_refresh', String(autoRefresh));
    localStorage.setItem('pref_refresh_interval', refreshInterval);
    localStorage.setItem('pref_default_priority', defaultPriority);
    localStorage.setItem('pref_page_size', pageSize);
    toast({ title: 'Preferences saved', description: 'Your preferences have been saved.' });
  };

  const handleSaveNotifications = () => {
    localStorage.setItem('notif_assigned', String(notifTicketAssigned));
    localStorage.setItem('notif_status', String(notifStatusChange));
    localStorage.setItem('notif_comment', String(notifComment));
    localStorage.setItem('notif_sla', String(notifSla));
    toast({ title: 'Notification preferences saved' });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account and application preferences</p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="profile" className="gap-1.5"><User className="w-3.5 h-3.5" /> Profile</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="w-3.5 h-3.5" /> Appearance</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="w-3.5 h-3.5" /> Notifications</TabsTrigger>
          <TabsTrigger value="preferences" className="gap-1.5"><Settings className="w-3.5 h-3.5" /> Preferences</TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="system" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> System</TabsTrigger>
          )}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Profile Information</CardTitle>
              <CardDescription>Update your display name and personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Username</Label>
                  <Input value={user?.username || ''} disabled className="bg-muted text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Role</Label>
                  <Input value={user?.role?.replace(/_/g, ' ').toUpperCase() || ''} disabled className="bg-muted text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Display Name</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your display name" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Unit</Label>
                <Input value={user?.unit || 'N/A'} disabled className="bg-muted text-muted-foreground" />
              </div>
              <Button onClick={handleUpdateProfile} className="gap-2">
                <Save className="w-4 h-4" /> Save Profile
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2"><Lock className="w-4 h-4" /> Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">Current Password</Label>
                <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">New Password</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Confirm New Password</Label>
                  <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleChangePassword} variant="outline" className="gap-2">
                <Lock className="w-4 h-4" /> Change Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Theme</CardTitle>
              <CardDescription>Choose your preferred color scheme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {theme === 'dark' ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
                  <div>
                    <p className="text-sm font-medium text-foreground">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                    <p className="text-xs text-muted-foreground">{theme === 'dark' ? 'Easy on the eyes in low light' : 'Best for well-lit environments'}</p>
                  </div>
                </div>
                <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Notification Preferences</CardTitle>
              <CardDescription>Choose which notifications you want to receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Ticket Assigned', desc: 'When a ticket is assigned to you', checked: notifTicketAssigned, set: setNotifTicketAssigned },
                { label: 'Status Changes', desc: 'When a ticket status is updated', checked: notifStatusChange, set: setNotifStatusChange },
                { label: 'New Comments', desc: 'When someone comments on your ticket', checked: notifComment, set: setNotifComment },
                { label: 'SLA Warnings', desc: 'When a ticket is approaching or past due', checked: notifSla, set: setNotifSla },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch checked={item.checked} onCheckedChange={item.set} />
                </div>
              ))}
              <Separator />
              <Button onClick={handleSaveNotifications} className="gap-2">
                <Save className="w-4 h-4" /> Save Notification Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Application Preferences</CardTitle>
              <CardDescription>Customize your workflow settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-refresh ticket lists</p>
                  <p className="text-xs text-muted-foreground">Automatically refresh ticket data</p>
                </div>
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Refresh Interval (seconds)</Label>
                  <Select value={refreshInterval} onValueChange={setRefreshInterval}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10s</SelectItem>
                      <SelectItem value="30">30s</SelectItem>
                      <SelectItem value="60">60s</SelectItem>
                      <SelectItem value="120">2 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Default Priority</Label>
                  <Select value={defaultPriority} onValueChange={setDefaultPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Tickets Per Page</Label>
                <Select value={pageSize} onValueChange={setPageSize}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <Button onClick={handleSavePreferences} className="gap-2">
                <Save className="w-4 h-4" /> Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab (Super Admin only) */}
        {isSuperAdmin && (
          <TabsContent value="system" className="space-y-4">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2"><Database className="w-4 h-4" /> Database Management</CardTitle>
                <CardDescription>Manage the application database</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Reset Database</p>
                      <p className="text-xs text-muted-foreground">This will permanently delete all data and re-seed with demo data. This action cannot be undone.</p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="gap-2">
                        <RotateCcw className="w-4 h-4" /> Reset Database
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete all tickets, users, comments, audit logs, and attachments. The database will be re-seeded with demo data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResetDatabase} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Reset Everything
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-foreground">System Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Application', 'SENTINEL Ticketing System'],
                    ['Storage', 'SQLite (IndexedDB)'],
                    ['Theme', theme === 'dark' ? 'Dark' : 'Light'],
                    ['Logged in as', user?.display_name || ''],
                    ['Role', user?.role?.replace(/_/g, ' ').toUpperCase() || ''],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1.5 border-b border-border last:border-0">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-medium text-foreground">{v}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
