import { Clock, AlertTriangle, CheckCircle2, Timer } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SlaIndicatorProps {
  dueDate: string | null;
  status: string;
  showLabel?: boolean;
  compact?: boolean;
}

type SlaState = 'overdue' | 'due-soon' | 'on-track' | 'completed' | 'no-sla';

function getSlaState(dueDate: string | null, status: string): { state: SlaState; daysLeft: number | null; label: string } {
  const closedStatuses = ['closed', 'resolved', 'rejected'];
  
  if (closedStatuses.includes(status)) {
    return { state: 'completed', daysLeft: null, label: 'Completed' };
  }
  
  if (!dueDate) {
    return { state: 'no-sla', daysLeft: null, label: 'No SLA' };
  }

  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { state: 'overdue', daysLeft: diffDays, label: `${Math.abs(diffDays)}d overdue` };
  } else if (diffDays <= 2) {
    return { state: 'due-soon', daysLeft: diffDays, label: diffDays === 0 ? 'Due today' : `${diffDays}d left` };
  } else {
    return { state: 'on-track', daysLeft: diffDays, label: `${diffDays}d left` };
  }
}

const stateConfig: Record<SlaState, { icon: any; className: string; bgClass: string }> = {
  overdue: { icon: AlertTriangle, className: 'text-critical', bgClass: 'bg-critical/10 border-critical/20' },
  'due-soon': { icon: Timer, className: 'text-warning', bgClass: 'bg-warning/10 border-warning/20' },
  'on-track': { icon: Clock, className: 'text-success', bgClass: 'bg-success/10 border-success/20' },
  completed: { icon: CheckCircle2, className: 'text-muted-foreground', bgClass: 'bg-muted/50 border-border' },
  'no-sla': { icon: Clock, className: 'text-muted-foreground', bgClass: 'bg-muted/30 border-border' },
};

export default function SlaIndicator({ dueDate, status, showLabel = true, compact = false }: SlaIndicatorProps) {
  const { state, label } = getSlaState(dueDate, status);
  const config = stateConfig[state];
  const Icon = config.icon;

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 ${config.className}`}>
            <Icon className="w-3.5 h-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{label}{dueDate ? ` • Due ${new Date(dueDate).toLocaleDateString()}` : ''}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${config.bgClass} ${config.className}`}>
          <Icon className="w-3 h-3" />
          {showLabel && label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{dueDate ? `Due: ${new Date(dueDate).toLocaleDateString()}` : 'No due date set'}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export { getSlaState };
export type { SlaState };
