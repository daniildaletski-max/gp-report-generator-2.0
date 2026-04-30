import type { ReactNode, ComponentType } from "react";

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** Primary action button or any custom content (e.g. "Clear filters"). */
  action?: ReactNode;
  /** Smaller variant for inline contexts (e.g. inside a card). */
  size?: "default" | "compact";
}

/**
 * Empty state used everywhere we render a list. One consistent visual
 * pattern instead of the dozen ad-hoc empty layouts that used to be
 * sprinkled across pages.
 */
export function EmptyState({ icon: Icon, title, description, action, size = "default" }: EmptyStateProps) {
  const padding = size === "compact" ? "py-8" : "py-14";
  const iconSize = size === "compact" ? "h-9 w-9" : "h-12 w-12";
  const iconBox = size === "compact" ? "h-12 w-12" : "h-16 w-16";

  return (
    <div className={`flex flex-col items-center justify-center text-center ${padding} px-6`}>
      {Icon && (
        <div className={`${iconBox} rounded-2xl bg-muted/40 border border-border flex items-center justify-center mb-4`}>
          <Icon className={`${iconSize} text-muted-foreground/60`} />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
