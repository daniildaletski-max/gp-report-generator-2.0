/**
 * PersonaImporter — multi-mode attendance importer for the casino HR
 * system Persona.
 *
 * The tabs from most-reliable to least:
 *   1. Roster — table of THIS team's GPs, FM types numbers in. No
 *      name-matching, no DOM scraping. The default tab — works
 *      regardless of Persona's HTML, browser cookie policy, or
 *      whether Persona is even reachable.
 *   2. Smart Paste — TSV/CSV rows pasted from Persona's schedule
 *      grid. Live match preview shows which names will resolve and
 *      which won't BEFORE submit. Unmatched names land in the
 *      Reconcile panel where one click links the Persona name to
 *      a GP and applies the row's data.
 *   3. Browser Import — same bookmarklet / console / paste-JSON
 *      flow as before. Useful when the FM already has Persona open
 *      and wants the per-day breakdown captured. Same Reconcile
 *      flow on the result.
 *   4. Aliases — saved Persona-name → GP mappings. Once an alias
 *      exists, future syncs skip fuzzy matching and resolve that
 *      name directly. Solves the "every month, the same 12 names
 *      fail to fuzzy-match" problem.
 *
 * Reconcile panel: any import that produces matchDetails surfaces
 * unmatched rows here. The FM picks the right GP from the candidate
 * list and we (a) save an alias for next time, (b) apply this row's
 * counts to the chosen GP. Eliminates the "import succeeded but
 * nothing happened" trap.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Download, Bookmark, Terminal, ExternalLink, Copy, Check, X,
  AlertTriangle, Loader2, Send, Calendar, Building2,
  Table2, ClipboardPaste, Globe, Link2, RefreshCw,
  Trash2, UserPlus, Sparkles, ChevronDown, ChevronUp, Save,
} from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ============================================
// Types
// ============================================
interface RosterRow {
  gpId: number;
  gpName: string;
  realName: string | null;
  sickLeaves: number;
  missedDays: number;
  extraShifts: number;
  lateToWork: number;
}
interface RosterEdit extends RosterRow {
  isDirty: boolean;
}
interface MatchDetail {
  gpId: number | null;
  gpName: string;
  personaName: string;
  matched: boolean;
  similarity: number;
  changes: Record<string, { from: number; to: number } | undefined>;
  applied?: boolean;
  breakdownChanged?: boolean;
  viaAlias?: boolean;
  reason?: "below-threshold" | "wrong-team" | "no-candidates";
  closestGpName?: string;
  closestGpId?: number | null;
  closestSimilarity?: number;
  candidates?: Array<{ gpId: number; gpName: string; similarity: number }>;
  pendingData?: {
    sickLeaves: number;
    missedDays: number;
    extraShifts: number;
    lateToWork: number;
    dayBreakdown: { sick: string[]; missed: string[]; extra: string[]; late: string[] };
  };
}

// ============================================
// Bookmarklet payload — IIFE that runs on persona.ee. Best-effort
// DOM walker; the Roster + Smart Paste paths are the real workhorses
// now, and the bookmarklet is only one of several fallback options.
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
    const workers = [];
    const rowSelectors = ["tr.worker-row", "tr[data-worker-id]", ".schedule-row", "tbody tr"];
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
    } catch (e) { /* fall through */ }
    if (postOk) { banner(postSummary, "#16a34a"); return; }
    if (clipboardCopied) {
      banner("Cross-origin auth blocked — JSON copied. Switch to GP Report → Persona → Browser Import → Paste JSON.", "#7c3aed");
      return;
    }
    banner("Couldn't auto-send. Open browser console: copy(window.__personaImportPayload).", "#dc2626");
    (window).__personaImportPayload = payload;
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
// Manual TSV parser — accepts tab- OR multi-space-separated rows.
// Returns parsed rows AND skipped-line count for the UI preview.
// ============================================
type ParsedRow = { name: string; sick: number; missed: number; late: number; extra: number };
function parseManualTSV(text: string): { rows: ParsedRow[]; skippedLines: number } {
  const out: ParsedRow[] = [];
  let skippedLines = 0;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const tokens = line.includes("\t")
      ? line.split(/\t+/).map(t => t.trim()).filter(t => t.length > 0)
      : line.split(/\s{2,}|\s+(?=\d)/).map(t => t.trim()).filter(t => t.length > 0);
    if (tokens.length < 5) {
      const numericTail: number[] = [];
      for (let j = tokens.length - 1; j >= 0; j--) {
        const n = Number(tokens[j]);
        if (Number.isFinite(n)) numericTail.unshift(n);
        else break;
      }
      if (numericTail.length === 0) { skippedLines++; continue; }
      const nameTokens = tokens.slice(0, tokens.length - numericTail.length);
      if (nameTokens.length === 0) { skippedLines++; continue; }
      const padded = [...numericTail];
      while (padded.length < 4) padded.push(0);
      const [sick, missed, late, extra] = padded;
      const candidateName = nameTokens.join(" ").trim();
      if (i === 0 && /^name$/i.test(candidateName)) { skippedLines++; continue; }
      out.push({ name: candidateName, sick, missed, late, extra });
      continue;
    }
    const [extra, late, missed, sick] = [
      Number(tokens[tokens.length - 1]),
      Number(tokens[tokens.length - 2]),
      Number(tokens[tokens.length - 3]),
      Number(tokens[tokens.length - 4]),
    ];
    if (![sick, missed, late, extra].every(n => Number.isFinite(n))) { skippedLines++; continue; }
    const name = tokens.slice(0, tokens.length - 4).join(" ").trim();
    if (!name) { skippedLines++; continue; }
    if (i === 0 && /^name$/i.test(name)) { skippedLines++; continue; }
    out.push({ name, sick, missed, late, extra });
  }
  return { rows: out, skippedLines };
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
  const [activeTab, setActiveTab] = useState<"roster" | "paste" | "browser" | "aliases">("roster");

  // Sync defaults when the host re-opens with a new team / period.
  useEffect(() => {
    if (defaultTeamId !== undefined) setTeamId(defaultTeamId);
  }, [defaultTeamId]);
  useEffect(() => { setMonth(defaultMonth); }, [defaultMonth]);
  useEffect(() => { setYear(defaultYear); }, [defaultYear]);

  // ────────────────────────────────────────────────────────────────
  // Roster tab — fetch + edit + save
  // ────────────────────────────────────────────────────────────────
  const rosterQuery = trpc.personaSync.roster.useQuery(
    { teamId: teamId ?? 0, month, year },
    { enabled: open && teamId != null && activeTab === "roster" }
  );
  const [rosterRows, setRosterRows] = useState<RosterEdit[]>([]);
  // When the roster query resolves with new data, replace local edits
  // — but only if the user hasn't typed anything dirty. Otherwise keep
  // their unsaved work.
  useEffect(() => {
    if (!rosterQuery.data) return;
    const fresh: RosterEdit[] = rosterQuery.data.map((r: RosterRow) => ({ ...r, isDirty: false }));
    setRosterRows(prev => {
      const anyDirty = prev.some(r => r.isDirty);
      if (anyDirty) return prev;
      return fresh;
    });
  }, [rosterQuery.data]);

  const saveRosterMutation = trpc.personaSync.saveRoster.useMutation({
    onSuccess: (res) => {
      toast.success(
        res.updated > 0
          ? `Saved — ${res.updated} GP${res.updated === 1 ? "" : "s"} updated, ${res.unchanged} unchanged.`
          : `No changes detected — every GP was already up to date.`
      );
      setRosterRows(prev => prev.map(r => ({ ...r, isDirty: false })));
      rosterQuery.refetch();
      onImported?.();
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const setRosterValue = useCallback((gpId: number, key: "sickLeaves" | "missedDays" | "lateToWork" | "extraShifts", raw: string) => {
    const n = Math.max(0, Math.min(31, Number(raw) || 0));
    setRosterRows(prev => prev.map(r => r.gpId === gpId ? { ...r, [key]: n, isDirty: true } : r));
  }, []);

  const onSaveRoster = useCallback(() => {
    if (!teamId) return;
    const dirtyOnly = rosterRows.filter(r => r.isDirty);
    const payload = (dirtyOnly.length > 0 ? dirtyOnly : rosterRows).map(r => ({
      gpId: r.gpId,
      sickLeaves: r.sickLeaves,
      missedDays: r.missedDays,
      extraShifts: r.extraShifts,
      lateToWork: r.lateToWork,
    }));
    if (payload.length === 0) {
      toast.error("No GPs in this team — add some on the Team management page first.");
      return;
    }
    saveRosterMutation.mutate({ teamId, month, year, rows: payload });
  }, [rosterRows, teamId, month, year, saveRosterMutation]);

  const dirtyCount = rosterRows.filter(r => r.isDirty).length;

  // ────────────────────────────────────────────────────────────────
  // Smart Paste tab — TSV with live match preview against the roster
  // ────────────────────────────────────────────────────────────────
  const [manualText, setManualText] = useState("");
  const importMutation = trpc.personaSync.importBatchForTeam.useMutation({
    onSuccess: (res) => {
      const updated = (res.matchDetails ?? []).filter((d: MatchDetail) =>
        d.matched && (typeof d.applied === "boolean" ? d.applied : Object.keys(d.changes ?? {}).length > 0)
      ).length;
      toast.success(`Imported — ${updated} updated, ${res.unmatched} unmatched.`);
      onImported?.();
      // Refresh roster so the new counts appear in the Roster tab.
      rosterQuery.refetch();
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const onImportManual = useCallback(() => {
    if (!teamId) { toast.error("Pick a team first"); return; }
    const { rows } = parseManualTSV(manualText);
    if (rows.length === 0) { toast.error("Couldn't parse any rows. Each line needs a name + 4 numbers."); return; }
    const workers = rows.map(r => ({
      name: r.name, workerId: 0, projectId: 0,
      sickLeaves: r.sick, missedDays: r.missed,
      extraShifts: r.extra, lateToWork: r.late,
      dayBreakdown: { sick: [], missed: [], extra: [], late: [] },
    }));
    importMutation.mutate({ teamId, month, year, workers }, {
      onSuccess: () => setManualText(""),
    });
  }, [manualText, importMutation, teamId, month, year]);

  // ────────────────────────────────────────────────────────────────
  // Browser Import tab — bookmarklet + console + paste-JSON
  // ────────────────────────────────────────────────────────────────
  const apiOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const script = useMemo(() => {
    if (teamId == null) return "";
    return buildBookmarkletScript({ apiOrigin, teamId, month, year });
  }, [apiOrigin, teamId, month, year]);

  const onCopyBookmarklet = useCallback(async () => {
    if (!script) { toast.error("Pick a team first"); return; }
    try { await navigator.clipboard.writeText(asBookmarkletHref(script));
      toast.success("Bookmarklet copied — drag it onto your bookmarks bar.");
    } catch { toast.error("Couldn't copy — copy manually from the textarea."); }
  }, [script]);

  const [pasteText, setPasteText] = useState("");
  const onImportPasted = useCallback(() => {
    const trimmed = pasteText.trim();
    if (!trimmed) return;
    let parsed: any;
    try { parsed = JSON.parse(trimmed); }
    catch { toast.error("Couldn't parse JSON — paste the bookmarklet's full payload."); return; }
    const payload = parsed?.json ?? parsed;
    if (!payload || !Array.isArray(payload.workers)) { toast.error("Pasted JSON missing workers array."); return; }
    importMutation.mutate({
      teamId: payload.teamId ?? teamId ?? 0,
      month: payload.month ?? month,
      year: payload.year ?? year,
      workers: payload.workers,
    }, { onSuccess: () => setPasteText("") });
  }, [pasteText, importMutation, teamId, month, year]);

  // Live match preview for Smart Paste — runs the parsed names against
  // the roster's GP names so the FM sees ahead of time which rows
  // will resolve and which won't. Falls back to a substring/normalized
  // check (the server is doing the real fuzzy match; we just want a
  // best-effort heads-up before submitting).
  const manualParsed = useMemo(() => parseManualTSV(manualText), [manualText]);
  const matchPreview = useMemo(() => {
    if (manualParsed.rows.length === 0 || !rosterQuery.data) return null;
    const roster: RosterRow[] = rosterQuery.data;
    const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
    const tokenize = (s: string) => norm(s).split(/[\s\-]+/).filter(t => t.length >= 2);
    const matched: Array<{ row: ParsedRow; gp: RosterRow }> = [];
    const unmatched: ParsedRow[] = [];
    for (const row of manualParsed.rows) {
      const rowTokens = new Set(tokenize(row.name));
      // First pass: exact-string match against name OR realName.
      const exact = roster.find(g => norm(g.gpName) === norm(row.name) || (g.realName && norm(g.realName) === norm(row.name)));
      if (exact) { matched.push({ row, gp: exact }); continue; }
      // Second pass: token-set equality (word order independent).
      const tokenHit = roster.find(g => {
        const gTokens = new Set(tokenize(g.gpName));
        const rTokens = new Set(tokenize(g.realName ?? ""));
        const sameSet = (a: Set<string>, b: Set<string>) =>
          a.size === b.size && Array.from(a).every(t => b.has(t));
        return sameSet(rowTokens, gTokens) || (g.realName && sameSet(rowTokens, rTokens));
      });
      if (tokenHit) { matched.push({ row, gp: tokenHit }); continue; }
      unmatched.push(row);
    }
    return { matched, unmatched, total: manualParsed.rows.length };
  }, [manualParsed, rosterQuery.data]);

  // ────────────────────────────────────────────────────────────────
  // Reconcile panel — surfaces unmatched names from the LAST import
  // ────────────────────────────────────────────────────────────────
  const lastImport = importMutation.data as
    | { matchDetails?: MatchDetail[]; matched?: number; unmatched?: number; totalPersonaWorkers?: number }
    | undefined;
  const unmatchedRows: MatchDetail[] = useMemo(
    () => (lastImport?.matchDetails ?? []).filter(d => !d.matched),
    [lastImport]
  );

  const linkAndApplyMutation = trpc.personaSync.linkAndApply.useMutation({
    onSuccess: () => {
      toast.success("Linked and applied — alias saved for next sync.");
      rosterQuery.refetch();
      onImported?.();
    },
    onError: (err) => toast.error(`Link failed: ${err.message}`),
  });
  const [resolved, setResolved] = useState<Set<string>>(new Set()); // personaName keys we've already linked
  // Reset resolved-set when a new import lands.
  useEffect(() => { setResolved(new Set()); }, [lastImport]);

  const onLinkUnmatched = useCallback((row: MatchDetail, gpId: number) => {
    if (!teamId || !row.pendingData) return;
    linkAndApplyMutation.mutate({
      teamId,
      gpId,
      personaName: row.personaName,
      month,
      year,
      sickLeaves: row.pendingData.sickLeaves,
      missedDays: row.pendingData.missedDays,
      extraShifts: row.pendingData.extraShifts,
      lateToWork: row.pendingData.lateToWork,
      dayBreakdown: row.pendingData.dayBreakdown,
    }, {
      onSuccess: () => setResolved(prev => new Set(prev).add(row.personaName)),
    });
  }, [linkAndApplyMutation, teamId, month, year]);

  // ────────────────────────────────────────────────────────────────
  // Aliases tab
  // ────────────────────────────────────────────────────────────────
  const aliasesQuery = trpc.personaSync.listAliases.useQuery(
    { teamId: teamId ?? 0 },
    { enabled: open && teamId != null && activeTab === "aliases" }
  );
  const deleteAliasMutation = trpc.personaSync.deleteAlias.useMutation({
    onSuccess: () => { toast.success("Alias removed"); aliasesQuery.refetch(); },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  // ────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Persona attendance — sync &amp; manual entry
          </DialogTitle>
          <DialogDescription>
            Pick a path. <strong>Roster</strong> is the most reliable: it bypasses every name-matching and Persona-DOM headache by editing your team's GPs directly.
          </DialogDescription>
        </DialogHeader>

        {/* Team / month / year picker */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Team
            </label>
            <Select value={teamId ? String(teamId) : ""} onValueChange={v => setTeamId(Number(v))}>
              <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Pick team…" /></SelectTrigger>
              <SelectContent>
                {teams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.teamName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Month
            </label>
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => <SelectItem key={i} value={String(i + 1)}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1">Year</label>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="roster" className="gap-1.5">
              <Table2 className="h-3.5 w-3.5" /> Roster
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5">
              <ClipboardPaste className="h-3.5 w-3.5" /> Smart Paste
            </TabsTrigger>
            <TabsTrigger value="browser" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Browser Import
            </TabsTrigger>
            <TabsTrigger value="aliases" className="gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Aliases
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pt-3">
            {/* ─── ROSTER TAB ─── */}
            <TabsContent value="roster" className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-700">
                  Direct entry: each row is one of <strong>your team's GPs</strong>. Type the counts; we save against the GP id, so spelling and word order can never go wrong here.
                </p>
                <Button variant="outline" size="sm" onClick={() => rosterQuery.refetch()} className="gap-1.5 shrink-0">
                  <RefreshCw className={`h-3.5 w-3.5 ${rosterQuery.isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              {rosterQuery.isLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
                </div>
              )}
              {!rosterQuery.isLoading && rosterRows.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No GPs in this team yet. Add team members first, then return here to log their attendance.
                </div>
              )}
              {rosterRows.length > 0 && (
                <>
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="grid grid-cols-[1fr_70px_70px_70px_70px] sm:grid-cols-[1fr_90px_90px_90px_90px] text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200 px-3 py-2">
                      <div>Game presenter</div>
                      <div className="text-center">🤒 Sick</div>
                      <div className="text-center">❌ Missed</div>
                      <div className="text-center">⏰ Late</div>
                      <div className="text-center">➕ Extra</div>
                    </div>
                    <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100">
                      {rosterRows.map(r => (
                        <div
                          key={r.gpId}
                          className={`grid grid-cols-[1fr_70px_70px_70px_70px] sm:grid-cols-[1fr_90px_90px_90px_90px] px-3 py-2 items-center hover:bg-slate-50 transition-colors ${r.isDirty ? "bg-amber-50/40" : ""}`}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate">{r.gpName}</div>
                            {r.realName && r.realName !== r.gpName && (
                              <div className="text-[11px] text-slate-500 truncate">HR: {r.realName}</div>
                            )}
                          </div>
                          <RosterCell value={r.sickLeaves} onChange={v => setRosterValue(r.gpId, "sickLeaves", v)} />
                          <RosterCell value={r.missedDays} onChange={v => setRosterValue(r.gpId, "missedDays", v)} />
                          <RosterCell value={r.lateToWork} onChange={v => setRosterValue(r.gpId, "lateToWork", v)} />
                          <RosterCell value={r.extraShifts} onChange={v => setRosterValue(r.gpId, "extraShifts", v)} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      {dirtyCount > 0 ? (
                        <span className="text-amber-700 font-medium">
                          {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"} · click Save to persist
                        </span>
                      ) : (
                        <>{rosterRows.length} GP{rosterRows.length === 1 ? "" : "s"} · all in sync</>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {dirtyCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => rosterQuery.refetch()}>
                          Discard
                        </Button>
                      )}
                      <Button onClick={onSaveRoster} disabled={dirtyCount === 0 || saveRosterMutation.isPending} className="gap-1.5">
                        {saveRosterMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save attendance
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ─── SMART PASTE TAB ─── */}
            <TabsContent value="paste" className="space-y-3">
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div>
                  Paste TSV from any source — copy a Persona schedule into Excel, then copy back here. We'll preview which names match GPs <strong>before</strong> you submit. Unmatched names land in the <em>Reconcile</em> panel below for one-click linking.
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 font-mono">
                Name &nbsp;&nbsp; Sick &nbsp;&nbsp; Missed &nbsp;&nbsp; Late &nbsp;&nbsp; Extra<br />
                Alicia Bel-Haj &nbsp;&nbsp; 1 &nbsp;&nbsp; 0 &nbsp;&nbsp; 0 &nbsp;&nbsp; 0<br />
                Anastassija Fomenkova &nbsp;&nbsp; 2 &nbsp;&nbsp; 0 &nbsp;&nbsp; 0 &nbsp;&nbsp; 0
              </div>
              <Textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={"Alicia Bel-Haj\t1\t0\t0\t0\nAnastassija Fomenkova\t2\t0\t0\t0"}
                className="font-mono text-xs h-40"
              />
              {matchPreview && (
                <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-1.5 ${
                  matchPreview.unmatched.length > 0
                    ? "border-amber-200 bg-amber-50/60 text-amber-900"
                    : "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      Live preview: {matchPreview.matched.length}/{matchPreview.total} will match
                    </span>
                    <span className="text-[10px] uppercase tracking-wider opacity-80">
                      {matchPreview.unmatched.length} unmatched
                    </span>
                  </div>
                  {matchPreview.unmatched.length > 0 && (
                    <div className="text-[11px]">
                      Won't match: {matchPreview.unmatched.slice(0, 5).map(r => r.name).join(", ")}
                      {matchPreview.unmatched.length > 5 && ` +${matchPreview.unmatched.length - 5} more`}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button onClick={onImportManual} disabled={!manualText.trim() || importMutation.isPending} className="gap-1.5">
                  {importMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Submit attendance
                </Button>
                {manualText.trim() && (
                  <Button variant="ghost" size="sm" onClick={() => setManualText("")}>Clear</Button>
                )}
              </div>
            </TabsContent>

            {/* ─── BROWSER IMPORT TAB ─── */}
            <TabsContent value="browser" className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-xs text-slate-700 leading-relaxed">
                  When Persona's schedule is open in your browser, run the bookmarklet — it scrapes the schedule grid and POSTs the parsed payload here. If cross-origin auth blocks the POST, the script copies the JSON payload to your clipboard; paste it below.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={onCopyBookmarklet} className="gap-1.5" disabled={!script}>
                    <Bookmark className="h-3.5 w-3.5" /> Copy bookmarklet
                  </Button>
                  {script && (
                    <a
                      href={asBookmarkletHref(script)}
                      onClick={(e) => { e.preventDefault(); toast.info("Drag this link to your bookmarks bar — clicking won't run."); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-grab"
                      draggable
                    >
                      📌 Drag me to bookmarks bar
                    </a>
                  )}
                  <a
                    href="https://reports.persona.ee/"
                    target="_blank" rel="noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                  >
                    Open Persona <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <details className="rounded-lg border border-slate-200 bg-white">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 select-none flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5" /> Console snippet (debug-friendly)
                  <ChevronDown className="h-3 w-3 ml-auto group-open:hidden" />
                </summary>
                <div className="px-3 pb-3 space-y-2 border-t border-slate-100">
                  <Button size="sm" variant="outline" onClick={async () => {
                    if (!script) return;
                    try { await navigator.clipboard.writeText(script); toast.success("Console snippet copied"); }
                    catch { toast.error("Couldn't copy"); }
                  }}>
                    <Copy className="h-3 w-3 mr-1.5" /> Copy snippet
                  </Button>
                  <Textarea readOnly value={script} className="font-mono text-[10px] h-32 resize-none" />
                </div>
              </details>

              <details className="rounded-lg border border-slate-200 bg-white" open>
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 select-none flex items-center gap-1.5">
                  <ClipboardPaste className="h-3.5 w-3.5" /> Paste JSON (when cross-origin auth is blocked)
                </summary>
                <div className="px-3 pb-3 space-y-2 border-t border-slate-100">
                  <Textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder='Paste the JSON the bookmarklet copied (starts with {"teamId":...)'
                    className="font-mono text-[10px] h-28"
                  />
                  <div className="flex items-center gap-2">
                    <Button onClick={onImportPasted} disabled={!pasteText.trim() || importMutation.isPending} className="gap-1.5" size="sm">
                      {importMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Import pasted data
                    </Button>
                    {pasteText.trim() && (
                      <Button variant="ghost" size="sm" onClick={() => setPasteText("")}>Clear</Button>
                    )}
                  </div>
                </div>
              </details>
            </TabsContent>

            {/* ─── ALIASES TAB ─── */}
            <TabsContent value="aliases" className="space-y-3">
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 text-xs text-blue-900">
                <strong>Saved Persona-name → GP mappings.</strong> Once an alias exists, future syncs skip fuzzy matching for that name and resolve it instantly. Aliases are created automatically when you link an unmatched name in the Reconcile panel below.
              </div>
              {aliasesQuery.isLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading aliases…
                </div>
              )}
              {!aliasesQuery.isLoading && (aliasesQuery.data ?? []).length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No saved aliases yet. They'll appear here as you link unmatched Persona names to GPs.
                </div>
              )}
              {(aliasesQuery.data ?? []).length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
                  {(aliasesQuery.data ?? []).map((a) => (
                    <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <span className="font-mono text-slate-700">{a.personaName}</span>
                          <span className="text-slate-400 mx-2">→</span>
                          <span className="font-medium text-slate-800">{a.gpName ?? `GP #${a.gamePresenterId}`}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Linked {new Date(a.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => deleteAliasMutation.mutate({ aliasId: a.id })}
                        disabled={deleteAliasMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        {/* ─── RECONCILE PANEL ─── */}
        {unmatchedRows.length > 0 && (
          <div className="border-t border-slate-200 pt-3">
            <ReconcilePanel
              unmatched={unmatchedRows}
              resolved={resolved}
              roster={rosterQuery.data ?? []}
              onLink={onLinkUnmatched}
              isPending={linkAndApplyMutation.isPending}
            />
          </div>
        )}

        {/* ─── LAST IMPORT SUMMARY (when not in Roster mode) ─── */}
        {lastImport && activeTab !== "roster" && (() => {
          const details: MatchDetail[] = lastImport.matchDetails ?? [];
          const updated = details.filter(d => {
            if (!d.matched) return false;
            if (typeof d.applied === "boolean") return d.applied;
            return d.changes && Object.keys(d.changes).length > 0;
          }).length;
          const matchedNoChange = (lastImport.matched ?? 0) - updated;
          const viaAlias = details.filter(d => d.matched && d.viaAlias).length;
          return (
            <div className="border-t border-slate-200 pt-3 flex flex-wrap gap-2 items-center">
              <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700 gap-1">
                <Check className="h-3 w-3" /> {updated} updated
              </Badge>
              {matchedNoChange > 0 && (
                <Badge className="bg-slate-100 border-slate-200 text-slate-600 gap-1">
                  {matchedNoChange} matched · no change
                </Badge>
              )}
              {viaAlias > 0 && (
                <Badge className="bg-blue-50 border-blue-200 text-blue-700 gap-1">
                  <Link2 className="h-3 w-3" /> {viaAlias} via alias
                </Badge>
              )}
              <Badge className="bg-amber-50 border-amber-200 text-amber-700 gap-1">
                <AlertTriangle className="h-3 w-3" /> {lastImport.unmatched ?? 0} unmatched
              </Badge>
              <Badge className="bg-slate-100 border-slate-200 text-slate-700 gap-1">
                {lastImport.totalPersonaWorkers ?? 0} total
              </Badge>
            </div>
          );
        })()}

        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Sub-components
// ============================================
function RosterCell({ value, onChange }: { value: number; onChange: (v: string) => void }) {
  return (
    <div className="flex justify-center">
      <Input
        type="number" min={0} max={31}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-14 text-center text-sm font-mono px-1"
      />
    </div>
  );
}

function ReconcilePanel({
  unmatched, resolved, roster, onLink, isPending,
}: {
  unmatched: MatchDetail[];
  resolved: Set<string>;
  roster: RosterRow[];
  onLink: (row: MatchDetail, gpId: number) => void;
  isPending: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const open = unmatched.filter(r => !resolved.has(r.personaName));
  const done = unmatched.filter(r => resolved.has(r.personaName));
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h4 className="text-sm font-semibold text-amber-900">
            Reconcile {open.length} unmatched name{open.length === 1 ? "" : "s"}
          </h4>
          {done.length > 0 && (
            <Badge className="bg-emerald-100 border-emerald-200 text-emerald-700 ml-1">
              {done.length} resolved
            </Badge>
          )}
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-amber-600" /> : <ChevronUp className="h-4 w-4 text-amber-600" />}
      </button>
      {!collapsed && (
        <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
          {open.length === 0 && (
            <p className="text-xs text-emerald-800 px-1 py-2">All unmatched names have been linked. 🎉</p>
          )}
          {open.map(row => (
            <ReconcileRow key={row.personaName} row={row} roster={roster} onLink={onLink} isPending={isPending} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReconcileRow({
  row, roster, onLink, isPending,
}: {
  row: MatchDetail;
  roster: RosterRow[];
  onLink: (row: MatchDetail, gpId: number) => void;
  isPending: boolean;
}) {
  // Combine server-provided candidates with the full team roster (so
  // the FM can override even when the fuzzy matcher saw nothing).
  const [pickerOpen, setPickerOpen] = useState(false);
  const cands = (row.candidates ?? []).slice(0, 3);
  const eventTotal =
    (row.pendingData?.sickLeaves ?? 0) +
    (row.pendingData?.missedDays ?? 0) +
    (row.pendingData?.lateToWork ?? 0) +
    (row.pendingData?.extraShifts ?? 0);
  return (
    <div className="rounded-lg bg-white border border-amber-200 px-3 py-2">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate">{row.personaName}</div>
          <div className="text-[10px] text-slate-500 flex items-center gap-2">
            {eventTotal > 0 ? (
              <>🤒 {row.pendingData?.sickLeaves} · ❌ {row.pendingData?.missedDays} · ⏰ {row.pendingData?.lateToWork} · ➕ {row.pendingData?.extraShifts}</>
            ) : (
              <>no events parsed</>
            )}
            {row.reason && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">
                {row.reason === "wrong-team" ? "wrong team" :
                 row.reason === "below-threshold" ? "low similarity" : "no candidates"}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {cands.length > 0 ? cands.map(c => (
          <Button
            key={c.gpId}
            size="sm" variant="outline"
            disabled={isPending}
            onClick={() => onLink(row, c.gpId)}
            className="h-7 text-xs gap-1"
          >
            <UserPlus className="h-3 w-3" />
            {c.gpName}
            <span className="text-[10px] text-slate-500 ml-0.5">{Math.round(c.similarity * 100)}%</span>
          </Button>
        )) : (
          <span className="text-[11px] text-slate-500 italic">No team candidates — pick manually:</span>
        )}
        <Button
          size="sm" variant="ghost"
          onClick={() => setPickerOpen(o => !o)}
          className="h-7 text-xs"
        >
          {pickerOpen ? "Hide list" : "Pick from full roster"}
        </Button>
      </div>
      {pickerOpen && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 divide-y divide-slate-200">
          {roster.length === 0 && (
            <div className="px-2 py-2 text-[11px] text-slate-500">
              Roster is empty — load it on the Roster tab first.
            </div>
          )}
          {roster.map(g => (
            <button
              key={g.gpId}
              disabled={isPending}
              onClick={() => onLink(row, g.gpId)}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <UserPlus className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="truncate">{g.gpName}</span>
              {g.realName && g.realName !== g.gpName && (
                <span className="text-[10px] text-slate-400 truncate">· HR: {g.realName}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
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
        Persona attendance
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
