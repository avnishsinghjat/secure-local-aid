import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { runExec, getLastInsertId, generateTicketNumber } from '@/lib/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { ArrowLeft, Send } from 'lucide-react';

const TICKET_TYPES = [
  { value: 'general', label: 'General Issue' },
  { value: 'observation', label: 'Observation' },
  { value: 'issue_voucher', label: 'Issue Voucher' },
  { value: 'deposit_voucher', label: 'Deposit Voucher' },
  { value: 'transfer_voucher', label: 'Transfer Voucher' },
  { value: 'equipment_addition', label: 'Equipment Addition' },
  { value: 'equipment_removal', label: 'Equipment Removal' },
  { value: 'access_request', label: 'Access Request' },
  { value: 'incident', label: 'Incident / Fault Report' },
];

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const SEVERITIES = ['low', 'normal', 'high', 'critical'];
const MODULES = ['Infrastructure', 'Communications', 'Equipment', 'Software', 'Security', 'Transport', 'Stores', 'Administration'];

export default function CreateTicketPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '', description: '', ticket_type: 'general',
    priority: 'medium', severity: 'normal', module: '', sub_module: '',
    observation_type: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const submit = async () => {
    if (!form.title.trim()) return;
    setSubmitting(true);
    const ticketNum = generateTicketNumber();
    await runExec(
      `INSERT INTO tickets (ticket_number, title, description, ticket_type, status, priority, severity, module, sub_module, observation_type, requester_id, unit)
       VALUES (?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?)`,
      [ticketNum, form.title, form.description, form.ticket_type, form.priority, form.severity, form.module, form.sub_module, form.observation_type, user!.id, user!.unit]
    );
    const newId = await getLastInsertId();
    await runExec(
      "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('ticket', ?, 'created', ?, ?)",
      [newId, user!.id, `Ticket ${ticketNum} created`]
    );
    navigate(`/ticket/${newId}`);
  };

  const isVoucherType = ['issue_voucher', 'deposit_voucher', 'transfer_voucher'].includes(form.ticket_type);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-foreground">Create New Ticket</h2>
      </div>

      <div className="panel p-6 space-y-5">
        {/* Type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ticket Type</label>
          <Select value={form.ticket_type} onValueChange={(v) => set('ticket_type', v)}>
            <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TICKET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Title *</label>
          <Input value={form.title} onChange={e => set('title', e.target.value)} className="bg-secondary" placeholder="Brief summary of the issue" />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
          <Textarea value={form.description} onChange={e => set('description', e.target.value)} className="bg-secondary min-h-[120px]" placeholder="Detailed description..." />
        </div>

        {/* Priority & Severity */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</label>
            <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
              <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Severity</label>
            <Select value={form.severity} onValueChange={(v) => set('severity', v)}>
              <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITIES.map(s => <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Module */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Module</label>
          <Select value={form.module} onValueChange={(v) => set('module', v)}>
            <SelectTrigger className="bg-secondary"><SelectValue placeholder="Select module..." /></SelectTrigger>
            <SelectContent>
              {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Voucher-specific fields */}
        {isVoucherType && (
          <div className="space-y-1.5 p-4 rounded bg-surface-elevated border border-primary/20">
            <p className="text-[10px] text-primary uppercase tracking-wider font-semibold mb-2">Voucher Details</p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Observation Type</label>
              <Input value={form.observation_type} onChange={e => set('observation_type', e.target.value)} className="bg-secondary" placeholder="e.g., Equipment Transfer, Addition..." />
            </div>
            <div className="space-y-1.5 mt-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sub-Module</label>
              <Input value={form.sub_module} onChange={e => set('sub_module', e.target.value)} className="bg-secondary" placeholder="e.g., Radio Sets, Generator..." />
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.title.trim() || submitting}>
            <Send className="w-4 h-4 mr-2" /> Submit Ticket
          </Button>
        </div>
      </div>
    </div>
  );
}
