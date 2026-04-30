import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface FilterPill {
  /** Stable key — also used as the React key */
  key: string;
  /** What to show in the pill */
  label: string;
  /** Called when the user clicks the X */
  onRemove: () => void;
}

interface ActiveFiltersBarProps {
  pills: FilterPill[];
  /** Optional: Clear-all button shown to the right when 2+ pills present */
  onClearAll?: () => void;
}

/**
 * Horizontal strip of removable filter chips. Renders nothing when
 * there are no active filters. Use under a search/filter bar so the
 * user can see at a glance what's being filtered and remove individual
 * filters with one click instead of opening each Select.
 */
export function ActiveFiltersBar({ pills, onClearAll }: ActiveFiltersBarProps) {
  if (pills.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground mr-1">Filtering:</span>
      {pills.map(p => (
        <Badge
          key={p.key}
          variant="outline"
          className="text-xs gap-1 pl-2 pr-1 py-0.5 border-primary/30 bg-primary/5 text-primary hover:border-primary/50 transition-colors"
        >
          {p.label}
          <button
            type="button"
            onClick={p.onRemove}
            className="rounded-sm hover:bg-primary/15 p-0.5 ml-0.5"
            aria-label={`Remove filter: ${p.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {onClearAll && pills.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
