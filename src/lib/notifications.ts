import { runExec, runQuery } from './database';

export async function createNotification(
  userId: number,
  title: string,
  message: string,
  ticketId?: number
) {
  await runExec(
    'INSERT INTO notifications (user_id, title, message, ticket_id) VALUES (?, ?, ?, ?)',
    [userId, title, message, ticketId ?? null]
  );
}

export async function getUnreadCount(userId: number): Promise<number> {
  const r = await runQuery('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0', [userId]);
  return r[0]?.c ?? 0;
}

export async function getNotifications(userId: number) {
  return runQuery(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [userId]
  );
}

export async function markAsRead(notifId: number) {
  await runExec('UPDATE notifications SET read = 1 WHERE id = ?', [notifId]);
}

export async function markAllAsRead(userId: number) {
  await runExec('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', [userId]);
}

export async function notifyTicketStatusChange(
  ticketId: number,
  ticketNumber: string,
  newStatus: string,
  requesterId: number,
  assignedUserId?: number | null
) {
  const msg = `Ticket ${ticketNumber} status changed to ${newStatus.replace(/_/g, ' ')}`;
  const targets = new Set<number>();
  targets.add(requesterId);
  if (assignedUserId) targets.add(assignedUserId);
  for (const uid of targets) {
    await createNotification(uid, 'Status Update', msg, ticketId);
  }
}

export async function notifyTicketAssignment(
  ticketId: number,
  ticketNumber: string,
  assignedUserId: number
) {
  await createNotification(
    assignedUserId,
    'Ticket Assigned',
    `You have been assigned to ticket ${ticketNumber}`,
    ticketId
  );
}

export async function notifyNewComment(
  ticketId: number,
  ticketNumber: string,
  commenterId: number,
  requesterId: number,
  assignedUserId?: number | null,
  isInternal?: boolean
) {
  if (isInternal) return; // don't notify on internal notes
  const targets = new Set<number>();
  targets.add(requesterId);
  if (assignedUserId) targets.add(assignedUserId);
  targets.delete(commenterId); // don't notify the commenter
  for (const uid of targets) {
    await createNotification(uid, 'New Comment', `New comment on ticket ${ticketNumber}`, ticketId);
  }
}
