/**
 * FM Copilot — AI-driven automation hub for floor managers.
 *
 * Three core surfaces:
 *
 *   1. Daily Briefing (default view) — personalised morning brief:
 *      priority GPs, quick wins to recognise, risk alerts, team
 *      themes. Cached for 8h server-side per (user, day).
 *
 *   2. Coaching Brief Drawer — opens on a priority GP, generates
 *      a 1:1 prep document (TLDR + talking points + suggested
 *      action items). One-click "save all suggestions" creates real
 *      action items.
 *
 *   3. Monthly Review Drawer — generates a markdown draft for the
 *      selected GP / month, FM edits in-place and copies / saves.
 *      Eliminates the most painful end-of-month manual writing.
 *
 * Empty states matter here: a steady team produces a deterministic
 * "calm day" briefing rather than a noisy LLM-fabricated one.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { useEffect } from "react";
import {
  Sparkles, RefreshCw, Loader2, ArrowUpRight, ArrowDownRight, Minus,
  AlertTriangle, TrendingUp, Users, Building2, ChevronRight,
  Wand2, Calendar, Copy, CheckCircle2, MessageSquareText, FileText, Bot,
  Zap, Target, Heart, AlertCircle,
} from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type RiskLevel = "low" | "watch" | "high";

export default function CopilotPage() {
  const { user } = useAuth();
  const [selectedTeamId, setSelectedTeamId] = useState<number | undefined>(undefined);
  const [coachingGpId, setCoachingGpId] = useState<number | null>(null);
  const [reviewState, setReviewState] = useState<{ gpId: number; gpName: string; month: number; year: number } | null>(null);

  const teamsQuery = trpc.fmTeam.list.useQuery();

  // The briefing is a mutation (not query) because the LLM call is
  // expensive enough to want explicit triggers + force-refresh control.
  // Server-side caches per (user, day) so re-runs without `force` are
  // basically free.
  const briefingMutation = trpc.aiCoach.dailyBriefing.useMutation({
    onError: (err) => toast.error(`Briefing failed: ${err.message}`),
  });
  const briefing = briefingMutation.data;

  // Auto-fire on first load so the FM lands on a populated page.
  useEffect(() => {
    if (!briefing && !briefingMutation.isPending) {
      briefingMutation.mutate({ teamId: selectedTeamId, force: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = (force: boolean) => {
    briefingMutation.mutate({ teamId: selectedTeamId, force });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="FM Copilot"
        subtitle="Your AI-generated morning brief — priority GPs, quick wins, risk alerts."
        icon={Sparkles}
        actions={
          <>
            {(teamsQuery.data?.length ?? 0) > 1 && (
              <Select
                value={selectedTeamId ? String(selectedTeamId) : "all"}
                onValueChange={(v) => {
                  setSelectedTeamId(v === "all" ? undefined : Number(v));
                  briefingMutation.mutate({ teamId: v === "all" ? undefined : Number(v), force: false });
                }}
              >
                <SelectTrigger className="w-[180px] h-9 bg-white">
                  <Building2 className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                  <SelectValue placeholder="All teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {(teamsQuery.data ?? []).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.teamName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline" size="sm"
              onClick={() => onRefresh(true)}
              disabled={briefingMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${briefingMutation.isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
      />

      {briefingMutation.isPending && !briefing && (
        <BriefingSkeleton />
      )}

      {briefingMutation.isError && (
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="pt-5 pb-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-medium text-rose-900">Couldn't generate briefing.</div>
              <div className="text-rose-700">
                {briefingMutation.error?.message ?? "Unknown error"} — try refresh.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => onRefresh(false)}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {briefing && (
        <>
          {/* Hero opener */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-white to-white">
            <CardContent className="pt-5 pb-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="hidden sm:flex h-12 w-12 shrink-0 rounded-xl bg-primary/10 border border-primary/20 items-center justify-center text-primary">
                <Bot className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                  Briefing for {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </div>
                <p className="text-base sm:text-lg text-slate-800 mt-1 leading-snug">
                  {briefing.opener}
                </p>
                <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-3">
                  <span>Tracking {briefing.totalGps} GP{briefing.totalGps === 1 ? "" : "s"}</span>
                  <span className="text-slate-300">·</span>
                  <span>Generated {new Date(briefing.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Priority GPs */}
          {briefing.priorityGps.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Focus today · {briefing.priorityGps.length}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {briefing.priorityGps.map(p => (
                  <PriorityCard
                    key={p.gpId}
                    gp={p}
                    onCoachClick={() => setCoachingGpId(p.gpId)}
                  />
                ))}
              </div>
            </section>
          ) : (
            <Card className="border-dashed border-slate-300 bg-slate-50/60">
              <CardContent className="pt-5 pb-5 text-center text-sm text-slate-500">
                <Heart className="h-5 w-5 mx-auto mb-2 text-emerald-500" />
                No GPs flagged for priority attention today. Nice steady team.
              </CardContent>
            </Card>
          )}

          {/* Quick wins + Risk alerts side-by-side */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Quick wins to recognise
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-1">
                {briefing.quickWins.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    No standout improvers this cycle. Keep an eye out.
                  </p>
                ) : briefing.quickWins.map(w => (
                  <div key={w.gpId} className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-800">{w.gpName}</div>
                      <Badge className="bg-emerald-100 border-emerald-200 text-emerald-700 text-[10px]">
                        win
                      </Badge>
                    </div>
                    <div className="text-[12px] text-slate-700 mt-0.5">{w.win}</div>
                    <div className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
                      <Zap className="h-3 w-3" /> {w.suggestedRecognition}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Risk alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-1">
                {briefing.riskAlerts.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    No early-warning patterns detected.
                  </p>
                ) : briefing.riskAlerts.map(r => (
                  <button
                    key={r.gpId}
                    onClick={() => setCoachingGpId(r.gpId)}
                    className="w-full text-left rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 hover:bg-amber-100/40 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-800">{r.gpName}</div>
                      <Badge className={`text-[10px] ${
                        r.severity === "urgent"
                          ? "bg-rose-100 border-rose-200 text-rose-700"
                          : "bg-amber-100 border-amber-200 text-amber-700"
                      }`}>
                        {r.severity}
                      </Badge>
                    </div>
                    <div className="text-[12px] text-slate-700 mt-0.5 flex items-center justify-between">
                      <span>{r.pattern}</span>
                      <ChevronRight className="h-3 w-3 text-slate-400 group-hover:text-slate-600 transition-colors" />
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Team themes */}
          {briefing.teamThemes.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-600" />
                  Team-wide patterns
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <ul className="space-y-1.5">
                  {briefing.teamThemes.map((t, i) => (
                    <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Monthly review drafter — wide CTA */}
          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-800">
                  Draft a monthly review with AI
                </div>
                <div className="text-xs text-slate-600">
                  Generates strengths, growth areas, deltas, and a next-month goal so you only edit and approve.
                </div>
              </div>
              <MonthlyReviewLauncher
                onLaunch={(s) => setReviewState(s)}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Coaching brief drawer */}
      {coachingGpId !== null && (
        <CoachingBriefDialog
          gpId={coachingGpId}
          onClose={() => setCoachingGpId(null)}
        />
      )}

      {/* Monthly review drawer */}
      {reviewState && (
        <MonthlyReviewDialog
          state={reviewState}
          onClose={() => setReviewState(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────
function BriefingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-5 w-32 rounded" />
      <div className="grid sm:grid-cols-2 gap-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}

function PriorityCard({
  gp, onCoachClick,
}: {
  gp: { gpId: number; gpName: string; reason: string; suggestedAction: string; riskScore: number; risk: RiskLevel; signals: string[] };
  onCoachClick: () => void;
}) {
  const riskBadge = gp.risk === "high"
    ? "bg-rose-100 border-rose-200 text-rose-700"
    : gp.risk === "watch"
    ? "bg-amber-100 border-amber-200 text-amber-700"
    : "bg-slate-100 border-slate-200 text-slate-700";
  return (
    <Card className="border-slate-200 hover:border-primary/30 transition-colors group">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-800 truncate">{gp.gpName}</div>
            <div className="text-[11px] text-slate-500">Risk score {gp.riskScore}/100</div>
          </div>
          <Badge className={`text-[10px] uppercase tracking-wider ${riskBadge}`}>
            {gp.risk}
          </Badge>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Why</div>
          <div className="text-sm text-slate-700">{gp.reason}</div>
        </div>
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-primary mb-0.5">Suggested first move</div>
          <div className="text-sm text-slate-800">{gp.suggestedAction}</div>
        </div>
        {gp.signals.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {gp.signals.slice(0, 3).map((s, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">
                {s}
              </span>
            ))}
          </div>
        )}
        <Button
          onClick={onCoachClick}
          variant="outline" size="sm"
          className="w-full gap-1.5 group-hover:border-primary/50"
        >
          <Wand2 className="h-3.5 w-3.5" /> Generate 1:1 coaching brief
        </Button>
      </CardContent>
    </Card>
  );
}

function CoachingBriefDialog({ gpId, onClose }: { gpId: number; onClose: () => void }) {
  const briefMutation = trpc.aiCoach.coachingBrief.useMutation();
  const applyMutation = trpc.aiCoach.applyCoachingActions.useMutation({
    onSuccess: (res) => toast.success(`Saved ${res.created} action item${res.created === 1 ? "" : "s"} to coaching board.`),
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  useEffect(() => { briefMutation.mutate({ gpId }); /* eslint-disable-next-line */ }, [gpId]);

  const brief = briefMutation.data;
  const [selectedActions, setSelectedActions] = useState<Set<number>>(new Set());
  // Default-select all suggested actions when the brief lands.
  useEffect(() => {
    if (brief) setSelectedActions(new Set(brief.suggestedActions.map((_, i) => i)));
  }, [brief]);

  const onToggleAction = (idx: number) => {
    setSelectedActions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const onApply = () => {
    if (!brief) return;
    const actions = brief.suggestedActions.filter((_, i) => selectedActions.has(i));
    if (actions.length === 0) { toast.error("Pick at least one action to save."); return; }
    applyMutation.mutate({ gpId, actions });
  };

  const toneStyle = useMemo(() => {
    if (!brief) return "";
    return ({
      celebratory: "bg-emerald-100 border-emerald-200 text-emerald-700",
      supportive: "bg-blue-100 border-blue-200 text-blue-700",
      direct: "bg-amber-100 border-amber-200 text-amber-700",
      corrective: "bg-rose-100 border-rose-200 text-rose-700",
    } as Record<string, string>)[brief.tone] ?? "";
  }, [brief]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" />
            Coaching brief — {brief?.gpName ?? "Loading…"}
          </DialogTitle>
          <DialogDescription>
            5-minute prep document for your next 1:1.
          </DialogDescription>
        </DialogHeader>

        {briefMutation.isPending && (
          <div className="space-y-3 py-6">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        )}

        {brief && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">TLDR</div>
                <Badge className={`text-[10px] uppercase tracking-wider ${toneStyle}`}>
                  {brief.tone}
                </Badge>
              </div>
              <p className="text-sm text-slate-800 leading-snug">{brief.tldr}</p>
            </div>

            {brief.dataPoints.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Data points</h3>
                <ul className="space-y-1">
                  {brief.dataPoints.map((d, i) => (
                    <li key={i} className="text-[12px] text-slate-700 flex items-start gap-2">
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Conversation script</h3>
              <ol className="space-y-2">
                {brief.talkingPoints.map((tp, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="text-sm text-slate-800">{i + 1}. {tp.point}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{tp.why}</div>
                  </li>
                ))}
              </ol>
            </section>

            {brief.suggestedActions.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Suggested actions ({selectedActions.size}/{brief.suggestedActions.length} selected)
                </h3>
                <div className="space-y-2">
                  {brief.suggestedActions.map((a, i) => (
                    <label key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-start gap-3 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selectedActions.has(i)}
                        onChange={() => onToggleAction(i)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{a.title}</div>
                        <div className="text-[12px] text-slate-600 mt-0.5">{a.description}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge className="text-[10px] bg-slate-100 border-slate-200 text-slate-600">{a.category}</Badge>
                          <Badge className={`text-[10px] ${
                            a.priority === "high" ? "bg-rose-100 border-rose-200 text-rose-700" :
                            a.priority === "medium" ? "bg-amber-100 border-amber-200 text-amber-700" :
                            "bg-slate-100 border-slate-200 text-slate-600"
                          }`}>{a.priority}</Badge>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {brief && brief.suggestedActions.length > 0 && (
            <Button
              onClick={onApply}
              disabled={selectedActions.size === 0 || applyMutation.isPending}
              className="gap-1.5"
            >
              {applyMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCircle2 className="h-3.5 w-3.5" />}
              Save {selectedActions.size} action{selectedActions.size === 1 ? "" : "s"} to coaching board
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MonthlyReviewLauncher({ onLaunch }: { onLaunch: (s: { gpId: number; gpName: string; month: number; year: number }) => void }) {
  const now = new Date();
  // Default to LAST month — the typical "draft last month's review" use case.
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [month, setMonth] = useState(last.getMonth() + 1);
  const [year, setYear] = useState(last.getFullYear());
  const [gpId, setGpId] = useState<string>("");

  const gpsQuery = trpc.gamePresenter.list.useQuery();
  const gps = gpsQuery.data ?? [];

  const onGo = () => {
    const id = Number(gpId);
    if (!id) { toast.error("Pick a GP first"); return; }
    const gp = gps.find(g => g.id === id);
    if (!gp) return;
    onLaunch({ gpId: id, gpName: gp.name, month, year });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={gpId} onValueChange={setGpId}>
        <SelectTrigger className="w-[180px] h-9 bg-white">
          <SelectValue placeholder="Pick GP…" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {gps.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
        <SelectTrigger className="w-[110px] h-9 bg-white">
          <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTH_NAMES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n.slice(0, 3)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
        <SelectTrigger className="w-[90px] h-9 bg-white"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Array.from({ length: 3 }, (_, i) => now.getFullYear() - i).map(y => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={onGo} disabled={!gpId} className="gap-1.5">
        <Wand2 className="h-3.5 w-3.5" /> Draft review
      </Button>
    </div>
  );
}

function MonthlyReviewDialog({
  state, onClose,
}: {
  state: { gpId: number; gpName: string; month: number; year: number };
  onClose: () => void;
}) {
  const draftMutation = trpc.aiCoach.draftMonthlyReview.useMutation();
  useEffect(() => { draftMutation.mutate(state); /* eslint-disable-next-line */ }, [state.gpId, state.month, state.year]);

  const [edited, setEdited] = useState<string>("");
  useEffect(() => {
    if (draftMutation.data) {
      const d = draftMutation.data;
      setEdited(buildReviewMarkdown(d));
    }
  }, [draftMutation.data]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(edited);
      toast.success("Review copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select all and copy manually.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Monthly review draft — {state.gpName}, {MONTH_NAMES[state.month - 1]} {state.year}
          </DialogTitle>
          <DialogDescription>
            Edit in place, then copy to your usual review system.
          </DialogDescription>
        </DialogHeader>

        {draftMutation.isPending && (
          <div className="space-y-3 py-6">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        )}

        {draftMutation.data && (
          <div className="flex-1 overflow-y-auto space-y-3">
            {/* Compact deltas strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {draftMutation.data.deltas.map((d, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{d.metric}</div>
                  <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                    <span>{Number(d.previous).toFixed(1)}</span>
                    {d.direction === "up" && <ArrowUpRight className="h-3 w-3 text-emerald-600" />}
                    {d.direction === "down" && <ArrowDownRight className="h-3 w-3 text-rose-600" />}
                    {d.direction === "flat" && <Minus className="h-3 w-3 text-slate-400" />}
                    <span>{Number(d.current).toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>

            <Textarea
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              className="min-h-[320px] font-mono text-xs"
            />

            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[12px] text-primary">
              <strong>Goal for next month:</strong> {draftMutation.data.nextMonthGoal}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={onCopy} disabled={!edited} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" /> Copy markdown
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Compose the editable markdown that the FM iterates on.
function buildReviewMarkdown(d: NonNullable<ReturnType<typeof trpc.aiCoach.draftMonthlyReview.useMutation>["data"]>): string {
  const monthName = new Date(d.year, d.month - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const lines: string[] = [
    `# ${d.gpName} — ${monthName}`,
    "",
    d.narrative,
    "",
    "## Strengths",
    ...d.strengths.map(s => `- ${s}`),
    "",
    "## Growth areas",
    ...d.growthAreas.map(s => `- ${s}`),
    "",
    "## Goal for next month",
    `> ${d.nextMonthGoal}`,
    "",
    "## Metric movements",
    ...d.deltas.map(x => `- **${x.metric}**: ${x.previous.toFixed(1)} → ${x.current.toFixed(1)} (${x.direction})`),
  ];
  return lines.join("\n");
}
