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
 * Empty state used everywhere we render a list. Premium gold/white design
 * with subtle ambient decoration and clear visual hierarchy.
 */
export function EmptyState({ icon: Icon, title, description, action, size = "default" }: EmptyStateProps) {
  const padding = size === "compact" ? "py-10" : "py-16";
  const iconSize = size === "compact" ? "h-8 w-8" : "h-11 w-11";
  const iconBox = size === "compact" ? "h-14 w-14" : "h-20 w-20";

  return (
    <div className={`relative flex flex-col items-center justify-center text-center ${padding} px-6 overflow-hidden`}>
      {/* Ambient background decoration */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-48 w-48 rounded-full bg-amber-100/40 blur-3xl" />
      </div>

      {Icon && (
        <div className="relative mb-5">
          {/* Outer glow ring */}
          <div className={`absolute inset-0 ${iconBox} rounded-2xl bg-amber-100/60 blur-md scale-125`} aria-hidden />
          <div className={`relative ${iconBox} rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200/60 flex items-center justify-center shadow-sm`}>
            <Icon className={`${iconSize} text-amber-600/70`} />
          </div>
        </div>
      )}

      <h3 className="text-base font-semibold text-slate-800 mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
