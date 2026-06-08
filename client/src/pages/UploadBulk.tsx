import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useDropzone } from "react-dropzone";
import { nanoid } from "nanoid";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SCORE_CONFIG, MAX_TOTAL_SCORE } from "@shared/const";
import {
  CloudUpload, Loader2, Zap, CheckCircle2, AlertTriangle, X, RefreshCw,
  ImagePlus, Sparkles, UserPlus, UserCheck, ScanLine, FileWarning,
} from "lucide-react";

/**
 * Bulk AI Evaluation — drop many screenshots, the server extracts them in
 * parallel and returns a review grid: GP match, confidence flag, all six
 * scores inline-editable, screenshot thumb. Confirm/edit/drop rows, then
 * Save all writes them through `createEvaluation` in one shot.
 *
 * Two-phase split (extract-only → review → save) so a wrong AI read no
 * longer pollutes the DB — the existing single-shot `uploadAndExtract`
 * stays for the legacy single flow.
 */

type CriterionKey = "hair" | "makeup" | "outfit" | "posture" | "dealingStyle" | "gamePerformance";
const CRITERIA: CriterionKey[] = ["hair", "makeup", "outfit", "posture", "dealingStyle", "gamePerformance"];

type PreviewRow = {
  clientId: string;
  filename: string;
  status: "pending" | "extracting" | "ready" | "failed" | "saved";
  error?: string;
  screenshotUrl?: string;
  screenshotKey?: string;
  // Extracted + editable fields
  extractedName?: string;
  resolvedGpId?: number | "new"; // id of an existing GP, or "new" meaning "create with extractedName"
  evaluatorName?: string;
  evaluationDate?: string; // ISO yyyy-mm-dd for the <input type=date>
  game?: string;
  scores: Partial<Record<CriterionKey, number>>;
  comments: Partial<Record<CriterionKey, string>>;
  // Server-side hints
  suggestedGp?: { id: number; name: string; similarity: number; isExactMatch: boolean } | null;
  needsReview?: boolean;
  reviewReason?: string | null;
};

const CHUNK = 6; // client-side: extract this many at a time (server itself caps internal concurrency)
const MAX_PER_BATCH = 50; // a single "Save all" can include at most this many rows

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

function safeFilename(name: string): string {
  // The server enforces /^[\w\-. ]+$/. Make any name pass.
  return (name.replace(/[^\w\-. ]+/g, "_") || "screenshot.png").slice(0, 200);
}

export function BulkUploadPanel({ modeToggle }: { modeToggle?: ReactNode }) {
  const utils = trpc.useUtils();
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map()); // raw File kept off-state for base64 conversion
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: gpList } = trpc.gamePresenter.list.useQuery(undefined, { staleTime: 60_000 });

  const bulkExtract = trpc.evaluation.bulkExtract.useMutation();
  const bulkSave = trpc.evaluation.bulkSave.useMutation();

  // ---- drop / add files ----------------------------------------------------
  const addFiles = useCallback((files: File[]) => {
    const newRows: PreviewRow[] = [];
    for (const f of files) {
      if (!/^image\/(png|jpeg|jpg|webp)$/.test(f.type)) {
        toast.error(`Skipped ${f.name}: not a PNG / JPEG / WebP`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`Skipped ${f.name}: > 10 MB`);
        continue;
      }
      const clientId = nanoid();
      filesRef.current.set(clientId, f);
      newRows.push({
        clientId,
        filename: f.name,
        status: "pending",
        scores: {},
        comments: {},
        evaluationDate: isoToday(),
      });
    }
    if (newRows.length === 0) return;
    setRows((r) => [...r, ...newRows]);
  }, []);

  const onDrop = useCallback((accepted: File[]) => addFiles(accepted), [addFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] },
    multiple: true,
  });

  // ---- extract -------------------------------------------------------------
  const extractAll = useCallback(async () => {
    const pending = rows.filter((r) => r.status === "pending");
    if (pending.length === 0) {
      toast.info("Nothing to extract");
      return;
    }
    setIsExtracting(true);
    // Mark them all as "extracting" so the UI reflects the work in flight
    setRows((rs) => rs.map((r) => (r.status === "pending" ? { ...r, status: "extracting" } : r)));

    try {
      for (let i = 0; i < pending.length; i += CHUNK) {
        const chunk = pending.slice(i, i + CHUNK);
        const files = await Promise.all(chunk.map(async (row) => {
          const file = filesRef.current.get(row.clientId)!;
          return {
            clientId: row.clientId,
            filename: safeFilename(file.name),
            mimeType: file.type,
            imageBase64: await fileToBase64(file),
          };
        }));

        try {
          const res = await bulkExtract.mutateAsync({ files });
          setRows((rs) => rs.map((r) => {
            const hit = res.results.find((x) => x.clientId === r.clientId);
            if (!hit) return r;
            if (!hit.ok || !hit.preview) {
              return { ...r, status: "failed", error: hit.error ?? "Extraction failed" };
            }
            const p = hit.preview;
            const ev = p.extracted;
            const dateStr = p.parsedDate
              ? new Date(p.parsedDate).toISOString().slice(0, 10)
              : r.evaluationDate ?? isoToday();
            return {
              ...r,
              status: "ready",
              screenshotUrl: p.screenshotUrl,
              screenshotKey: p.screenshotKey,
              extractedName: ev.presenterName,
              resolvedGpId: p.suggestedGp?.id ?? (ev.presenterName ? "new" : undefined),
              evaluatorName: ev.evaluatorName,
              evaluationDate: dateStr,
              game: ev.game,
              scores: {
                hair: ev.hair?.score,
                makeup: ev.makeup?.score,
                outfit: ev.outfit?.score,
                posture: ev.posture?.score,
                dealingStyle: ev.dealingStyle?.score,
                gamePerformance: ev.gamePerformance?.score,
              },
              comments: {
                hair: ev.hair?.comment,
                makeup: ev.makeup?.comment,
                outfit: ev.outfit?.comment,
                posture: ev.posture?.comment,
                dealingStyle: ev.dealingStyle?.comment,
                gamePerformance: ev.gamePerformance?.comment,
              },
              suggestedGp: p.suggestedGp,
              needsReview: p.quality.needsReview,
              reviewReason: p.quality.reason,
            };
          }));
        } catch (e: any) {
          // Chunk-level failure: mark chunk as failed but keep going.
          setRows((rs) => rs.map((r) => {
            if (!chunk.find((c) => c.clientId === r.clientId)) return r;
            return { ...r, status: "failed", error: e?.message ?? "Extraction failed" };
          }));
          toast.error(`Extraction chunk failed: ${e?.message ?? "unknown error"}`);
        }
      }
    } finally {
      setIsExtracting(false);
    }
  }, [rows, bulkExtract]);

  // ---- save ----------------------------------------------------------------
  const readyRows = useMemo(() => rows.filter((r) => r.status === "ready"), [rows]);
  const totalByRow = useCallback((r: PreviewRow): number => {
    return CRITERIA.reduce((sum, k) => sum + (r.scores[k] ?? 0), 0);
  }, []);

  const saveAll = useCallback(async () => {
    if (readyRows.length === 0) {
      toast.info("Nothing ready to save");
      return;
    }
    if (readyRows.length > MAX_PER_BATCH) {
      toast.error(`Save in chunks of ${MAX_PER_BATCH}`);
      return;
    }
    // Validate: every row must have a GP resolution
    const missing = readyRows.filter((r) => !r.resolvedGpId && !r.extractedName);
    if (missing.length > 0) {
      toast.error(`${missing.length} row${missing.length === 1 ? " is" : "s are"} missing a GP — pick one or set a name to create`);
      return;
    }
    setIsSaving(true);
    try {
      const payload = readyRows.map((r) => {
        const useExisting = typeof r.resolvedGpId === "number";
        return {
          clientId: r.clientId,
          gpId: useExisting ? (r.resolvedGpId as number) : undefined,
          createGpName: useExisting ? undefined : (r.extractedName ?? "Unknown"),
          evaluatorName: r.evaluatorName || undefined,
          evaluationDate: r.evaluationDate ? new Date(r.evaluationDate) : new Date(),
          game: r.game || undefined,
          hairScore: r.scores.hair,
          hairComment: r.comments.hair,
          makeupScore: r.scores.makeup,
          makeupComment: r.comments.makeup,
          outfitScore: r.scores.outfit,
          outfitComment: r.comments.outfit,
          postureScore: r.scores.posture,
          postureComment: r.comments.posture,
          dealingStyleScore: r.scores.dealingStyle,
          dealingStyleComment: r.comments.dealingStyle,
          gamePerformanceScore: r.scores.gamePerformance,
          gamePerformanceComment: r.comments.gamePerformance,
          screenshotUrl: r.screenshotUrl,
          screenshotKey: r.screenshotKey,
        };
      });

      const res = await bulkSave.mutateAsync({ rows: payload });
      const savedIds = new Set(res.created.map((c) => c.clientId));
      const failedMap = new Map(res.failed.map((f) => [f.clientId, f.error]));
      setRows((rs) => rs.map((r) => {
        if (savedIds.has(r.clientId)) return { ...r, status: "saved" };
        if (failedMap.has(r.clientId)) return { ...r, status: "failed", error: failedMap.get(r.clientId) };
        return r;
      }));
      const review = res.created.filter((c) => c.needsReview).length;
      toast.success(
        `Saved ${res.created.length}${res.failed.length ? `, ${res.failed.length} failed` : ""}${review ? ` — ${review} flagged for review` : ""}`,
      );
      // Make Dashboard / coverage refresh.
      utils.evaluation.coverage.invalidate();
      utils.evaluation.list.invalidate();
      utils.dashboard.insights.invalidate();
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  }, [readyRows, bulkSave, utils]);

  // ---- row mutators --------------------------------------------------------
  const update = (clientId: string, patch: Partial<PreviewRow>) =>
    setRows((rs) => rs.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));
  const updateScore = (clientId: string, key: CriterionKey, v: number | undefined) =>
    setRows((rs) => rs.map((r) => (r.clientId === clientId ? { ...r, scores: { ...r.scores, [key]: v } } : r)));
  const removeRow = (clientId: string) => {
    filesRef.current.delete(clientId);
    setRows((rs) => rs.filter((r) => r.clientId !== clientId));
  };
  const clearSaved = () => {
    setRows((rs) => {
      const remaining = rs.filter((r) => r.status !== "saved");
      // also clean filesRef for removed clientIds
      for (const r of rs) if (r.status === "saved") filesRef.current.delete(r.clientId);
      return remaining;
    });
  };

  // ---- counters ------------------------------------------------------------
  const counts = useMemo(() => {
    const c = { pending: 0, extracting: 0, ready: 0, failed: 0, saved: 0, flagged: 0 };
    for (const r of rows) {
      c[r.status]++;
      if (r.status === "ready" && r.needsReview) c.flagged++;
    }
    return c;
  }, [rows]);

  return (
    <div className="space-y-6 p-4 md:p-6 animate-fade-in">
      <PageHeader
        title="Upload"
        subtitle="Drop a stack of screenshots — the AI extracts them in parallel, you review one grid, then save them all at once."
        icon={ScanLine}
        actions={
          <div className="flex items-center gap-2">
            {modeToggle}
            {counts.saved > 0 && (
              <Button variant="outline" size="sm" onClick={clearSaved}>
                <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-600" /> Clear saved
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={extractAll}
              disabled={isExtracting || counts.pending === 0}
            >
              {isExtracting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5 text-primary" />}
              Extract {counts.pending > 0 ? `(${counts.pending})` : ""}
            </Button>
            <Button
              size="sm"
              onClick={saveAll}
              disabled={isSaving || counts.ready === 0}
            >
              {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Zap className="h-4 w-4 mr-1.5" />}
              Save all {counts.ready > 0 ? `(${counts.ready})` : ""}
            </Button>
          </div>
        }
      />

      {/* Drop zone */}
      <Card>
        <CardContent className="p-0">
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
              isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            <input {...getInputProps()} />
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 flex items-center justify-center">
              {isDragActive ? <CloudUpload className="h-6 w-6 text-primary" /> : <ImagePlus className="h-6 w-6 text-primary" />}
            </div>
            <p className="text-sm font-medium">
              {isDragActive ? "Drop them right here" : "Drag screenshots here, or click to pick"}
            </p>
            <p className="text-xs text-muted-foreground">PNG · JPEG · WebP, up to 10 MB each</p>
          </div>
        </CardContent>
      </Card>

      {/* Status strip */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <StatusChip label="Queued" value={counts.pending} />
          <StatusChip label="Extracting" value={counts.extracting} tone="sky" />
          <StatusChip label="Ready" value={counts.ready} tone="primary" />
          <StatusChip label="Flagged" value={counts.flagged} tone="amber" />
          <StatusChip label="Saved" value={counts.saved} tone="emerald" />
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="Nothing here yet"
          description="Drop a stack of evaluation screenshots above. The AI reads them in parallel and you review one grid, not 20 cards."
        />
      )}

      {/* Review grid */}
      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => (
            <ReviewRow
              key={row.clientId}
              row={row}
              gpList={gpList}
              totalByRow={totalByRow}
              onUpdate={update}
              onUpdateScore={updateScore}
              onRemove={removeRow}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- review row -------------------------------------------------------------

function ReviewRow({
  row,
  gpList,
  totalByRow,
  onUpdate,
  onUpdateScore,
  onRemove,
}: {
  row: PreviewRow;
  gpList: Array<{ id: number; name: string }> | undefined;
  totalByRow: (r: PreviewRow) => number;
  onUpdate: (id: string, patch: Partial<PreviewRow>) => void;
  onUpdateScore: (id: string, key: CriterionKey, v: number | undefined) => void;
  onRemove: (id: string) => void;
}) {
  const sortedGps = useMemo(() => {
    if (!gpList) return [];
    return [...gpList].sort((a, b) => a.name.localeCompare(b.name));
  }, [gpList]);

  const matchTone =
    row.suggestedGp?.isExactMatch ? "emerald"
    : row.suggestedGp && row.suggestedGp.similarity >= 0.7 ? "amber"
    : "sky";

  const isSaved = row.status === "saved";
  const isFailed = row.status === "failed";
  const isBusy = row.status === "extracting";
  const isEditable = row.status === "ready";

  return (
    <Card className={`overflow-hidden ${isSaved ? "opacity-70" : ""}`}>
      <CardContent className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
          {/* Thumbnail */}
          <div className="relative h-28 md:h-full rounded-lg overflow-hidden bg-muted/40 border">
            {row.screenshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.screenshotUrl} alt={row.filename} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              </div>
            )}
            {isSaved && (
              <div className="absolute inset-0 bg-emerald-500/15 flex items-center justify-center">
                <Badge className="bg-emerald-600 text-white border-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Saved</Badge>
              </div>
            )}
            {isFailed && (
              <div className="absolute inset-0 bg-rose-500/15 flex items-center justify-center">
                <Badge className="bg-rose-600 text-white border-rose-600"><FileWarning className="h-3 w-3 mr-1" /> Failed</Badge>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="space-y-2">
            {/* Header row: filename + flags + remove */}
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm truncate">{row.filename}</span>
                {isBusy && <Badge variant="outline" className="text-[10px]"><Loader2 className="h-3 w-3 mr-1 animate-spin" />extracting</Badge>}
                {row.needsReview && isEditable && (
                  <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Review
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => onRemove(row.clientId)} disabled={isSaved}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {isFailed && (
              <p className="text-xs text-rose-600">{row.error ?? "Extraction failed"}</p>
            )}

            {isBusy && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}

            {isEditable && (
              <>
                {/* GP resolution + date + game */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Game Presenter</label>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={
                          typeof row.resolvedGpId === "number" ? String(row.resolvedGpId)
                            : row.resolvedGpId === "new" ? "__new__"
                            : ""
                        }
                        onValueChange={(v) => {
                          if (v === "__new__") onUpdate(row.clientId, { resolvedGpId: "new" });
                          else onUpdate(row.clientId, { resolvedGpId: Number(v) });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Pick a GP" />
                        </SelectTrigger>
                        <SelectContent>
                          {row.extractedName && (
                            <SelectItem value="__new__">
                              <span className="inline-flex items-center gap-1.5"><UserPlus className="h-3 w-3" /> Create "{row.extractedName}"</span>
                            </SelectItem>
                          )}
                          {sortedGps.map((gp) => (
                            <SelectItem key={gp.id} value={String(gp.id)}>{gp.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {row.suggestedGp && typeof row.resolvedGpId === "number" && row.resolvedGpId === row.suggestedGp.id && (
                        <Badge variant="outline" className={
                          matchTone === "emerald" ? "text-emerald-700 border-emerald-200 bg-emerald-50 text-[10px]"
                          : matchTone === "amber" ? "text-amber-700 border-amber-200 bg-amber-50 text-[10px]"
                          : "text-sky-700 border-sky-200 bg-sky-50 text-[10px]"
                        }>
                          <UserCheck className="h-3 w-3 mr-1" />
                          {row.suggestedGp.isExactMatch ? "exact" : `${Math.round(row.suggestedGp.similarity * 100)}%`}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</label>
                    <Input
                      type="date"
                      value={row.evaluationDate ?? ""}
                      onChange={(e) => onUpdate(row.clientId, { evaluationDate: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Game</label>
                    <Input
                      value={row.game ?? ""}
                      onChange={(e) => onUpdate(row.clientId, { game: e.target.value })}
                      placeholder="Baccarat / Roulette …"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                {/* Review reason */}
                {row.reviewReason && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                    {row.reviewReason}
                  </p>
                )}

                {/* Scores grid */}
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="px-3 py-1.5 border-b flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
                    <span>Scores — tap to set</span>
                    <Badge variant="outline" className="text-xs normal-case">Total {totalByRow(row)}/{MAX_TOTAL_SCORE}</Badge>
                  </div>
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    {CRITERIA.map((key) => {
                      const cfg = SCORE_CONFIG[key];
                      const value = row.scores[key];
                      return (
                        <div key={key} className="flex items-center gap-2 py-1">
                          <span className="text-xs font-medium w-28 shrink-0">{cfg.label}</span>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: cfg.max + 1 }, (_, n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => onUpdateScore(row.clientId, key, value === n ? undefined : n)}
                                className={`h-6 w-6 rounded-md border text-[11px] font-semibold tabular-nums ${
                                  value === n
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                            <span className="text-[10px] text-muted-foreground ml-0.5">/{cfg.max}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusChip({ label, value, tone }: { label: string; value: number; tone?: "primary" | "sky" | "amber" | "emerald" }) {
  const map = {
    primary: "text-primary bg-primary/10 border-primary/20",
    sky: "text-sky-600 bg-sky-50 border-sky-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
  } as const;
  const cls = tone ? map[tone] : "text-muted-foreground bg-muted/40 border-border";
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <div className="text-xl font-bold tabular-nums leading-none">{value}</div>
      <div className="text-[11px] mt-1">{label}</div>
    </div>
  );
}
