const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'DRAFT', className: 'status-draft' },
  submitted: { label: 'SUBMITTED', className: 'status-submitted' },
  received: { label: 'RECEIVED', className: 'status-submitted' },
  under_triage: { label: 'TRIAGE', className: 'status-in-progress' },
  allocated: { label: 'ALLOCATED', className: 'status-in-progress' },
  forwarded: { label: 'FORWARDED', className: 'status-in-progress' },
  pending_validation: { label: 'PENDING VALIDATION', className: 'status-in-progress' },
  pending_documents: { label: 'PENDING DOCS', className: 'status-in-progress' },
  in_progress: { label: 'IN PROGRESS', className: 'status-in-progress' },
  awaiting_response: { label: 'AWAITING RESPONSE', className: 'status-in-progress' },
  resolved: { label: 'RESOLVED', className: 'status-resolved' },
  rejected: { label: 'REJECTED', className: 'status-rejected' },
  closed: { label: 'CLOSED', className: 'status-closed' },
  reopened: { label: 'REOPENED', className: 'status-rejected' },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status.toUpperCase(), className: 'status-draft' };
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
}
