import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SCORE_CONFIG, MAX_TOTAL_SCORE } from "@shared/const";
import { Scissors, Palette, Shirt, PersonStanding, Dices, Star, Loader2, MessageSquarePlus, Zap } from "lucide-react";

/**
 * Quick evaluation modal — score a GP across the six criteria in seconds,
 * from anywhere (the Workspace queue, a GP row, etc.). Reuses the
 * existing `evaluation.create` endpoint; the server derives
 * appearance/game/total and tags the rubric version.
 *
 * Optimised for speed: tap a score chip per criterion (no typing),
 * comments are optional and collapsed. A live total mirrors how the
 * evaluation will score.
 */

type CriterionKey = "hair" | "makeup" | "outfit" | "posture" | "dealingStyle" | "gamePerformance";

const CRITERIA: Array<{ key: CriterionKey; icon: React.ElementType }> = [
  { key: "hair", icon: Scissors },
  { key: "makeup", icon: Palette },
  { key: "outfit", icon: Shirt },
  { key: "posture", icon: PersonStanding },
  { key: "dealingStyle", icon: Dices },
  { key: "gamePerformance", icon: Star },
];

export function QuickEvalDialog({
  gpId,
  gpName,
  open,
  onOpenChange,
  onSaved,
}: {
  gpId: number | null;
  gpName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const utils = trpc.useUtils();
  const [scores, setScores] = useState<Partial<Record<CriterionKey, number>>>({});
  const [comments, setComments] = useState<Partial<Record<CriterionKey, string>>>({});
  const [showComments, setShowComments] = useState(false);

  const reset = () => { setScores({}); setComments({}); setShowComments(false); };

  const createEval = trpc.evaluation.create.useMutation({
    onSuccess: () => {
      // Refresh everything the new score can affect.
      utils.dashboard.insights.invalidate();
      utils.dashboard.activityFeed.invalidate();
      utils.evaluation.list.invalidate();
      toast.success(`Evaluation saved${gpName ? ` for ${gpName}` : ""}`);
      reset();
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error("Could not save: " + e.message),
  });

  const total = useMemo(
    () => CRITERIA.reduce((sum, c) => sum + (scores[c.key] ?? 0), 0),
    [scores],
  );
  const scoredCount = CRITERIA.filter((c) => scores[c.key] != null).length;

  const submit = () => {
    if (!gpId) return;
    if (scoredCount === 0) { toast.error("Tap at least one score"); return; }
    createEval.mutate({
      gamePresenterId: gpId,
      evaluationDate: new Date(),
      hairScore: scores.hair,
      makeupScore: scores.makeup,
      outfitScore: scores.outfit,
      postureScore: scores.posture,
      dealingStyleScore: scores.dealingStyle,
      gamePerformanceScore: scores.gamePerformance,
      hairComment: comments.hair?.trim() || undefined,
      makeupComment: comments.makeup?.trim() || undefined,
      outfitComment: comments.outfit?.trim() || undefined,
      postureComment: comments.posture?.trim() || undefined,
      dealingStyleComment: comments.dealingStyle?.trim() || undefined,
      gamePerformanceComment: comments.gamePerformance?.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Quick evaluation{gpName ? ` — ${gpName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Tap a score for each criterion. Appearance is out of 12, game performance out of 10.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {CRITERIA.map(({ key, icon: Icon }) => {
            const cfg = SCORE_CONFIG[key];
            const selected = scores[key];
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="flex items-center gap-2 w-36 shrink-0 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{cfg.label}</span>
                </span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: cfg.max + 1 }, (_, n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScores((s) => ({ ...s, [key]: n }))}
                      className={`h-8 w-8 rounded-lg border text-sm font-semibold tabular-nums transition-colors ${
                        selected === n
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">/{cfg.max}</span>
                </div>
              </div>
            );
          })}

          {showComments && (
            <div className="space-y-2 pt-1">
              {CRITERIA.map(({ key, icon: Icon }) => (
                <div key={key} className="flex items-start gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground mt-2 shrink-0" />
                  <Textarea
                    value={comments[key] ?? ""}
                    onChange={(e) => setComments((c) => ({ ...c, [key]: e.target.value }))}
                    placeholder={`${SCORE_CONFIG[key].label} comment (optional)`}
                    rows={1}
                    className="text-sm min-h-[36px] resize-y"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-2">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-sm">
              Total {total}/{MAX_TOTAL_SCORE}
            </Badge>
            {!showComments && (
              <button
                type="button"
                onClick={() => setShowComments(true)}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" /> Add comments
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={createEval.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={createEval.isPending || !gpId}>
              {createEval.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save evaluation
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
