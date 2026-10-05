import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface PanelProps {
  children: React.ReactNode;
  className?: string;
}

export function Panel({ children, className }: PanelProps) {
  return <div className={cn('ui-panel', className)}>{children}</div>;
}

interface PanelHeaderProps {
  icon: LucideIcon;
  title: string;
  status?: string;
  statusTone?: 'default' | 'emerald' | 'indigo' | 'amber' | 'rose';
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PanelHeader({
  icon: Icon,
  title,
  status,
  statusTone = 'default',
  subtitle,
  actions,
}: PanelHeaderProps) {
  return (
    <header className="ui-panel-header">
      <div className="ui-panel-heading">
        <Icon className="ui-panel-icon" aria-hidden="true" />
        <div className="ui-panel-heading-copy">
          <h2 className="ui-panel-title">{title}</h2>
          {subtitle && <p className="ui-panel-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="ui-panel-actions">
        {status && <StatusBadge tone={statusTone}>{status}</StatusBadge>}
        {actions}
      </div>
    </header>
  );
}

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: 'default' | 'emerald' | 'indigo' | 'amber' | 'rose';
  className?: string;
}

export function StatusBadge({ children, tone = 'default', className }: StatusBadgeProps) {
  return <span className={cn('ui-status-badge', `ui-status-badge--${tone}`, className)}>{children}</span>;
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: React.ReactNode;
}

export function IconButton({ label, children, className, ...props }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} className={cn('ui-icon-button', className)} {...props}>
      {children}
    </button>
  );
}

interface ProgressBarProps {
  value: number;
  tone?: 'emerald' | 'amber' | 'rose' | 'indigo';
  className?: string;
}

export function ProgressBar({ value, tone = 'emerald', className }: ProgressBarProps) {
  const boundedValue = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('ui-progress', className)} role="progressbar" aria-valuenow={boundedValue} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('ui-progress-fill', `ui-progress-fill--${tone}`)} style={{ width: `${boundedValue}%` }} />
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  supporting?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function MetricCard({ label, value, supporting, icon: Icon, className }: MetricCardProps) {
  return (
    <div className={cn('ui-card ui-metric-card', className)}>
      <div className="ui-metric-card-header">
        <span className="ui-card-label">{label}</span>
        {Icon && <Icon className="ui-card-icon" aria-hidden="true" />}
      </div>
      <div className="ui-metric-value">{value}</div>
      {supporting && <div className="ui-card-supporting">{supporting}</div>}
    </div>
  );
}
