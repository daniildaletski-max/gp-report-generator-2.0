import type { ReactNode, ComponentType } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ComponentType<{ className?: string }>;
  /** Right-aligned action buttons / selects (filters etc.) */
  actions?: ReactNode;
  /** Anything to render below the title row (filter bar, tabs, etc.) */
  children?: ReactNode;
}

/**
 * Standardised page header used by Dashboard / Reports / Evaluations /
 * Attendance / Admin / Upload. Replaces ad-hoc per-page title rows so
 * we have one consistent visual rhythm and breakpoint behaviour.
 */
export function PageHeader({ title, subtitle, icon: Icon, actions, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 pb-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="hidden sm:flex h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 items-center justify-center text-primary">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap">{actions}</div>
        )}
      </div>
      {children}
    </header>
  );
}
