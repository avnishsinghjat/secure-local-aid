import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { runExec, resetDatabase } from '@/lib/database';
import { getLMStudioConfig, saveLMStudioConfig, testConnection, LMStudioConfig } from '@/lib/lmstudio';
import { clearAllEmbeddings, getTotalChunks } from '@/lib/vector-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Settings, Sun, Moon, Shield, Database, Bell, Palette,
  RotateCcw, Save, User, Lock, AlertTriangle, Cpu, CheckCircle2,
  XCircle, Loader2, Layers, RefreshCw, Wifi
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

  // Local AI state
  const [lmConfig, setLmConfig] = useState<LMStudioConfig>(() => getLMStudioConfig());
  const [lmTesting, setLmTesting] = useState(false);
  const [lmStatus, setLmStatus] = useState<{ ok: boolean; models: string[] } | null>(null);
  const [totalChunks, setTotalChunks] = useState(0);
  const [clearingEmbeddings, setClearingEmbeddings] = useState(false);

  useEffect(() => {
    getTotalChunks().then(setTotalChunks);
  }, []);

  const handleTestConnection = async () => {
    setLmTesting(true);
    setLmStatus(null);
    const result = await testConnection(lmConfig.baseUrl);
    setLmStatus(result);
    setLmTesting(false);
  };

  const handleSaveLMConfig = () => {
    saveLMStudioConfig(lmConfig);
    toast({ title: 'Local AI settings saved', description: 'Configuration saved locally.' });
  };

  const handleClearEmbeddings = async () => {
    setClearingEmbeddings(true);
    await clearAllEmbeddings();
    setTotalChunks(0);
    setClearingEmbeddings(false);
    toast({ title: 'Embeddings cleared', description: 'All vector embeddings have been deleted from local storage.' });
  };

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
        <TabsList className="bg-muted flex-wrap h-auto gap-1">
          <TabsTrigger value="profile" className="gap-1.5"><User className="w-3.5 h-3.5" /> Profile</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="w-3.5 h-3.5" /> Appearance</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="w-3.5 h-3.5" /> Notifications</TabsTrigger>
          <TabsTrigger value="preferences" className="gap-1.5"><Settings className="w-3.5 h-3.5" /> Preferences</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><Cpu className="w-3.5 h-3.5" /> AI / Local AI</TabsTrigger>
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

        {/* AI / Local AI Tab */}
        <TabsContent value="ai" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Cpu className="w-4 h-4" /> Local AI Connection
              </CardTitle>
              <CardDescription>
                Configure your local AI instance for AI features. All processing runs offline.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Connection status */}
              {lmStatus && (
                <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${lmStatus.ok ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
                  {lmStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <div>
                    <p className="font-medium">{lmStatus.ok ? 'Connected successfully' : 'Connection failed'}</p>
                    {lmStatus.ok && lmStatus.models.length > 0 && (
                      <p className="text-xs mt-0.5 opacity-80">{lmStatus.models.length} model(s) available</p>
                    )}
                    {!lmStatus.ok && (
                      <p className="text-xs mt-0.5 opacity-80">Ensure Local AI is running with the server started on the configured port.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-foreground">Base URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={lmConfig.baseUrl}
                    onChange={(e) => setLmConfig((p) => ({ ...p, baseUrl: e.target.value }))}
                    placeholder="http://localhost:1234/v1"
                    className="font-mono text-sm"
                  />
                  <Button variant="outline" onClick={handleTestConnection} disabled={lmTesting} className="gap-2 shrink-0">
                    {lmTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    Test
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Default: http://localhost:1234/v1 (common Local AI default port)</p>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Chat Model</Label>
                  <Input
                    value={lmConfig.chatModel}
                    onChange={(e) => setLmConfig((p) => ({ ...p, chatModel: e.target.value }))}
                    placeholder="Leave blank to use the loaded model"
                    className="font-mono text-sm"
                  />
                  {lmStatus?.ok && lmStatus.models.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      {lmStatus.models.map((m) => (
                        <Badge
                          key={m}
                          variant="outline"
                          className="text-xs cursor-pointer hover:bg-primary/10"
                          onClick={() => setLmConfig((p) => ({ ...p, chatModel: m }))}
                        >
                          {m}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Used for chat, ticket analysis, and SQL generation.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">Embedding Model</Label>
                  <Input
                    value={lmConfig.embeddingModel}
                    onChange={(e) => setLmConfig((p) => ({ ...p, embeddingModel: e.target.value }))}
                    placeholder="Leave blank to use the loaded model"
                    className="font-mono text-sm"
                  />
                  {lmStatus?.ok && lmStatus.models.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      {lmStatus.models.map((m) => (
                        <Badge
                          key={m}
                          variant="outline"
                          className="text-xs cursor-pointer hover:bg-primary/10"
                          onClick={() => setLmConfig((p) => ({ ...p, embeddingModel: m }))}
                        >
                          {m}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Used for document indexing and knowledge base search. Use a dedicated embedding model like <code className="bg-muted px-1 rounded">nomic-embed-text</code> for best results.</p>
                </div>
              </div>

              <Separator />

              <Button onClick={handleSaveLMConfig} className="gap-2">
                <Save className="w-4 h-4" /> Save Local AI Settings
              </Button>
            </CardContent>
          </Card>

          {/* Vector Store Management */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4" /> Vector Store
              </CardTitle>
              <CardDescription>Manage local embeddings generated from knowledge base documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Stored Embeddings</p>
                    <p className="text-xs text-muted-foreground">{totalChunks} text chunks indexed</p>
                  </div>
                </div>
                <Badge variant="outline" className="font-mono">{totalChunks} chunks</Badge>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                <p className="text-xs font-medium text-foreground">How it works</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>• Documents are split into chunks and embedded via Local AI</li>
                  <li>• Embeddings are stored locally in your browser (IndexedDB)</li>
                  <li>• No data is sent to any external server</li>
                  <li>• Use the Knowledge Base page to process documents</li>
                </ul>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10" disabled={clearingEmbeddings || totalChunks === 0}>
                    {clearingEmbeddings ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Clear All Embeddings
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all embeddings?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete all {totalChunks} stored vector chunks. Documents will need to be re-processed for AI search. The documents themselves are not deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearEmbeddings} className="bg-destructive text-destructive-foreground">
                      Clear Embeddings
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* Setup Guide */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Quick Setup Guide</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-muted-foreground">
                {[
                  'Install and open your Local AI runtime',
                  'In Local AI, download a chat model (e.g. Llama 3.2, Mistral, Phi-3)',
                  'For document search, also load an embedding model (e.g. nomic-embed-text)',
                  'Start the local server in Local AI (port 1234 by default)',
                  'Use the Test button above to verify the connection',
                  'Go to Knowledge Base and click the brain icon to index documents',
                  'Use the AI Assistant (chat page) to query your data',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
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
                    ['Application', 'TICKETDESK Ticketing System'],
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
