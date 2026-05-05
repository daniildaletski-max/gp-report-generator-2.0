/**
 * PersonaImporter — client-side bookmarklet-driven import for
 * persona.ee. Bypasses the server-side Puppeteer scraper (which is
 * blocked by missing Chromium runtime libs on the deploy host) by
 * letting the FM's already-authenticated browser do the extraction.
 *
 * Flow:
 *  1. FM picks team + month + year, clicks "Copy bookmarklet".
 *  2. FM goes to persona.ee schedule page in another tab.
 *  3. FM clicks the bookmarklet on that page — it scrapes the
 *     visible schedule, classifies shift types (sick / missed /
 *     late / extra), and POSTs to /api/trpc/personaSync.importBatchForTeam.
 *  4. Same match-and-write path as the server scraper runs — anomaly
 *     detection, dayBreakdown JSON, fuzzy matcher, the lot.
 */

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Download, Bookmark, Terminal, ExternalLink, Copy, Check, X,
  AlertTriangle, Loader2, Send, ChevronRight, Calendar, Building2,
} from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ============================================
// Bookmarklet payload — IIFE that runs on persona.ee. Tries to walk
// the schedule grid, classify shift types by their text content
// (case-insensitive prefix match — same rules as server scraper),
// build the worker-attendance shape and POST it.
// ============================================
function buildBookmarkletScript(opts: {
  apiOrigin: string;
  teamId: number;
  month: number;
  year: number;
}): string {
  return `
(async () => {
  const API = ${JSON.stringify(opts.apiOrigin)};
  const TEAM = ${opts.teamId};
  const MONTH = ${opts.month};
  const YEAR = ${opts.year};
  const banner = (msg, color) => {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "position:fixed;top:16px;right:16px;background:" + color + ";color:white;padding:12px 16px;border-radius:8px;font-family:system-ui;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.2);max-width:400px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  };
  // Same shift-type buckets the server scraper uses, lower-case prefix.
  const bucketFor = (raw) => {
    const t = String(raw || "").toLowerCase().trim();
    if (!t) return null;
    if (t.startsWith("haigusleht") || t.startsWith("sick")) return "sick";
    if (t.startsWith("toopeatumine") || t.startsWith("tööpeatumine") || t.startsWith("missed")) return "missed";
    if (t.startsWith("vabapaev") || t.startsWith("vabapäev") || t.startsWith("extra")) return "extra";
    if (t.startsWith("hilinemine") || t.startsWith("hilinen") || t.startsWith("late")) return "late";
    return null;
  };
  try {
    banner("Scanning Persona schedule…", "#0ea5e9");

    // Persona schedule is typically a table — rows = workers, cols =
    // day cells. We try a few common selectors. If neither works,
    // we fall back to looking for any element with a worker name +
    // day cells underneath.
    const workers = [];
    const rowSelectors = [
      "tr.worker-row",
      "tr[data-worker-id]",
      ".schedule-row",
      "tbody tr",
    ];
    let rowEls = [];
    for (const sel of rowSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) { rowEls = Array.from(els); break; }
    }
    if (rowEls.length === 0) {
      banner("No schedule rows found. Open the monthly schedule view and retry.", "#dc2626");
      return;
    }
    for (const row of rowEls) {
      const nameEl = row.querySelector("[class*=name], [class*=worker], td:first-child a, td:first-child");
      const name = (nameEl?.textContent || "").trim();
      if (!name || name.length < 2) continue;
      const widAttr = row.getAttribute("data-worker-id");
      const workerId = widAttr ? Number(widAttr) : 0;
      const buckets = { sick: [], missed: [], extra: [], late: [] };
      // Iterate day cells. Each cell may carry an ISO date attribute
      // or we fall back to the cell index + month/year.
      const cells = row.querySelectorAll("td[data-date], td.day, td");
      let dayIndex = 0;
      for (const c of cells) {
        if (c === nameEl) continue;
        const dateAttr = c.getAttribute("data-date");
        const dayNumAttr = c.getAttribute("data-day");
        let iso = "";
        if (dateAttr && /^\\d{4}-\\d{2}-\\d{2}/.test(dateAttr)) {
          iso = dateAttr.slice(0, 10);
        } else {
          dayIndex++;
          const dayNum = dayNumAttr ? Number(dayNumAttr) : dayIndex;
          if (dayNum >= 1 && dayNum <= 31) {
            iso = YEAR + "-" + String(MONTH).padStart(2, "0") + "-" + String(dayNum).padStart(2, "0");
          }
        }
        if (!iso) continue;
        const text = c.getAttribute("title") || c.getAttribute("data-shift") || c.textContent || "";
        const bucket = bucketFor(text);
        if (bucket) buckets[bucket].push(iso);
      }
      // Push every worker — including those with zero events for
      // the month. Skipping zero-event workers means previously-
      // non-zero attendance rows would never be reset back to zero
      // when someone has a clean month (Codex P2 on PR #79).
      workers.push({
        name,
        workerId,
        projectId: 0,
        sickLeaves: buckets.sick.length,
        missedDays: buckets.missed.length,
        extraShifts: buckets.extra.length,
        lateToWork: buckets.late.length,
        dayBreakdown: buckets,
      });
    }

    if (workers.length === 0) {
      banner("Found 0 workers with shift data. Check the month / project view and retry.", "#dc2626");
      return;
    }

    // Build the payload first. We ALWAYS attempt to copy it to the
    // clipboard so the FM has a paste-mode fallback even when the
    // cross-origin POST fails (browsers with SameSite=Lax cookies
    // refuse to forward our session on cross-origin requests, which
    // means CORS preflight succeeds but auth fails on the import).
    const payload = { teamId: TEAM, month: MONTH, year: YEAR, workers: workers };
    let clipboardCopied = false;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      clipboardCopied = true;
    } catch (e) { /* clipboard may be blocked; non-fatal */ }

    banner("Found " + workers.length + " workers. Sending to GP Report…", "#0ea5e9");
    let postOk = false;
    let postSummary = "";
    try {
      const res = await fetch(API + "/api/trpc/personaSync.importBatchForTeam?batch=1", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "0": { json: payload } }),
      });
      if (res.ok) {
        const data = await res.json();
        const sum = data?.[0]?.result?.data?.json;
        if (sum) {
          postSummary = "Imported " + sum.matched + " matched, " + sum.unmatched + " unmatched";
          postOk = true;
        }
      }
    } catch (e) { /* network / CORS / cookie failure → fall through to paste-mode */ }

    if (postOk) {
      banner(postSummary, "#16a34a");
      return;
    }
    if (clipboardCopied) {
      banner("Cross-origin auth blocked — JSON copied. Switch to GP Report → Persona → Paste tab.", "#7c3aed");
      return;
    }
    banner("Couldn't auto-send. Open browser console: copy(" + JSON.stringify(payload).length + " bytes) — fall back to paste mode.", "#dc2626");
    // Last-ditch: stash the payload on window so the FM can grab it
    // via the console even when navigator.clipboard isn't available.
    (window as any).__personaImportPayload = payload;
  } catch (e) {
    banner("Error: " + (e && e.message ? e.message : e), "#dc2626");
  }
})();
  `.trim();
}

function asBookmarkletHref(script: string): string {
  return "javascript:" + encodeURIComponent(script);
}

// ============================================
// Component
// ============================================
export function PersonaImporter({
  open,
  onOpenChange,
  teams,
  defaultTeamId,
  defaultMonth,
  defaultYear,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Array<{ id: number; teamName: string }>;
  defaultTeamId?: number;
  defaultMonth: number;
  defaultYear: number;
  onImported?: () => void;
}) {
  const [teamId, setTeamId] = useState<number | null>(defaultTeamId ?? teams[0]?.id ?? null);
  const [month, setMonth] = useState<number>(defaultMonth);
  const [year, setYear] = useState<number>(defaultYear);
  // Paste-mode fallback: bookmarklet copies the JSON payload to the
  // clipboard, FM pastes it here, we POST same-origin. Always works
  // even when cross-origin auth is blocked.
  const [pasteText, setPasteText] = useState("");

  const importMutation = trpc.personaSync.importBatchForTeam.useMutation({
    onSuccess: (res) => {
      toast.success(`Imported ${res.matched} matched, ${res.unmatched} unmatched`);
      setPasteText("");
      onImported?.();
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const apiOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const script = useMemo(() => {
    if (teamId == null) return "";
    return buildBookmarkletScript({ apiOrigin, teamId, month, year });
  }, [apiOrigin, teamId, month, year]);

  const onCopyBookmarklet = useCallback(async () => {
    if (!script) {
      toast.error("Pick a team first");
      return;
    }
    try {
      await navigator.clipboard.writeText(asBookmarkletHref(script));
      toast.success("Bookmarklet copied — drag it onto your bookmarks bar.");
    } catch {
      toast.error("Couldn't copy — copy manually from the textarea below.");
    }
  }, [script]);

  const onCopyConsole = useCallback(async () => {
    if (!script) {
      toast.error("Pick a team first");
      return;
    }
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Console snippet copied — paste in Persona DevTools console.");
    } catch {
      toast.error("Couldn't copy — copy manually from the textarea below.");
    }
  }, [script]);

  const onImportPasted = useCallback(() => {
    const trimmed = pasteText.trim();
    if (!trimmed) return;
    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      toast.error("Couldn't parse JSON — make sure you copied the entire payload from the bookmarklet banner.");
      return;
    }
    // Accept either the raw payload object OR something wrapped in
    // `{ json: { ... } }` (legacy clipboard format).
    const payload = parsed?.json ?? parsed;
    if (!payload || !Array.isArray(payload.workers)) {
      toast.error("Pasted JSON doesn't contain a workers array.");
      return;
    }
    importMutation.mutate({
      teamId: payload.teamId ?? teamId ?? 0,
      month: payload.month ?? month,
      year: payload.year ?? year,
      workers: payload.workers,
    });
  }, [pasteText, importMutation, teamId, month, year]);

  // Live preview of the pasted JSON — recomputed on every keystroke
  // so the FM sees worker count + event totals before committing.
  // Used to catch the "0 events for everyone" case (DOM selectors
  // missed the shift data) before it produces a no-op import.
  const pastePreview = useMemo(() => {
    const trimmed = pasteText.trim();
    if (!trimmed) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
    const payload = parsed?.json ?? parsed;
    const workers: any[] = Array.isArray(payload?.workers) ? payload.workers : [];
    if (workers.length === 0) return null;
    let bySick = 0, byMissed = 0, byLate = 0, byExtra = 0;
    let workersWithEvents = 0;
    for (const w of workers) {
      const sick = Number(w?.sickLeaves ?? 0);
      const missed = Number(w?.missedDays ?? 0);
      const late = Number(w?.lateToWork ?? 0);
      const extra = Number(w?.extraShifts ?? 0);
      bySick += sick; byMissed += missed; byLate += late; byExtra += extra;
      if (sick + missed + late + extra > 0) workersWithEvents++;
    }
    const totalEvents = bySick + byMissed + byLate + byExtra;
    return {
      workerCount: workers.length,
      workersWithEvents,
      totalEvents,
      bySick, byMissed, byLate, byExtra,
    };
  }, [pasteText]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Import attendance from Persona
          </DialogTitle>
          <DialogDescription>
            Server-side Persona scraper is blocked by the Chromium runtime libs on this host. This tool runs in your already-authenticated Persona browser session instead.
          </DialogDescription>
        </DialogHeader>

        {/* Team / month / year picker */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Team
            </label>
            <Select value={teamId ? String(teamId) : ""} onValueChange={v => setTeamId(Number(v))}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue placeholder="Pick team…" />
              </SelectTrigger>
              <SelectContent>
                {teams.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.teamName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Month
            </label>
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1">Year</label>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="bookmarklet" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="bookmarklet" className="gap-1.5">
              <Bookmark className="h-3.5 w-3.5" /> Bookmarklet
            </TabsTrigger>
            <TabsTrigger value="console" className="gap-1.5">
              <Terminal className="h-3.5 w-3.5" /> Console
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5">
              <Send className="h-3.5 w-3.5" /> Paste
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pt-3">
            <TabsContent value="bookmarklet" className="space-y-3">
              <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
                <li>Pick the team / month / year above.</li>
                <li>Click <strong>Copy bookmarklet</strong> below and drag the URL onto your browser&apos;s bookmarks bar.</li>
                <li>Open <a href="https://reports.persona.ee/" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">Persona <ExternalLink className="h-3 w-3" /></a> and navigate to the schedule for the selected month.</li>
                <li>Click the bookmarklet — it scrapes the schedule and POSTs to GP Report. A banner shows progress.</li>
              </ol>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-xs text-slate-600 font-mono break-all overflow-hidden line-clamp-3">
                  {asBookmarkletHref(script).slice(0, 240)}…
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={onCopyBookmarklet} className="gap-1.5" disabled={!script}>
                    <Copy className="h-3.5 w-3.5" /> Copy bookmarklet
                  </Button>
                  {script && (
                    <a
                      href={asBookmarkletHref(script)}
                      onClick={(e) => { e.preventDefault(); toast.info("Drag this link to your bookmarks bar — clicking here won't run."); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-grab"
                      draggable
                    >
                      📌 Drag me to bookmarks bar
                    </a>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>The bookmarklet relies on Persona&apos;s schedule DOM. If the layout changes and it stops finding rows, switch to the <strong>Console</strong> tab for the same script — easier to debug from DevTools.</span>
              </div>
            </TabsContent>

            <TabsContent value="console" className="space-y-3">
              <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
                <li>Open <a href="https://reports.persona.ee/" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">Persona <ExternalLink className="h-3 w-3" /></a>, navigate to the schedule for the selected month.</li>
                <li>Open DevTools (F12 or Cmd+Opt+I), switch to <strong>Console</strong>.</li>
                <li>Click <strong>Copy snippet</strong>, paste into console, hit Enter.</li>
                <li>Banner shows progress; results appear here when import finishes.</li>
              </ol>
              <Button onClick={onCopyConsole} className="gap-1.5" disabled={!script}>
                <Copy className="h-3.5 w-3.5" /> Copy snippet
              </Button>
              <Textarea readOnly value={script} className="font-mono text-[10px] h-40 resize-none" />
            </TabsContent>

            {/* Paste fallback — for environments where the cross-origin
                POST is blocked (SameSite cookies, no CORS proxy). The
                bookmarklet copies the JSON payload to the clipboard
                and the FM pastes it here. Same-origin POST = no auth
                drama. */}
            <TabsContent value="paste" className="space-y-3">
              <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
                <li>Run the bookmarklet on Persona — when its banner says <em>"JSON copied"</em>, the payload is on your clipboard.</li>
                <li>Switch back here and paste below.</li>
                <li>Click <strong>Import pasted data</strong>. Same-origin POST so this works regardless of cookie / CORS settings.</li>
              </ol>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder='Paste the JSON the bookmarklet copied (starts with {"teamId":...)'
                className="font-mono text-[10px] h-40"
              />
              {/* Pre-submit preview — shows what we parsed so the FM
                  catches a "0 events for everyone" scenario BEFORE
                  submitting. The bookmarklet's DOM selectors guess
                  Persona's structure; if they miss, every worker
                  comes back with empty buckets and the import looks
                  successful but writes nothing. The preview surfaces
                  that case as a red warning instead of silent zero. */}
              {pastePreview && (
                <div className={`rounded-lg border px-3 py-2.5 text-xs ${
                  pastePreview.totalEvents === 0
                    ? "border-rose-200 bg-rose-50/60 text-rose-800"
                    : "border-emerald-200 bg-emerald-50/60 text-emerald-800"
                }`}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="font-semibold">
                      {pastePreview.workerCount} worker{pastePreview.workerCount === 1 ? "" : "s"} · {pastePreview.totalEvents} event{pastePreview.totalEvents === 1 ? "" : "s"} parsed
                    </span>
                    <span className="text-[10px] uppercase tracking-wider opacity-80">
                      {pastePreview.workersWithEvents}/{pastePreview.workerCount} have events
                    </span>
                  </div>
                  {pastePreview.totalEvents === 0 ? (
                    <p className="text-[11px]">
                      <strong>0 events for everyone.</strong> The bookmarklet ran but couldn&apos;t find shift data in Persona&apos;s DOM.
                      Importing now will not change attendance counts. Open the monthly schedule view in Persona before re-running the bookmarklet, or fall through to the server-side scrape.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span>🤒 {pastePreview.bySick} sick</span>
                      <span>❌ {pastePreview.byMissed} missed</span>
                      <span>⏰ {pastePreview.byLate} late</span>
                      <span>➕ {pastePreview.byExtra} extra</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button onClick={onImportPasted} disabled={!pasteText.trim() || importMutation.isPending} className="gap-1.5">
                  {importMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Import pasted data
                </Button>
                {pasteText.trim() && (
                  <Button variant="ghost" size="sm" onClick={() => setPasteText("")}>Clear</Button>
                )}
              </div>
            </TabsContent>
          </div>

          {importMutation.data && (() => {
            // Distinguish "matched and applied" from "matched but
            // nothing changed". The server returns matchDetails with
            // a per-row `applied` flag that's true when ANY write
            // happened — including breakdown-only writes where the
            // monthly totals didn't move but a sick day shifted from
            // the 3rd to the 7th (Codex P2 on PR #80). Falls back to
            // counting non-empty `changes` for older API payloads
            // that predate the `applied` flag.
            const data = importMutation.data as any;
            const details: any[] = Array.isArray(data.matchDetails) ? data.matchDetails : [];
            const updated = details.filter(d => {
              if (!d.matched) return false;
              if (typeof d.applied === "boolean") return d.applied;
              return d.changes && Object.keys(d.changes).length > 0;
            }).length;
            const matchedNoChange = (data.matched ?? 0) - updated;
            const allNoChange = data.matched > 0 && updated === 0;
            return (
              <div className="border-t border-slate-200 pt-3 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <ChevronRight className="h-3.5 w-3.5 text-primary" />
                  Last import
                </h4>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700 gap-1">
                    <Check className="h-3 w-3" /> {updated} updated
                  </Badge>
                  {matchedNoChange > 0 && (
                    <Badge className="bg-slate-100 border-slate-200 text-slate-600 gap-1">
                      {matchedNoChange} matched · no change
                    </Badge>
                  )}
                  <Badge className="bg-amber-50 border-amber-200 text-amber-700 gap-1">
                    <AlertTriangle className="h-3 w-3" /> {data.unmatched} unmatched
                  </Badge>
                  <Badge className="bg-slate-100 border-slate-200 text-slate-700 gap-1">
                    {data.totalPersonaWorkers} total
                  </Badge>
                </div>
                {allNoChange && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                    Every matched worker was already up-to-date — no attendance rows were written.
                    If Attendance still shows zeros, the bookmarklet likely couldn&apos;t parse Persona&apos;s shift data.
                    Re-run on the monthly schedule view; the Paste preview above should report a non-zero event total.
                  </p>
                )}
              </div>
            );
          })()}
        </Tabs>

        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PersonaImportButton({
  teams,
  defaultTeamId,
  defaultMonth,
  defaultYear,
  className,
  variant = "outline",
  size = "default",
  onImported,
}: {
  teams: Array<{ id: number; teamName: string }>;
  defaultTeamId?: number;
  defaultMonth: number;
  defaultYear: number;
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  onImported?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Download className="h-3.5 w-3.5 mr-1.5" />
        Import via bookmarklet
      </Button>
      <PersonaImporter
        open={open}
        onOpenChange={setOpen}
        teams={teams}
        defaultTeamId={defaultTeamId}
        defaultMonth={defaultMonth}
        defaultYear={defaultYear}
        onImported={onImported}
      />
    </>
  );
}
