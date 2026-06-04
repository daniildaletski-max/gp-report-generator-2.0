import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, ShieldAlert, CheckCircle2, Calendar, Gamepad2, User } from "lucide-react";
import { format } from "date-fns";
import { MAX_TOTAL_SCORE } from "@shared/const";
import { getScoreTone, SCORE_TONE_CLASSES } from "@/lib/scoreTone";

/**
 * Review queue — evaluations the scoring engine flagged as suspect at
 * write time (out-of-range score, or an AI-extracted total that didn't
 * match the sum of sub-scores). Lets an FM/admin eyeball each one and
 * dismiss the flag once checked. Backed by evaluation.needsReview /
 * evaluation.clearReview.
 */
export default function Review() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.evaluation.needsReview.useQuery();

  const clearReview = trpc.evaluation.clearReview.useMutation({
    onSuccess: () => {
      utils.evaluation.needsReview.invalidate();
      toast.success("Marked as reviewed");
    },
    onError: (err) => toast.error("Could not update: " + err.message),
  });

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review queue"
        subtitle="Evaluations flagged as suspect — check the scores against the screenshot, then mark reviewed."
        icon={ShieldAlert}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing to review"
          description="Every evaluation passed the automatic quality checks. New flags will appear here."
        />
      ) : (
        <div className="space-y-3">
          {rows.map(({ evaluation: ev, gamePresenter: gp }) => {
            const tone = getScoreTone(ev.totalScore, MAX_TOTAL_SCORE);
            const toneCls = SCORE_TONE_CLASSES[tone];
            return (
              <Card key={ev.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {gp?.name ?? "Unknown GP"}
                        </span>
                        {ev.evaluationDate && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(ev.evaluationDate), "dd MMM yyyy")}
                          </span>
                        )}
                        {ev.game && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Gamepad2 className="h-3.5 w-3.5" />
                            {ev.game}
                          </span>
                        )}
                      </div>
                      {ev.reviewReason && (
                        <p className={`text-sm rounded-md border px-3 py-2 ${toneCls.bg} ${toneCls.border} ${toneCls.text}`}>
                          {ev.reviewReason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Badge variant="outline" className={`${toneCls.text} ${toneCls.border}`}>
                        {ev.totalScore ?? 0}/{MAX_TOTAL_SCORE}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={clearReview.isPending}
                        onClick={() => clearReview.mutate({ id: ev.id })}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Mark reviewed
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
