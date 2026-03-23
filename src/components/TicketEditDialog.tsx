import { useState } from 'react';
import { runExec } from '@/lib/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Pencil } from 'lucide-react';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const SEVERITIES = ['low', 'normal', 'high', 'critical'];
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

interface TicketEditData {
  id: number;
  title: string;
  description: string;
  ticket_type: string;
  priority: string;
  severity: string;
  due_date: string;
  module: string;
}

interface Props {
  ticket: TicketEditData;
  userId: number;
  onSaved: () => void;
}

export default function TicketEditDialog({ ticket, userId, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: ticket.title,
    description: ticket.description,
    ticket_type: ticket.ticket_type,
    priority: ticket.priority,
    severity: ticket.severity,
    due_date: ticket.due_date || '',
    module: ticket.module || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleOpen = () => {
    setForm({
      title: ticket.title,
      description: ticket.description,
      ticket_type: ticket.ticket_type,
      priority: ticket.priority,
      severity: ticket.severity,
      due_date: ticket.due_date || '',
      module: ticket.module || '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const changes: string[] = [];
    if (form.title !== ticket.title) changes.push('title');
    if (form.description !== ticket.description) changes.push('description');
    if (form.priority !== ticket.priority) changes.push(`priority → ${form.priority}`);
    if (form.severity !== ticket.severity) changes.push(`severity → ${form.severity}`);
    if (form.ticket_type !== ticket.ticket_type) changes.push(`type → ${form.ticket_type}`);
    if (form.due_date !== (ticket.due_date || '')) changes.push(`due date → ${form.due_date || 'cleared'}`);
    if (form.module !== (ticket.module || '')) changes.push(`module → ${form.module || 'cleared'}`);

    await runExec(
      `UPDATE tickets SET title=?, description=?, ticket_type=?, priority=?, severity=?, due_date=?, module=?, updated_at=datetime('now') WHERE id=?`,
      [form.title, form.description, form.ticket_type, form.priority, form.severity, form.due_date || null, form.module || null, ticket.id]
    );

    if (changes.length > 0) {
      await runExec(
        "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('ticket', ?, 'edited', ?, ?)",
        [ticket.id, userId, `Edited: ${changes.join(', ')}`]
      );
    }

    setSaving(false);
    setOpen(false);
    onSaved();
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleOpen} className="text-xs">
        <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Title *</label>
              <Input value={form.title} onChange={e => set('title', e.target.value)} className="bg-secondary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
              <Textarea value={form.description} onChange={e => set('description', e.target.value)} className="bg-secondary min-h-[100px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                <Select value={form.ticket_type} onValueChange={v => set('ticket_type', v)}>
                  <SelectTrigger className="bg-secondary text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</label>
                <Select value={form.priority} onValueChange={v => set('priority', v)}>
                  <SelectTrigger className="bg-secondary text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Severity</label>
                <Select value={form.severity} onValueChange={v => set('severity', v)}>
                  <SelectTrigger className="bg-secondary text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map(s => <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Due Date</label>
                <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="bg-secondary text-xs" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.title.trim() || saving}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
