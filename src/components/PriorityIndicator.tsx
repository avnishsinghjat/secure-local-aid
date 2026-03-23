import { AlertTriangle, ArrowUp, Minus, ArrowDown } from 'lucide-react';

const priorityConfig: Record<string, { icon: any; className: string; label: string }> = {
  critical: { icon: AlertTriangle, className: 'priority-critical', label: 'CRITICAL' },
  high: { icon: ArrowUp, className: 'priority-high', label: 'HIGH' },
  medium: { icon: Minus, className: 'priority-medium', label: 'MEDIUM' },
  low: { icon: ArrowDown, className: 'priority-low', label: 'LOW' },
};

export default function PriorityIndicator({ priority, showLabel = true }: { priority: string; showLabel?: boolean }) {
  const config = priorityConfig[priority] || priorityConfig.medium;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${config.className}`}>
      <Icon className="w-3.5 h-3.5" />
      {showLabel && config.label}
    </span>
  );
}
