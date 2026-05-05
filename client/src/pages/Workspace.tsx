/**
 * Floor Manager Workspace — a single-screen evaluation cockpit.
 *
 * Three-panel layout designed to make evaluating a team a 30-second
 * loop instead of a multi-page form-fill:
 *  - Left rail   — Cadence Queue: every GP in the team sorted by
 *                   "days since last eval", colour-coded urgency.
 *  - Center pane — Quick Evaluate: all 6 criteria visible at once,
 *                   keyboard hotkeys, smart pre-fill from last eval,
 *                   templated comment chips, auto-advance to next
 *                   overdue GP after submit.
 *  - Right rail  — GP Context: per-criterion mini-trends, watch zones
 *                   (criteria scoring below 70% in the last 3 evals),
 *                   recent eval history, current-month attendance,
 *                   open action-item count.
 *
 * Hotkey map (when a GP is loaded):
 *   1..3  — set Hair score (when Hair row is focused)
 *   1..3  — set Makeup / Outfit / Posture (focus-aware)
 *   1..5  — set Dealing Style / Game Performance
 *   Tab   — move focus between criteria
 *   Cmd+Enter / Ctrl+Enter — submit eval
 *   J     — jump to next overdue GP in queue
 *   K     — jump to previous GP in queue
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { StudioworksImportButton } from "@/components/StudioworksImporter";
import { toast } from "sonner";
import {
  Zap, Users, Clock, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft,
  Scissors, Palette, Shirt, PersonStanding, Gamepad2, Target, Calendar,
  Loader2, Send, Eye, Flag, Search, ListChecks, Sparkles, Stethoscope,
  CalendarX, Timer, Briefcase, TrendingUp, TrendingDown, Minus, Save,
  FlaskConical, MessageSquare, Keyboard,
} from "lucide-react";

// ============================================
// Type aliases — server response shape
// ============================================

type CadenceGP = {
  gpId: number;
  gpName: string;
  evalCount: number;
  lastEvalDate: Date | string | null;
  daysSince: number | null;
  urgency: "never" | "overdue" | "due-soon" | "fresh";
  lastTotal: number | null;
  lastSubscores: {
    hair: number | null;
    makeup: number | null;
    outfit: number | null;
    posture: number | null;
    dealing: number | null;
    perf: number | null;
  } | null;
  /** Smart auto-suggest from the server: weighted average of last 3
   *  evals per criterion, plus an aggregate confidence label. Used
   *  to pre-fill the Quick Evaluate form so the FM only has to
   *  confirm or adjust instead of scoring from scratch. */
  suggestedScores: {
    hair: number | null;
    makeup: number | null;
    outfit: number | null;
    posture: number | null;
    dealing: number | null;
    perf: number | null;
    sampleSize: number;
    confidence: "low" | "medium" | "high";
  } | null;
  recentEvals: Array<{
    id: number;
    date: Date | string | null;
    totalScore: number | null;
    evaluatorName: string | null;
    game: string | null;
  }>;
  trends: {
    total: number[];
    hair: number[];
    makeup: number[];
    outfit: number[];
    posture: number[];
    dealing: number[];
    perf: number[];
  };
  watchZone: Array<{ key: string; label: string; avg: number; max: number }>;
  attendance: { sick: number; missed: number; late: number; extra: number } | null;
  openActions: number;
};

// ============================================
// Templated quick-comment chips per criterion.
// Tap a chip to append a snippet — much faster
// than typing the same observation each time.
// ============================================
const QUICK_COMMENTS: Record<CriterionKey, string[]> = {
  hair: ["Polished and on-brand.", "Stray strands — tie back next shift.", "Neatly styled, professional."],
  makeup: ["Clean professional look.", "Touch-up needed — under eyes.", "Lipstick worn off mid-shift."],
  outfit: ["Outfit on point.", "Wrinkled — steam before shift.", "Lint visible on dark fabric."],
  posture: ["Strong stage presence.", "Slouching during slow tables.", "Open posture, engaged."],
  dealing: ["Smooth, confident dealing.", "Rushed during peak hour.", "Mistake recovery — stay calm."],
  perf: ["Strong storytelling, viewers engaged.", "Energy dipped late shift.", "Excellent rapport with players."],
};

type CriterionKey = "hair" | "makeup" | "outfit" | "posture" | "dealing" | "perf";

const CRITERIA: Array<{
  key: CriterionKey;
  label: string;
  max: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}> = [
  { key: "hair", label: "Hair", max: 3, icon: Scissors, tone: "violet" },
  { key: "makeup", label: "Makeup", max: 3, icon: Palette, tone: "rose" },
  { key: "outfit", label: "Outfit", max: 3, icon: Shirt, tone: "indigo" },
  { key: "posture", label: "Posture", max: 3, icon: PersonStanding, tone: "amber" },
  { key: "dealing", label: "Dealing Style", max: 5, icon: Target, tone: "emerald" },
  { key: "perf", label: "Game Performance", max: 5, icon: Gamepad2, tone: "sky" },
];

// ============================================
// Helpers
// ============================================
function urgencyBadge(u: CadenceGP["urgency"]) {
  switch (u) {
    case "never":
      return { label: "Never", className: "bg-rose-100 text-rose-700 border-rose-200" };
    case "overdue":
      return { label: "Overdue", className: "bg-rose-50 text-rose-700 border-rose-200" };
    case "due-soon":
      return { label: "Due soon", className: "bg-amber-50 text-amber-700 border-amber-200" };
    case "fresh":
      return { label: "Fresh", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MiniSpark({ values, max, color }: { values: number[]; max: number; color: string }) {
  if (!values || values.length < 2) {
    return <span className="text-[10px] text-slate-400">—</span>;
  }
  const w = 80, h = 18;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => {
    const y = h - (Math.max(0, Math.min(v, max)) / max) * h;
    return `${i * step},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
      {values.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - (v / max) * h} r={1.5} fill={color} />
      ))}
    </svg>
  );
}

// ============================================
// Page component
// ============================================
export default function WorkspacePage() {
  const { user } = useAuth();
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedGpId, setSelectedGpId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "overdue" | "due-soon" | "never">("all");
  const [search, setSearch] = useState("");

  // Eval form state
  const [scores, setScores] = useState<Record<CriterionKey, number | null>>({
    hair: null, makeup: null, outfit: null, posture: null, dealing: null, perf: null,
  });
  const [comments, setComments] = useState<Record<CriterionKey, string>>({
    hair: "", makeup: "", outfit: "", posture: "", dealing: "", perf: "",
  });
  const [evalDate, setEvalDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [game, setGame] = useState("");
  const [focusedCriterion, setFocusedCriterion] = useState<CriterionKey | null>(null);
  const [showHotkeysHint, setShowHotkeysHint] = useState(true);

  // Fetch teams
  const { data: teams, isLoading: teamsLoading } = trpc.fmTeam.list.useQuery();

  // Auto-pick first team
  useEffect(() => {
    if (teams && teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(String(teams[0].id));
    }
  }, [teams, selectedTeamId]);

  const teamId = selectedTeamId ? Number(selectedTeamId) : undefined;

  // Fetch cadence
  const { data: cadenceData, isLoading: cadenceLoading, refetch: refetchCadence } =
    trpc.evaluation.cadence.useQuery(
      { teamId: teamId! },
      { enabled: !!teamId, refetchInterval: 60_000 },
    );

  const filteredGps = useMemo(() => {
    if (!cadenceData?.gps) return [];
    let list = cadenceData.gps;
    if (filter === "overdue") list = list.filter(g => g.urgency === "overdue");
    else if (filter === "due-soon") list = list.filter(g => g.urgency === "due-soon");
    else if (filter === "never") list = list.filter(g => g.urgency === "never");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(g => g.gpName.toLowerCase().includes(q));
    }
    return list;
  }, [cadenceData, filter, search]);

  // Deep-link: when navigated to /workspace?gp=ID (e.g. from the
  // GP Stats card "Open in Workspace" shortcut), pre-select that GP
  // AND switch the team selector to the GP's team — otherwise the
  // cadence still loads the previously-selected team and the auto-
  // pick effect below would overwrite our choice.
  //
  // We track a `deepLinkPending` id rather than calling the setters
  // directly, so the auto-pick effect knows to back off until we
  // resolve the team and the cadence reloads with our GP in it.
  const [deepLinkPending, setDeepLinkPending] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const deepGp = params.get("gp");
    if (!deepGp) return null;
    const id = Number(deepGp);
    return Number.isFinite(id) && id > 0 ? id : null;
  });
  // We need the global GP list (not just the team-scoped cadence) to
  // resolve the deep-linked GP's owning team.
  const { data: globalGpList } = trpc.gamePresenter.list.useQuery(undefined, {
    enabled: deepLinkPending !== null,
  });
  useEffect(() => {
    if (deepLinkPending == null || !globalGpList) return;
    const gp = (globalGpList as any[]).find(g => g.id === deepLinkPending);
    if (gp?.teamId) {
      setSelectedTeamId(String(gp.teamId));
    }
    setSelectedGpId(deepLinkPending);
    setDeepLinkPending(null);
  }, [deepLinkPending, globalGpList]);

  // Auto-pick first overdue GP when cadence loads & nothing selected.
  // Skip while a deep-link is still being resolved so we don't
  // overwrite the FM's incoming intent.
  useEffect(() => {
    if (deepLinkPending != null) return;
    if (!cadenceData?.gps || cadenceData.gps.length === 0) return;
    if (selectedGpId && cadenceData.gps.some(g => g.gpId === selectedGpId)) return;
    setSelectedGpId(cadenceData.gps[0].gpId);
  }, [cadenceData, selectedGpId, deepLinkPending]);

  const selectedGp = useMemo(
    () => cadenceData?.gps.find(g => g.gpId === selectedGpId) ?? null,
    [cadenceData, selectedGpId],
  );

  // Pre-fill scores when GP changes — uses last eval's subscores as
  // a sensible starting point. The FM bumps from there.
  useEffect(() => {
    if (!selectedGp) return;
    // Pre-fill: prefer the server-side weighted average across the
    // GP's last 3 evals (smarter than the previous "last eval only"
    // fill), round to nearest integer for the score buttons. Fall
    // back to the single last eval when no suggestion is available.
    const round = (v: number | null): number | null =>
      v == null ? null : Math.round(v);
    const sg = selectedGp.suggestedScores;
    setScores({
      hair: round(sg?.hair ?? null) ?? selectedGp.lastSubscores?.hair ?? null,
      makeup: round(sg?.makeup ?? null) ?? selectedGp.lastSubscores?.makeup ?? null,
      outfit: round(sg?.outfit ?? null) ?? selectedGp.lastSubscores?.outfit ?? null,
      posture: round(sg?.posture ?? null) ?? selectedGp.lastSubscores?.posture ?? null,
      dealing: round(sg?.dealing ?? null) ?? selectedGp.lastSubscores?.dealing ?? null,
      perf: round(sg?.perf ?? null) ?? selectedGp.lastSubscores?.perf ?? null,
    });
    setComments({ hair: "", makeup: "", outfit: "", posture: "", dealing: "", perf: "" });
    setGame("");
    setFocusedCriterion("hair");
  }, [selectedGpId, selectedGp]);

  // Create-eval mutation
  const createMutation = trpc.evaluation.create.useMutation({
    onSuccess: () => {
      toast.success("Evaluation saved", { description: selectedGp ? `Submitted for ${selectedGp.gpName}` : undefined });
      refetchCadence();
      // Auto-advance to next overdue GP in the current filter list.
      if (cadenceData?.gps && selectedGpId) {
        const overdueOrNever = cadenceData.gps.filter(g =>
          (g.urgency === "overdue" || g.urgency === "never") && g.gpId !== selectedGpId,
        );
        if (overdueOrNever.length > 0) {
          setSelectedGpId(overdueOrNever[0].gpId);
        }
      }
    },
    onError: (err) => toast.error("Failed to save evaluation", { description: err.message }),
  });

  const totalScore = useMemo(() => {
    let sum = 0;
    for (const c of CRITERIA) {
      const v = scores[c.key];
      if (typeof v === "number") sum += v;
    }
    return sum;
  }, [scores]);

  const maxTotal = CRITERIA.reduce((s, c) => s + c.max, 0);

  const isFormValid = CRITERIA.every(c => typeof scores[c.key] === "number" && (scores[c.key] as number) >= 0);

  const handleSubmit = useCallback(() => {
    if (!selectedGp) return;
    if (!isFormValid) {
      toast.error("Set all 6 criteria before saving");
      return;
    }
    createMutation.mutate({
      gamePresenterId: selectedGp.gpId,
      evaluatorName: user?.name ?? user?.email ?? undefined,
      evaluationDate: new Date(evalDate),
      game: game || undefined,
      hairScore: scores.hair ?? undefined,
      hairComment: comments.hair || undefined,
      makeupScore: scores.makeup ?? undefined,
      makeupComment: comments.makeup || undefined,
      outfitScore: scores.outfit ?? undefined,
      outfitComment: comments.outfit || undefined,
      postureScore: scores.posture ?? undefined,
      postureComment: comments.posture || undefined,
      dealingStyleScore: scores.dealing ?? undefined,
      dealingStyleComment: comments.dealing || undefined,
      gamePerformanceScore: scores.perf ?? undefined,
      gamePerformanceComment: comments.perf || undefined,
    });
  }, [selectedGp, isFormValid, createMutation, evalDate, game, scores, comments, user]);

  // Keyboard shortcuts — number keys set the focused criterion's
  // score; J / K navigate the GP queue; Cmd+Enter submits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const inEditable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (inEditable) return;
      if (!cadenceData?.gps || cadenceData.gps.length === 0) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        const idx = cadenceData.gps.findIndex(g => g.gpId === selectedGpId);
        const next = cadenceData.gps[Math.min(cadenceData.gps.length - 1, idx + 1)];
        if (next) setSelectedGpId(next.gpId);
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        const idx = cadenceData.gps.findIndex(g => g.gpId === selectedGpId);
        const prev = cadenceData.gps[Math.max(0, idx - 1)];
        if (prev) setSelectedGpId(prev.gpId);
        return;
      }
      if (focusedCriterion && /^[0-9]$/.test(e.key)) {
        const num = Number(e.key);
        const c = CRITERIA.find(x => x.key === focusedCriterion);
        if (!c) return;
        if (num < 0 || num > c.max) return;
        e.preventDefault();
        setScores(prev => ({ ...prev, [focusedCriterion]: num }));
        // Auto-advance focus to next criterion after a beat.
        const orderIdx = CRITERIA.findIndex(x => x.key === focusedCriterion);
        if (orderIdx >= 0 && orderIdx < CRITERIA.length - 1) {
          setFocusedCriterion(CRITERIA[orderIdx + 1].key);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cadenceData, selectedGpId, focusedCriterion, handleSubmit]);

  const setScore = (key: CriterionKey, value: number) =>
    setScores(prev => ({ ...prev, [key]: value }));
  const appendComment = (key: CriterionKey, text: string) => {
    setComments(prev => ({ ...prev, [key]: prev[key] ? `${prev[key]} ${text}`.trim() : text }));
  };

  const summary = cadenceData?.summary;

  return (
    <div className="space-y-4 p-4 md:p-6 min-h-screen animate-fade-in">
      <PageHeader
        title="Workspace"
        subtitle="Evaluate your team in 30-second loops — keyboard-first, smart pre-fill, auto-advance"
        icon={Zap}
        actions={(
          <div className="flex items-center gap-2 flex-wrap">
            {summary && (
              <>
                <SummaryPill icon={AlertTriangle} value={summary.never + summary.overdue} label="To do" tone="rose" />
                <SummaryPill icon={Clock} value={summary.dueSoon} label="Due soon" tone="amber" />
                <SummaryPill icon={CheckCircle2} value={summary.fresh} label="Fresh" tone="emerald" />
              </>
            )}
            <StudioworksImportButton
              variant="outline"
              size="sm"
              onImported={() => refetchCadence()}
            />
          </div>
        )}
      />

      {/* Team picker */}
      <div className="glass-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Team</span>
        </div>
        <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
          <SelectTrigger className="glass-input h-9 min-w-[200px]">
            <SelectValue placeholder="Select team..." />
          </SelectTrigger>
          <SelectContent>
            {teams?.map(t => (
              <SelectItem key={t.id} value={String(t.id)}>{t.teamName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <Keyboard className="h-3.5 w-3.5" />
          <span><kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">J</kbd> next · <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">K</kbd> prev · <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">⌘↵</kbd> submit</span>
        </div>
      </div>

      {/* Three-panel grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left rail — Cadence Queue */}
        <div className="col-span-12 lg:col-span-3 space-y-3">
          <div className="glass-card p-3 space-y-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Cadence Queue</h3>
              {cadenceData?.gps && (
                <Badge variant="outline" className="text-[10px] ml-auto">{cadenceData.gps.length}</Badge>
              )}
            </div>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search GP…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="glass-input h-8 pl-7 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                { id: "all", label: "All", count: cadenceData?.gps.length ?? 0 },
                { id: "overdue", label: "Overdue", count: summary?.overdue ?? 0 },
                { id: "due-soon", label: "Due soon", count: summary?.dueSoon ?? 0 },
                { id: "never", label: "Never", count: summary?.never ?? 0 },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id as any)}
                  className={`text-[10px] px-2 py-1 rounded-full border ${
                    filter === f.id
                      ? "bg-primary/15 border-primary/30 text-primary font-semibold"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {f.label} <span className="opacity-70 tabular-nums">{f.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card p-2 max-h-[60vh] overflow-y-auto">
            {cadenceLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : filteredGps.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>{filter === "all" ? "No GPs found" : "Nothing matches this filter"}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredGps.map(gp => {
                  const ub = urgencyBadge(gp.urgency);
                  const active = gp.gpId === selectedGpId;
                  return (
                    <button
                      key={gp.gpId}
                      type="button"
                      onClick={() => setSelectedGpId(gp.gpId)}
                      className={`w-full text-left rounded-lg px-2.5 py-2 transition-all border ${
                        active
                          ? "bg-primary/10 border-primary/30 shadow-sm"
                          : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold truncate ${active ? "text-primary" : "text-slate-800"}`}>
                          {gp.gpName}
                        </span>
                        <Badge className={`text-[9px] border ${ub.className} font-semibold tabular-nums`}>
                          {ub.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {gp.daysSince == null ? "Never" : `${gp.daysSince}d ago`}
                        </span>
                        {gp.lastTotal != null && (
                          <span className="tabular-nums">{gp.lastTotal}/{maxTotal}</span>
                        )}
                      </div>
                      {gp.openActions > 0 && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700">
                          <Flag className="h-2.5 w-2.5" /> {gp.openActions} action{gp.openActions === 1 ? "" : "s"}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center — Quick Evaluate */}
        <div className="col-span-12 lg:col-span-6 space-y-3">
          {!selectedGp ? (
            <div className="glass-card p-12 text-center">
              <Zap className="h-12 w-12 mx-auto mb-3 text-primary opacity-50" />
              <h3 className="font-semibold">Pick a GP from the queue to start evaluating</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Most overdue GPs appear at the top.
              </p>
            </div>
          ) : (
            <>
              <div className="glass-card p-4 space-y-1">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{selectedGp.gpName}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedGp.evalCount === 0
                        ? "Never evaluated yet — establish baseline."
                        : `Last evaluated ${selectedGp.daysSince != null ? `${selectedGp.daysSince}d ago` : "—"} · ${selectedGp.evalCount} total evals`}
                    </p>
                    {/* Smart-suggest confidence pill — surfaces that the
                        score buttons were pre-filled from the GP's recent
                        history so the FM only confirms or adjusts. */}
                    {selectedGp.suggestedScores && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-white">
                        <Sparkles className={`h-3 w-3 ${
                          selectedGp.suggestedScores.confidence === "high" ? "text-emerald-600"
                          : selectedGp.suggestedScores.confidence === "medium" ? "text-amber-600"
                          : "text-slate-500"
                        }`} />
                        <span className="text-slate-700">Auto-filled</span>
                        <span className={`uppercase tracking-wider ${
                          selectedGp.suggestedScores.confidence === "high" ? "text-emerald-700"
                          : selectedGp.suggestedScores.confidence === "medium" ? "text-amber-700"
                          : "text-slate-600"
                        }`}>
                          {selectedGp.suggestedScores.confidence} conf
                        </span>
                        <span className="text-slate-400">
                          · {selectedGp.suggestedScores.sampleSize} eval{selectedGp.suggestedScores.sampleSize === 1 ? "" : "s"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">This eval</p>
                      <p className="text-2xl font-bold tabular-nums text-primary">
                        {totalScore}<span className="text-sm text-muted-foreground">/{maxTotal}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="date"
                      value={evalDate}
                      onChange={e => setEvalDate(e.target.value)}
                      className="glass-input h-8 w-[140px] text-xs"
                    />
                  </div>
                  <Input
                    placeholder="Game (optional, e.g. Lightning Roulette)"
                    value={game}
                    onChange={e => setGame(e.target.value)}
                    className="glass-input h-8 flex-1 text-xs"
                  />
                </div>
              </div>

              <div className="glass-card p-4 space-y-3">
                {CRITERIA.map(c => {
                  const value = scores[c.key];
                  const last = selectedGp.lastSubscores?.[c.key] ?? null;
                  const focused = focusedCriterion === c.key;
                  return (
                    <CriterionRow
                      key={c.key}
                      criterion={c}
                      value={value}
                      lastValue={last}
                      focused={focused}
                      onFocus={() => setFocusedCriterion(c.key)}
                      onSet={(v) => {
                        setScore(c.key, v);
                        // advance focus
                        const idx = CRITERIA.findIndex(x => x.key === c.key);
                        if (idx >= 0 && idx < CRITERIA.length - 1) setFocusedCriterion(CRITERIA[idx + 1].key);
                      }}
                      comment={comments[c.key]}
                      onCommentChange={(v) => setComments(p => ({ ...p, [c.key]: v }))}
                      onChip={(text) => appendComment(c.key, text)}
                    />
                  );
                })}

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="text-muted-foreground"
                    onClick={() => {
                      setScores({ hair: null, makeup: null, outfit: null, posture: null, dealing: null, perf: null });
                      setComments({ hair: "", makeup: "", outfit: "", posture: "", dealing: "", perf: "" });
                    }}
                  >
                    Clear scores
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!isFormValid || createMutation.isPending}
                    className="bg-gradient-to-r from-primary to-primary/80 text-white"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1.5" />
                    )}
                    Save & Next ({totalScore}/{maxTotal})
                    <span className="ml-2 hidden sm:inline text-[10px] opacity-80">⌘↵</span>
                  </Button>
                </div>

                {showHotkeysHint && (
                  <div className="text-[11px] text-muted-foreground bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <Keyboard className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-500" />
                    <span className="flex-1">
                      Press <kbd className="px-1 rounded bg-white border border-slate-200">1</kbd>–<kbd className="px-1 rounded bg-white border border-slate-200">5</kbd> to set scores · focus auto-advances · <kbd className="px-1 rounded bg-white border border-slate-200">⌘↵</kbd> saves and jumps to next GP.
                    </span>
                    <button
                      onClick={() => setShowHotkeysHint(false)}
                      className="text-slate-400 hover:text-slate-600 text-[10px] uppercase tracking-wider"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right rail — GP Context */}
        <div className="col-span-12 lg:col-span-3 space-y-3">
          {!selectedGp ? null : (
            <>
              {selectedGp.watchZone.length > 0 && (
                <div className="glass-card p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FlaskConical className="h-4 w-4 text-amber-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700">Watch Zone</h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Sub-scores below 70% across the last 3 evals.
                  </p>
                  <div className="space-y-1">
                    {selectedGp.watchZone.map(w => (
                      <div key={w.key} className="flex items-center justify-between text-xs">
                        <span className="text-slate-700">{w.label}</span>
                        <span className="tabular-nums font-semibold text-amber-700">
                          {w.avg.toFixed(1)}/{w.max}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="glass-card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Per-criterion trend</h3>
                </div>
                <div className="space-y-2">
                  {CRITERIA.map(c => (
                    <div key={c.key} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-700 min-w-[100px]">
                        <c.icon className="h-3 w-3 text-slate-500" />
                        {c.label}
                      </div>
                      <MiniSpark
                        values={selectedGp.trends[c.key]}
                        max={c.max}
                        color="hsl(220 80% 55%)"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {selectedGp.recentEvals.length > 0 && (
                <div className="glass-card p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-4 w-4 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider">Recent evals</h3>
                  </div>
                  <div className="space-y-1.5">
                    {selectedGp.recentEvals.map(re => (
                      <div key={re.id} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="truncate">{fmtDate(re.date)}{re.game ? ` · ${re.game}` : ""}</span>
                        </div>
                        <span className="font-semibold tabular-nums text-slate-700">{re.totalScore ?? "—"}/{maxTotal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedGp.attendance && (
                <div className="glass-card p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider">This month</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <AttPill icon={Stethoscope} label="Sick" value={selectedGp.attendance.sick} tone="blue" />
                    <AttPill icon={CalendarX} label="Missed" value={selectedGp.attendance.missed} tone="rose" />
                    <AttPill icon={Timer} label="Late" value={selectedGp.attendance.late} tone="amber" />
                    <AttPill icon={Briefcase} label="Extra" value={selectedGp.attendance.extra} tone="emerald" />
                  </div>
                </div>
              )}

              {selectedGp.openActions > 0 && (
                <div className="glass-card p-3 border-amber-200">
                  <div className="flex items-center gap-2">
                    <Flag className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-700">
                      {selectedGp.openActions} open action item{selectedGp.openActions === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// CriterionRow — single row of the eval form
// ============================================
function CriterionRow({
  criterion,
  value,
  lastValue,
  focused,
  onFocus,
  onSet,
  comment,
  onCommentChange,
  onChip,
}: {
  criterion: typeof CRITERIA[number];
  value: number | null;
  lastValue: number | null;
  focused: boolean;
  onFocus: () => void;
  onSet: (v: number) => void;
  comment: string;
  onCommentChange: (v: string) => void;
  onChip: (text: string) => void;
}) {
  const Icon = criterion.icon;
  const buttons = Array.from({ length: criterion.max + 1 }, (_, i) => i);
  const delta = value != null && lastValue != null ? value - lastValue : null;
  const chips = QUICK_COMMENTS[criterion.key];

  return (
    <div
      onClick={onFocus}
      className={`rounded-xl border p-3 transition-all ${
        focused ? "bg-primary/5 border-primary/30 shadow-sm" : "bg-white border-slate-200"
      }`}
      role="button"
      tabIndex={-1}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </span>
          <span className="text-sm font-semibold">{criterion.label}</span>
          <span className="text-[10px] text-muted-foreground">/{criterion.max}</span>
        </div>
        <div className="flex items-center gap-2">
          {lastValue != null && (
            <span className="text-[10px] text-muted-foreground">
              Last: <span className="tabular-nums font-semibold">{lastValue}</span>
            </span>
          )}
          {delta != null && delta !== 0 && (
            <span className={`text-[10px] font-semibold tabular-nums flex items-center gap-0.5 ${
              delta > 0 ? "text-emerald-600" : "text-rose-600"
            }`}>
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 mb-2">
        {buttons.map(n => (
          <button
            key={n}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSet(n);
            }}
            className={`h-9 flex-1 rounded-lg text-sm font-bold tabular-nums border transition-all ${
              value === n
                ? "bg-primary text-white border-primary shadow-md scale-105"
                : "bg-white text-slate-600 border-slate-200 hover:border-primary/40 hover:bg-primary/5"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {chips.map(chip => (
          <button
            key={chip}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChip(chip);
            }}
            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
          >
            <MessageSquare className="h-2.5 w-2.5 inline -mt-0.5 mr-0.5" />
            {chip}
          </button>
        ))}
      </div>

      <Textarea
        value={comment}
        onChange={e => onCommentChange(e.target.value)}
        placeholder="Comment (optional)…"
        className="glass-input text-xs min-h-[44px] resize-y"
        rows={1}
      />
    </div>
  );
}

// ============================================
// SummaryPill — top-right badge in the page header
// ============================================
function SummaryPill({
  icon: Icon, value, label, tone,
}: { icon: React.ComponentType<{ className?: string }>; value: number; label: string; tone: "rose" | "amber" | "emerald" }) {
  const cls = tone === "rose"
    ? "bg-rose-50 border-rose-200 text-rose-700"
    : tone === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-emerald-50 border-emerald-200 text-emerald-700";
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-sm font-bold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
    </div>
  );
}

// ============================================
// AttPill — attendance count chip in right rail
// ============================================
function AttPill({
  icon: Icon, label, value, tone,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: "blue" | "rose" | "amber" | "emerald" }) {
  const cls = tone === "blue"
    ? "bg-blue-50 border-blue-200 text-blue-700"
    : tone === "rose"
      ? "bg-rose-50 border-rose-200 text-rose-700"
      : tone === "amber"
        ? "bg-amber-50 border-amber-200 text-amber-700"
        : "bg-emerald-50 border-emerald-200 text-emerald-700";
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border ${cls}`}>
      <Icon className="h-3 w-3" />
      <span className="tabular-nums text-xs font-semibold">{value}</span>
      <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
    </div>
  );
}
