/**
 * Clinical UI primitives — shared design-system components.
 * Calm, consistent, accessible. Used across the platform.
 */
import { clsx } from 'clsx';
import React, { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle, CheckCircle2, Info, ShieldAlert, X, Loader2,
  ChevronRight, ArrowRight, ArrowUpRight, Inbox, Search, RefreshCw,
} from 'lucide-react';

/* ── Button ───────────────────────────────────────────────── */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      {...props}
    >
      {children}
    </button>
  );
}

/* ── Card / Panel ─────────────────────────────────────────── */
export function Card({
  className, children, hover = false, ...props
}: { className?: string; children: ReactNode; hover?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('surface', hover && 'transition-smooth hover:border-[var(--border-strong)]', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Panel({
  title, subtitle, icon, actions, className, children, bodyClassName,
}: {
  title?: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode;
  className?: string; children: ReactNode; bodyClassName?: string;
}) {
  return (
    <section className={clsx('surface overflow-hidden', className)}>
      {(title || actions) && (
        <header className="panel-header flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="text-[var(--accent)] shrink-0">{icon}</span>}
            <div className="min-w-0">
              {title && <h3 className="section-title truncate">{title}</h3>}
              {subtitle && <p className="text-xs text-[var(--text-dim)] mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={clsx('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── Status / Severity badges ─────────────────────────────── */
export type Tone = 'success' | 'warning' | 'danger' | 'info';

const toneClass: Record<Tone, string> = {
  success: 'status-badge status-badge-success',
  warning: 'status-badge status-badge-warning',
  danger: 'status-badge status-badge-danger',
  info: 'status-badge status-badge-info',
};

export function Badge({ tone = 'info', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx(toneClass[tone], className)}>{children}</span>;
}

export function Pill({ children, className, tone }: { children: ReactNode; className?: string; tone?: Tone }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border',
        tone === 'success' && 'bg-[var(--success-soft)] text-[var(--success)] border-[var(--success-border)]',
        tone === 'warning' && 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning-border)]',
        tone === 'danger' && 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger-border)]',
        tone === 'info' && 'bg-[var(--info-soft)] text-[var(--info)] border-[var(--info-border)]',
        !tone && 'bg-[var(--bg-surface-3)] text-[var(--text-secondary)] border-[var(--border)]',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const s = severity?.toLowerCase();
  const tone: Tone =
    s === 'critical' || s === 'high' || s === 'danger' ? 'danger'
    : s === 'medium' || s === 'warning' || s === 'moderate' ? 'warning'
    : s === 'low' || s === 'info' || s === 'stable' ? 'info' : 'success';
  return <Badge tone={tone}>{severity}</Badge>;
}

/* ── Spinner / Skeleton ───────────────────────────────────── */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={clsx('animate-spin text-[var(--accent)]', className)} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-[var(--bg-surface-3)]', className)} />;
}

/* ── Empty / Error states ─────────────────────────────────── */
export function EmptyState({
  icon, title, description, action,
}: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-12 h-12 rounded-full bg-[var(--bg-surface-3)] flex items-center justify-center text-[var(--text-dim)] mb-4">
        {icon ?? <Inbox size={22} />}
      </div>
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
      {description && <p className="text-xs text-[var(--text-dim)] mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load this content', description, onRetry,
}: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-12 h-12 rounded-full bg-[var(--danger-soft)] flex items-center justify-center text-[var(--danger)] mb-4">
        <ShieldAlert size={22} />
      </div>
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
      {description && <p className="text-xs text-[var(--text-dim)] mt-1.5 max-w-sm">{description}</p>}
      <div className="mt-4 flex gap-2">
        {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}><RefreshCw size={14} /> Retry</Button>}
      </div>
    </div>
  );
}

/* ── Metric card ───────────────────────────────────────────── */
export function MetricCard({
  label, value, unit, icon, trend, tone, hint, action,
}: {
  label: string; value: ReactNode; unit?: string; icon?: ReactNode;
  trend?: { dir: 'up' | 'down' | 'flat'; text: string; good?: boolean };
  tone?: Tone; hint?: string; action?: ReactNode;
}) {
  return (
    <div className="surface p-4 sm:p-5 flex flex-col gap-3 anim-rise">
      <div className="flex items-start justify-between gap-2">
        <span className="section-label">{label}</span>
        {icon && <span className={clsx('shrink-0', tone === 'danger' ? 'text-[var(--danger)]' : tone === 'warning' ? 'text-[var(--warning)]' : tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--accent)]')}>{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="data-value text-2xl font-semibold text-[var(--text-primary)] leading-none">{value}</span>
        {unit && <span className="text-xs text-[var(--text-dim)]">{unit}</span>}
      </div>
      {(trend || hint) && (
        <div className="flex items-center gap-1.5 text-xs">
          {trend && (
            <span className={clsx('inline-flex items-center gap-1', trend.good ? 'text-[var(--success)]' : 'text-[var(--text-dim)]')}>
              {trend.dir === 'up' && <ArrowUpRight size={13} />}
              {trend.dir === 'down' && <ArrowRight size={13} className="rotate-90" />}
              {trend.dir === 'flat' && <ArrowRight size={13} />}
              {trend.text}
            </span>
          )}
          {hint && <span className="text-[var(--text-dim)]">{hint}</span>}
        </div>
      )}
      {action && <div className="mt-auto pt-1">{action}</div>}
    </div>
  );
}

/* ── Avatar (initials) ────────────────────────────────────── */
export function Avatar({ name, size = 36, tone }: { name: string; size?: number; tone?: Tone }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  const bg = tone === 'danger' ? 'var(--danger-soft)' : tone === 'warning' ? 'var(--warning-soft)'
    : tone === 'success' ? 'var(--success-soft)' : 'var(--accent-soft)';
  const fg = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)'
    : tone === 'success' ? 'var(--success)' : 'var(--accent)';
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold shrink-0"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ── Modal / Drawer ───────────────────────────────────────── */
export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md',
}: {
  open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode;
  children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative surface shadow-[var(--shadow-pop)] w-full anim-scale-in max-h-[90vh] flex flex-col',
        size === 'sm' && 'max-w-md', size === 'md' && 'max-w-lg', size === 'lg' && 'max-w-3xl')}>
        <header className="panel-header flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="display-title text-lg">{title}</h3>}
            {subtitle && <p className="text-xs text-[var(--text-dim)] mt-1">{subtitle}</p>}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="p-5 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && <footer className="panel-header border-t border-b-0 flex items-center justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({
  open, onClose, title, children, width = 'max-w-md',
}: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative surface shadow-[var(--shadow-pop)] w-full h-full anim-rise flex flex-col', width)}>
        <header className="panel-header flex items-center justify-between gap-3">
          <h3 className="display-title text-lg">{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="p-5 overflow-y-auto scrollbar-thin flex-1">{children}</div>
      </div>
    </div>
  );
}

/* ── Medical disclaimer banner ──────────────────────────── */
export function Disclaimer({ children, compact, className }: { children?: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={clsx(`flex items-start gap-2 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)] ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}`, className)}>
      <ShieldAlert size={compact ? 14 : 16} className="mt-0.5 shrink-0" />
      <span className="leading-relaxed">{children ?? 'AI-generated content is decision-support only and does not replace qualified clinical judgement. Verify all findings with an appropriate clinician.'}</span>
    </div>
  );
}

/* ── Page header ─────────────────────────────────────────── */
export function PageHeader({
  title, subtitle, icon, actions,
}: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <span className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="display-title text-xl sm:text-2xl text-[var(--text-primary)] leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-[var(--text-dim)] mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/* ── Toast helper icon set ────────────────────────────────── */
export const IconSet = { AlertTriangle, CheckCircle2, Info, ShieldAlert, ChevronRight, Search };
