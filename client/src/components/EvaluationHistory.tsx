import { trpc } from "@/lib/trpc";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { History, ArrowRight, MessageSquare } from "lucide-react";
import { format } from "date-fns";

/**
 * Renders the append-only edit history for one evaluation (Phase 3
 * audit trail). Self-contained: queries evaluation.history and shows,
 * newest first, who/when, an optional reason, and each changed field as
 * old -> new. Only fetches when `enabled` (e.g. its tab is open).
 */

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** column name -> friendly label; falls back to the raw key. */
const FIELD_LABELS: Record<string, string> = {
  hairScore: "Hair",
  makeupScore: "Makeup",
  outfitScore: "Outfit",
  postureScore: "Posture",
  dealingStyleScore: "Dealing Style",
  gamePerformanceScore: "Game Performance",
  appearanceScore: "Appearance total",
  gamePerformanceTotalScore: "Performance total",
  totalScore: "Total",
  hairComment: "Hair comment",
  makeupComment: "Makeup comment",
  outfitComment: "Outfit comment",
  postureComment: "Posture comment",
  dealingStyleComment: "Dealing comment",
  gamePerformanceComment: "Performance comment",
  evaluatorName: "Evaluator",
  evaluationDate: "Date",
  game: "Game",
  scores: "Scores",
};

export function EvaluationHistory({ evaluationId, enabled }: { evaluationId: number; enabled: boolean }) {
  const { data, isLoading } = trpc.evaluation.history.useQuery(
    { id: evaluationId },
    { enabled },
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const revisions = data ?? [];

  if (revisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <History className="h-10 w-10 mb-3 opacity-30" />
        <p className="font-medium">No edits recorded</p>
        <p className="text-sm">This evaluation hasn't been changed since it was created.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-1">
        {revisions.map((rev) => {
          const changed = (rev.changedFields ?? {}) as Record<string, { old: unknown; new: unknown }>;
          const fields = Object.keys(changed);
          return (
            <div key={rev.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {rev.createdAt ? format(new Date(rev.createdAt), "dd MMM yyyy, HH:mm") : "Unknown time"}
                  {rev.editedById != null && <> · by user #{rev.editedById}</>}
                </span>
                <span>{fields.length} field{fields.length === 1 ? "" : "s"} changed</span>
              </div>

              {rev.reason && (
                <div className="flex items-start gap-2 text-sm">
                  <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground italic">{rev.reason}</span>
                </div>
              )}

              <div className="space-y-1">
                {fields.map((key) => (
                  <div key={key} className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="font-medium min-w-[7rem]">{FIELD_LABELS[key] ?? key}</span>
                    <span className="text-rose-600 line-through">{fmtValue(changed[key]?.old)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-emerald-700 font-medium">{fmtValue(changed[key]?.new)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
