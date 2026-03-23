import { useState } from 'react';
import { runExec } from '@/lib/database';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';

interface Props {
  ticketId: number;
  ticketNumber: string;
  onDeleted: () => void;
}

export default function TicketDeleteDialog({ ticketId, ticketNumber, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await runExec('DELETE FROM notifications WHERE ticket_id = ?', [ticketId]);
    await runExec('DELETE FROM comments WHERE ticket_id = ?', [ticketId]);
    await runExec("DELETE FROM audit_log WHERE entity_type = 'ticket' AND entity_id = ?", [ticketId]);
    await runExec('DELETE FROM attachments WHERE ticket_id = ?', [ticketId]);
    await runExec('DELETE FROM tickets WHERE id = ?', [ticketId]);
    setDeleting(false);
    onDeleted();
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Ticket {ticketNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the ticket, all comments, attachments, and audit trail entries. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {deleting ? 'Deleting...' : 'Delete Permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
