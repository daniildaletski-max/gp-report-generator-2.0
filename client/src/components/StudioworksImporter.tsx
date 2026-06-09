/**
 * StudioworksImporter — Quick-import flow for evaluations originating
 * from team.studioworks.ee. Three feeder modes, one preview & commit
 * step.
 *
 * Why this exists: server-side Puppeteer scraper depends on Chromium
 * runtime libs we can't always install on the deploy host. The FM is
 * already logged into Studioworks in their browser — let *their*
 * browser do the extraction, then POST the structured rows here. Same
 * importOne() match/dedup as the server scraper.
 *
 * Modes:
 *  1) Bookmarklet — one-click "Copy bookmarklet" button. The FM goes
 *     to studioworks, drops it onto the toolbar, clicks → script
 *     scrapes the DOM and POSTs directly to our import endpoint.
 *  2) Console snippet — for devtools-comfortable users: copy a JS
 *     snippet, paste in Studioworks console, hit enter. Same scraper,
 *     no toolbar drag required.
 *  3) Bulk paste — fallback. FM copies the eval table from
 *     Studioworks, pastes into a textarea, we parse client-side.
 *
 * After extraction, every mode lands in the same Preview state where
 * the FM can deselect rows / fix names before committing.
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Download, Bookmark, Terminal, ClipboardPaste, Check, X, AlertTriangle,
  Loader2, Send, ExternalLink, Copy, ChevronRight, Search, Sparkles,
  Link2, RefreshCw, UserCheck, FileSpreadsheet, UploadCloud, UserPlus, Lightbulb,
} from "lucide-react";

// ============================================
// Bookmarklet payload — self-contained JS that scrapes the current
// Studioworks page, gathers evaluations, and POSTs to our endpoint.
// Designed to be tolerant of unknown DOM: tries JSON via fetch
// (re-using existing session cookies), falls back to scraping rows
// off the page. Never throws — surfaces errors to the user instead.
// ============================================
function buildBookmarkletScript(opts: { apiOrigin: string; sessionToken: string; autoRefreshMin?: number }): string {
  // The script is wrapped in an IIFE and as a string we URL-encode
  // for the bookmarklet form. Variables are inlined at copy time.
  const autoMin = Math.max(0, Math.floor(opts.autoRefreshMin ?? 0));
  const body = `
(async () => {
  const API = ${JSON.stringify(opts.apiOrigin)};
  const TOKEN = ${JSON.stringify(opts.sessionToken)};
  const AUTO_MIN = ${autoMin};
  // Idempotent guard so the user can't accidentally fire two
  // overlapping auto-refresh loops in the same Studioworks tab.
  if (window.__gpReportAutoRefresh) {
    clearInterval(window.__gpReportAutoRefresh);
    window.__gpReportAutoRefresh = null;
  }
  const banner = (msg, color) => {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "position:fixed;top:16px;right:16px;background:" + color + ";color:white;padding:12px 16px;border-radius:8px;font-family:system-ui;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.2)";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  };
  const runOnce = async () => {
  try {
    banner("Scanning Studioworks for evaluations…", "#0ea5e9");
    // Strategy 1: look for embedded JSON on page (Next/Nuxt/Inertia
    // patterns commonly drop a state blob into a <script id="__NEXT_DATA__">
    // or window.__INITIAL_STATE__). We pick whatever yields evals first.
    const collected = [];
    const tryJson = (obj) => {
      if (!obj || typeof obj !== "object") return;
      const stack = [obj];
      while (stack.length) {
        const cur = stack.pop();
        if (Array.isArray(cur)) { stack.push(...cur); continue; }
        if (cur && typeof cur === "object") {
          if (cur.presenter && (cur.score != null || cur.totalScore != null)) {
            collected.push(cur);
          } else {
            for (const k in cur) {
              if (cur[k] && typeof cur[k] === "object") stack.push(cur[k]);
            }
          }
        }
      }
    };
    const nextData = document.getElementById("__NEXT_DATA__");
    if (nextData?.textContent) {
      try { tryJson(JSON.parse(nextData.textContent)); } catch {}
    }
    if (window.__INITIAL_STATE__) tryJson(window.__INITIAL_STATE__);
    // Strategy 2: scrape DOM rows. Studioworks renders eval rows with
    // a recognisable presenter-name + per-criteria-score layout.
    if (collected.length === 0) {
      const rows = document.querySelectorAll("[data-eval-id], tr.evaluation-row, .evaluation-card, table tr");
      rows.forEach((row, idx) => {
        const text = row.textContent || "";
        if (!text || text.length < 20) return;
        const nums = (text.match(/\\b\\d+(?:\\.\\d+)?\\b/g) || []).map(Number).filter(n => n <= 30);
        const dateMatch = text.match(/\\d{4}-\\d{2}-\\d{2}/) || text.match(/\\d{2}\\.\\d{2}\\.\\d{4}/);
        const nameMatch = row.querySelector("[class*=name], .presenter, td:first-child")?.textContent?.trim();
        if (!nameMatch || nums.length < 3) return;
        collected.push({
          externalId: row.getAttribute("data-eval-id") || ("dom-" + idx + "-" + Date.now()),
          presenterName: nameMatch,
          date: dateMatch ? dateMatch[0] : new Date().toISOString().slice(0,10),
          totalScore: nums[nums.length - 1],
          ratings: {
            hair: nums[0] != null ? { score: nums[0], maxScore: 3 } : undefined,
            makeup: nums[1] != null ? { score: nums[1], maxScore: 3 } : undefined,
            outfit: nums[2] != null ? { score: nums[2], maxScore: 3 } : undefined,
            posture: nums[3] != null ? { score: nums[3], maxScore: 3 } : undefined,
            dealingStyle: nums[4] != null ? { score: nums[4], maxScore: 5 } : undefined,
            gamePerformance: nums[5] != null ? { score: nums[5], maxScore: 5 } : undefined,
          },
        });
      });
    }
    if (collected.length === 0) {
      banner("No evaluations found on this page. Open the evaluations list and retry.", "#dc2626");
      return;
    }
    banner("Found " + collected.length + " evaluations. Sending to GP Report Generator…", "#0ea5e9");
    const res = await fetch(API + "/api/trpc/studioworksSync.importBatch?batch=1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + TOKEN },
      body: JSON.stringify({ "0": { json: { evaluations: collected } } }),
    });
    if (!res.ok) {
      const t = await res.text();
      banner("Import failed: " + res.status + " " + (t.slice(0, 120)), "#dc2626");
      return;
    }
    const data = await res.json();
    const sum = data?.[0]?.result?.data?.json;
    if (sum) {
      banner("Imported " + sum.inserted + " new · " + sum.skippedExisting + " duplicate · " + sum.unmatched + " unmatched", "#16a34a");
    } else {
      banner("Done. Re-open GP Report to confirm.", "#16a34a");
    }
  } catch (e) {
    banner("Error: " + (e && e.message ? e.message : e), "#dc2626");
  }
  };
  await runOnce();
  if (AUTO_MIN > 0) {
    window.__gpReportAutoRefresh = setInterval(runOnce, AUTO_MIN * 60_000);
    banner("Auto-refresh ON: re-scraping every " + AUTO_MIN + " min. Click bookmarklet again to stop.", "#7c3aed");
  }
})();
  `.trim();
  return body;
}

function asBookmarkletHref(script: string): string {
  return "javascript:" + encodeURIComponent(script);
}

// ============================================
// Bulk-paste parser — handles common Studioworks paste shapes:
//  - Tab-separated table with header row containing "Presenter"
//  - Lines like "Anna Smith 2024-04-15 3 3 2 3 4 5 18"
//  - JSON arrays pasted directly
// Always returns a (possibly empty) array of ExtractedEvaluation-shaped
// objects.
// ============================================
type RawEval = {
  externalId: string;
  presenterName: string;
  evaluatorName?: string;
  date: string;
  game?: string;
  totalScore?: number;
  ratings: {
    hair?: { score: number; maxScore: number; comment?: string };
    makeup?: { score: number; maxScore: number; comment?: string };
    outfit?: { score: number; maxScore: number; comment?: string };
    posture?: { score: number; maxScore: number; comment?: string };
    dealingStyle?: { score: number; maxScore: number; comment?: string };
    gamePerformance?: { score: number; maxScore: number; comment?: string };
  };
  overallComment?: string;
};

function parseBulkPaste(text: string): RawEval[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // JSON first.
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      const arr = Array.isArray(json) ? json : json.evaluations ?? [json];
      return arr.map((e: any, i: number) => normalizeRow(e, i)).filter(Boolean) as RawEval[];
    } catch {
      // fall through
    }
  }
  // TSV / line-oriented.
  const lines = trimmed.split(/\r?\n/).filter(l => l.trim());
  const out: RawEval[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeader = i === 0 && /presenter|gp|name/i.test(line) && /score|hair|total/i.test(line);
    if (isHeader) continue;
    const parts = line.split(/\t+/).length > 1 ? line.split(/\t+/) : line.split(/\s{2,}|\s\|\s|\s,\s/);
    const row = parsePartsToEval(parts, i);
    if (row) out.push(row);
  }
  return out;
}

function normalizeRow(e: any, idx: number): RawEval | null {
  if (!e) return null;
  const name = e.presenterName || e.presenter || e.gp || e.name;
  if (!name) return null;
  const dateRaw = e.date || e.evaluationDate || e.evalDate;
  const date = typeof dateRaw === "string" ? dateRaw : (dateRaw ? new Date(dateRaw).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const r = e.ratings || {};
  const buildRating = (s: any, max: number) => {
    if (s == null) return undefined;
    if (typeof s === "number") return { score: s, maxScore: max };
    return { score: Number(s.score ?? s.value ?? 0), maxScore: Number(s.maxScore ?? max), comment: s.comment };
  };
  return {
    externalId: e.externalId || e.id || `paste-${idx}-${Date.now()}`,
    presenterName: String(name).trim(),
    evaluatorName: e.evaluatorName || e.evaluator,
    date,
    game: e.game,
    totalScore: e.totalScore != null ? Number(e.totalScore) : undefined,
    ratings: {
      hair: buildRating(r.hair ?? e.hair, 3),
      makeup: buildRating(r.makeup ?? e.makeup, 3),
      outfit: buildRating(r.outfit ?? e.outfit, 3),
      posture: buildRating(r.posture ?? e.posture, 3),
      dealingStyle: buildRating(r.dealingStyle ?? e.dealingStyle ?? e.dealing, 5),
      gamePerformance: buildRating(r.gamePerformance ?? e.gamePerformance ?? e.perf, 5),
    },
    overallComment: e.overallComment,
  };
}

function parsePartsToEval(parts: string[], idx: number): RawEval | null {
  if (parts.length < 4) return null;
  // Heuristic: first non-numeric token is the name, then date, then up
  // to six numeric scores, optional total at the end.
  const nameParts: string[] = [];
  let i = 0;
  for (; i < parts.length; i++) {
    const tok = parts[i].trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(tok) || /^\d{2}\.\d{2}\.\d{4}/.test(tok)) break;
    if (/^\d+(\.\d+)?$/.test(tok) && nameParts.length > 0) break;
    nameParts.push(tok);
  }
  if (nameParts.length === 0) return null;
  const name = nameParts.join(" ").trim();
  let date = new Date().toISOString().slice(0, 10);
  if (i < parts.length && /\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/.test(parts[i])) {
    date = parts[i].trim();
    i++;
  }
  const numbers: number[] = [];
  for (; i < parts.length; i++) {
    const n = Number(parts[i].trim());
    if (Number.isFinite(n)) numbers.push(n);
  }
  if (numbers.length < 3) return null;
  const totalScore = numbers.length >= 7 ? numbers[6] : numbers.reduce((s, x) => s + x, 0);
  return {
    externalId: `paste-${idx}-${Date.now()}`,
    presenterName: name,
    date,
    totalScore,
    ratings: {
      hair: numbers[0] != null ? { score: numbers[0], maxScore: 3 } : undefined,
      makeup: numbers[1] != null ? { score: numbers[1], maxScore: 3 } : undefined,
      outfit: numbers[2] != null ? { score: numbers[2], maxScore: 3 } : undefined,
      posture: numbers[3] != null ? { score: numbers[3], maxScore: 3 } : undefined,
      dealingStyle: numbers[4] != null ? { score: numbers[4], maxScore: 5 } : undefined,
      gamePerformance: numbers[5] != null ? { score: numbers[5], maxScore: 5 } : undefined,
    },
  };
}

// ============================================
// Component
// ============================================

// Attitude record parsed from the Studioworks "Attitude" sheet — POSITIVE
// (+1) / NEGATIVE (-1) behaviour events that feed monthly attitude.
type AttitudeEvent = {
  externalId: string;
  presenterName: string;
  date: string;
  type: "positive" | "negative" | "neutral";
  score: number;
  comment?: string;
};

export function StudioworksImporter({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<RawEval[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [autoRefreshMin, setAutoRefreshMin] = useState<number>(0);
  // For unmatched-resolver: maps unmatched presenter name -> chosen GP id.
  const [nameMappings, setNameMappings] = useState<Record<string, number>>({});
  // Hidden <input type=file> trigger for the Excel-upload tab.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [excelFileName, setExcelFileName] = useState<string>("");
  // Attitude records parsed alongside evaluations (Excel tab only).
  const [attitudeEvents, setAttitudeEvents] = useState<AttitudeEvent[]>([]);

  // Pull GP list for the unmatched-resolver dropdown. Filtered by the
  // backend to GPs visible to the current user.
  const { data: gpList } = trpc.gamePresenter.list.useQuery();
  const utils = trpc.useUtils();

  // Inline "Create new GP" for the unmatched-resolver. The matcher is
  // robust (handles diacritics + word order + typos), so when it can't
  // find a name it usually means the GP doesn't exist yet — let the FM
  // create it inline without leaving the importer.
  const createGpMutation = trpc.gamePresenter.create.useMutation({
    onSuccess: (res, vars) => {
      const created = res.gp;
      if (!created) return;
      const key = vars.name.toLowerCase().trim();
      setNameMappings(prev => ({ ...prev, [key]: created.id }));
      utils.gamePresenter.list.invalidate();
      toast.success(`Created "${created.name}" and mapped it`);
    },
    onError: (err) => toast.error(`Couldn't create GP: ${err.message}`),
  });

  const importMutation = trpc.studioworksSync.importBatch.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Imported ${res.inserted} · ${res.skippedExisting} duplicate · ${res.unmatched} unmatched`,
      );
      setParsed([]);
      setPasteText("");
      setSelected(new Set());
      setNameMappings({});
      onImported?.();
      // Don't auto-close so the FM can see the import summary.
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  // Pull unmatched names from the most recent import so the FM can
  // assign each to a real GP via dropdown and re-submit.
  const unmatchedNames = useMemo<Array<{ name: string; date: string; externalId: string }>>(() => {
    const data = importMutation.data;
    if (!data) return [];
    const seen = new Set<string>();
    const out: Array<{ name: string; date: string; externalId: string }> = [];
    for (const d of data.details) {
      if (d.matched || d.skippedExisting) continue;
      const key = d.presenterName.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: d.presenterName, date: d.date, externalId: d.externalId });
    }
    return out;
  }, [importMutation.data]);

  // Excel-export parser. Parses server-side (reusing the same exceljs as
  // the error-file importer) and drops the result straight into the
  // shared `parsed` preview state, so commit + unmatched-resolver work
  // unchanged — and keep the per-criterion scores through a re-import.
  const parseExcelMutation = trpc.studioworksSync.parseExcel.useMutation({
    onSuccess: (res) => {
      setAttitudeEvents((res.attitudeEvents ?? []) as AttitudeEvent[]);
      if (!res.rows || res.rows.length === 0) {
        const attN = res.attitudeEvents?.length ?? 0;
        if (attN > 0) {
          toast.success(`No evaluation rows, but found ${attN} attitude record${attN === 1 ? "" : "s"} — click Import to sync them.`);
        } else {
          toast.error(
            res.warnings?.[0] ?? "No evaluations found in that file.",
            { description: res.rawHeaders?.length ? `Columns seen: ${res.rawHeaders.slice(0, 10).join(", ")}` : undefined },
          );
        }
        setParsed([]);
        return;
      }
      setParsed(res.rows as RawEval[]);
      setSelected(new Set(res.rows.map(r => r.externalId)));
      setAttitudeEvents((res.attitudeEvents ?? []) as AttitudeEvent[]);
      const niceCols = (res.detectedColumns ?? [])
        .filter(c => c !== "attendance" && c !== "workload" && c !== "bonus" && c !== "since");
      const attN = res.attitudeEvents?.length ?? 0;
      toast.success(`Parsed ${res.rows.length} evaluation${res.rows.length === 1 ? "" : "s"}${attN > 0 ? ` + ${attN} attitude record${attN === 1 ? "" : "s"}` : ""} from "${res.sheetName}"`, {
        description: res.warnings?.length
          ? res.warnings.join(" ")
          : `Mapped columns: ${niceCols.join(", ")}. Review below, then Import.`,
      });
    },
    onError: (err) => toast.error(`Couldn't read file: ${err.message}`),
  });

  const onPickExcelFile = useCallback(() => fileInputRef.current?.click(), []);

  const onExcelFileChosen = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setExcelFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      // Base64-encode in chunks to avoid call-stack overflow on big files.
      const bytes = new Uint8Array(buf);
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        // .apply (not spread) keeps this off the downlevel-iteration path.
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
      }
      const base64 = btoa(binary);
      parseExcelMutation.mutate({ fileBase64: base64, filename: file.name });
    } catch (e) {
      toast.error(`Couldn't read the file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [parseExcelMutation]);

  const resolveMutation = trpc.studioworksSync.importBatch.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Resolved ${res.inserted} + ${res.skippedExisting} skipped + ${res.unmatched} still unmatched`,
      );
      onImported?.();
    },
    onError: (err) => toast.error(`Resolve failed: ${err.message}`),
  });

  // Attitude commit — runs alongside the evaluation import (Excel tab).
  const attitudeMutation = trpc.studioworksSync.importAttitudeBatch.useMutation({
    onSuccess: (res) => {
      if (res.totalFound > 0) {
        toast.success(`Attitude: ${res.inserted} new · ${res.skippedExisting} duplicate · ${res.unmatched} unmatched`);
      }
      setAttitudeEvents([]);
      onImported?.();
    },
    onError: (err) => toast.error(`Attitude import failed: ${err.message}`),
  });

  const onParse = useCallback(() => {
    const rows = parseBulkPaste(pasteText);
    if (rows.length === 0) {
      toast.error("Couldn't parse any rows. Try a different format or use the bookmarklet.");
      return;
    }
    setParsed(rows);
    setSelected(new Set(rows.map(r => r.externalId)));
    toast.success(`Parsed ${rows.length} eval${rows.length === 1 ? "" : "s"} — review below`);
  }, [pasteText]);

  const onCommit = useCallback(() => {
    const toSend = parsed.filter(r => selected.has(r.externalId));
    if (toSend.length === 0 && attitudeEvents.length === 0) {
      toast.error("Nothing to import — select at least one evaluation");
      return;
    }
    // Commit evaluations and attitude together (both idempotent server-side).
    if (toSend.length > 0) importMutation.mutate({ evaluations: toSend });
    if (attitudeEvents.length > 0) attitudeMutation.mutate({ events: attitudeEvents });
  }, [parsed, selected, attitudeEvents, importMutation, attitudeMutation]);

  const onResolveUnmatched = useCallback(() => {
    if (Object.keys(nameMappings).length === 0) {
      toast.error("Map at least one name to a GP first");
      return;
    }
    // Re-build payloads from the parsed list (or from importMutation.data
    // if parsed was cleared) but only for rows whose name has a mapping.
    const sourceList: RawEval[] = parsed.length > 0 ? parsed : (importMutation.data?.details ?? [])
      .filter(d => !d.matched && !d.skippedExisting)
      .map(d => ({
        externalId: d.externalId,
        presenterName: d.presenterName,
        evaluatorName: d.evaluatorName,
        date: d.date,
        game: d.game,
        ratings: {},
      }));
    const payload = sourceList
      .filter(r => nameMappings[r.presenterName.toLowerCase().trim()])
      .map(r => ({ ...r, forceGpId: nameMappings[r.presenterName.toLowerCase().trim()] }));
    if (payload.length === 0) {
      toast.error("No rows to resubmit — pick a GP for at least one unmatched name");
      return;
    }
    resolveMutation.mutate({ evaluations: payload });
  }, [nameMappings, parsed, importMutation.data, resolveMutation]);

  const onCopyBookmarklet = useCallback(async () => {
    const apiOrigin = window.location.origin;
    const script = buildBookmarkletScript({ apiOrigin, sessionToken: "", autoRefreshMin });
    const href = asBookmarkletHref(script);
    try {
      await navigator.clipboard.writeText(href);
      toast.success("Bookmarklet copied — drag this onto your bookmarks bar:", {
        description: "Then click it while you're on team.studioworks.ee/evaluations.",
      });
    } catch {
      toast.error("Couldn't copy — please copy manually from the textarea below.");
    }
  }, []);

  const onCopyConsoleSnippet = useCallback(async () => {
    const apiOrigin = window.location.origin;
    const script = buildBookmarkletScript({ apiOrigin, sessionToken: "", autoRefreshMin });
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Console snippet copied", {
        description: autoRefreshMin > 0
          ? `Auto-refresh ON (every ${autoRefreshMin} min). Paste into DevTools console.`
          : "Open team.studioworks.ee/evaluations, open DevTools (F12), Console tab, paste, hit Enter.",
      });
    } catch {
      toast.error("Couldn't copy — please copy manually from the textarea below.");
    }
  }, [autoRefreshMin]);

  const consoleSnippet = useMemo(() => {
    return buildBookmarkletScript({
      apiOrigin: typeof window !== "undefined" ? window.location.origin : "",
      sessionToken: "",
      autoRefreshMin,
    });
  }, [autoRefreshMin]);

  const toggleAll = (on: boolean) =>
    setSelected(on ? new Set(parsed.map(r => r.externalId)) : new Set());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Import from Studioworks
          </DialogTitle>
          <DialogDescription>
            Move evaluations from team.studioworks.ee into here without retyping them. The easiest way is <strong>Export report XLS</strong> from Studioworks and upload it on the Excel tab — the other tabs are fallbacks.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="excel" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="excel" className="gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </TabsTrigger>
            <TabsTrigger value="bookmarklet" className="gap-1.5">
              <Bookmark className="h-3.5 w-3.5" /> Bookmarklet
            </TabsTrigger>
            <TabsTrigger value="console" className="gap-1.5">
              <Terminal className="h-3.5 w-3.5" /> Console
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5">
              <ClipboardPaste className="h-3.5 w-3.5" /> Bulk paste
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pt-3">
            {/* Excel export — the recommended, most-robust path */}
            <TabsContent value="excel" className="space-y-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800 flex items-start gap-2">
                <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span><strong>Recommended.</strong> No browser tricks, no console, nothing to install — just upload the file Studioworks gives you.</span>
              </div>
              <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
                <li>Open <a href="https://team.studioworks.ee/evaluations" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">team.studioworks.ee/evaluations <ExternalLink className="h-3 w-3" /></a> (or the People page).</li>
                <li>Click <strong>Export report XLS</strong> and save the file.</li>
                <li>Upload it below — we read the columns automatically and show a preview before anything is saved.</li>
              </ol>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => { onExcelFileChosen(e.target.files?.[0]); e.target.value = ""; }}
              />

              <button
                type="button"
                onClick={onPickExcelFile}
                disabled={parseExcelMutation.isPending}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onExcelFileChosen(e.dataTransfer.files?.[0]); }}
                className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-primary/40 transition-colors p-6 flex flex-col items-center justify-center gap-2 text-center disabled:opacity-60 disabled:cursor-wait"
              >
                {parseExcelMutation.isPending ? (
                  <>
                    <Loader2 className="h-7 w-7 text-primary animate-spin" />
                    <span className="text-sm font-medium text-slate-700">Reading {excelFileName || "file"}…</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-7 w-7 text-primary" />
                    <span className="text-sm font-medium text-slate-700">
                      {excelFileName ? `Choose a different file (${excelFileName})` : "Click to choose the exported .xlsx"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">or drag &amp; drop a Studioworks export here</span>
                  </>
                )}
              </button>
              {/* Detected-columns diagnostics — shown after a parse so an
                  unexpected export layout is obvious (and fixable) */}
              {parseExcelMutation.data && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-700">Sheet:</span>
                    <Badge variant="outline" className="text-[10px]">{parseExcelMutation.data.sheetName || "—"}</Badge>
                    <span className="font-semibold text-slate-700 ml-2">Rows:</span>
                    <Badge variant="outline" className="text-[10px]">{parseExcelMutation.data.rows.length}</Badge>
                    {(parseExcelMutation.data.attitudeEvents?.length ?? 0) > 0 && (
                      <>
                        <span className="font-semibold text-slate-700 ml-2">Attitude:</span>
                        <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px]">{parseExcelMutation.data.attitudeEvents.length}</Badge>
                      </>
                    )}
                    {parseExcelMutation.data.skippedRows > 0 && (
                      <span className="text-muted-foreground">({parseExcelMutation.data.skippedRows} non-data rows skipped)</span>
                    )}
                  </div>
                  {parseExcelMutation.data.detectedColumns.length > 0 && (
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-700">Mapped:</span>
                      {parseExcelMutation.data.detectedColumns.map(c => (
                        <Badge key={c} className="bg-primary/10 text-primary border-primary/20 text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  )}
                  {parseExcelMutation.data.warnings.length > 0 && (
                    <div className="flex items-start gap-2 text-amber-700 pt-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{parseExcelMutation.data.warnings.join(" ")}</span>
                    </div>
                  )}
                  {parseExcelMutation.data.rawHeaders.length > 0 && (
                    <details className="text-muted-foreground pt-0.5">
                      <summary className="cursor-pointer hover:text-slate-700">Raw headers from the file</summary>
                      <p className="mt-1 font-mono text-[10px] break-words">{parseExcelMutation.data.rawHeaders.join(" · ")}</p>
                    </details>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2">
                <FileSpreadsheet className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
                <span>Tip: the <strong>Evaluations</strong> export has one row per evaluation (with scores) — that&apos;s the one to use. The <strong>People</strong> export only has per-person totals; we&apos;ll warn you if you upload that one by mistake.</span>
              </div>
            </TabsContent>

            {/* Bookmarklet */}
            <TabsContent value="bookmarklet" className="space-y-3">
              <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
                <li>Click <strong>Copy bookmarklet</strong> below.</li>
                <li>Drag the link onto your browser&apos;s bookmarks bar (or right-click → Add bookmark, paste URL).</li>
                <li>Open <a href="https://team.studioworks.ee/evaluations" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">team.studioworks.ee/evaluations <ExternalLink className="h-3 w-3" /></a> in another tab. Make sure you&apos;re logged in.</li>
                <li>Click the bookmarklet. A banner shows progress; evals appear here automatically.</li>
              </ol>

              {/* Auto-refresh selector — turns the bookmarklet into a
                  background poller. The FM clicks once and Studioworks
                  is re-scraped every N minutes for as long as the tab
                  stays open. */}
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <RefreshCw className={`h-3.5 w-3.5 text-violet-700 ${autoRefreshMin > 0 ? "animate-spin" : ""}`} />
                    <span className="text-xs font-semibold text-violet-800">Auto-refresh mode</span>
                  </div>
                  <Select
                    value={String(autoRefreshMin)}
                    onValueChange={v => setAutoRefreshMin(Number(v))}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs glass-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Off (one-shot)</SelectItem>
                      <SelectItem value="5">Every 5 min</SelectItem>
                      <SelectItem value="10">Every 10 min</SelectItem>
                      <SelectItem value="15">Every 15 min</SelectItem>
                      <SelectItem value="30">Every 30 min</SelectItem>
                      <SelectItem value="60">Every 60 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-violet-700">
                  {autoRefreshMin > 0
                    ? `Bookmarklet will keep re-scraping Studioworks every ${autoRefreshMin} min while the tab stays open. Click again to stop.`
                    : "Set an interval to turn the bookmarklet into a background poller. Closest thing to true automation without server-side browser deps."}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-xs text-slate-600 font-mono break-all overflow-hidden text-ellipsis line-clamp-3">
                  {asBookmarkletHref(consoleSnippet).slice(0, 240)}…
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={onCopyBookmarklet} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    Copy bookmarklet
                  </Button>
                  <a
                    href={asBookmarkletHref(consoleSnippet)}
                    onClick={(e) => { e.preventDefault(); toast.info("Drag this link to your bookmarks bar — clicking it here won't run."); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-grab"
                    draggable
                  >
                    📌 Drag me to bookmarks bar
                  </a>
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Browsers block cross-origin requests from bookmarklets in some setups. If the bookmarklet doesn&apos;t fire, use the <strong>Console</strong> tab instead — same script, just paste in DevTools.</span>
              </div>
            </TabsContent>

            {/* Console */}
            <TabsContent value="console" className="space-y-3">
              <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
                <li>Open <a href="https://team.studioworks.ee/evaluations" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">team.studioworks.ee/evaluations <ExternalLink className="h-3 w-3" /></a>.</li>
                <li>Open DevTools (F12 or Cmd+Opt+I), switch to the <strong>Console</strong> tab.</li>
                <li>Click <strong>Copy snippet</strong> below, paste into the console, hit Enter.</li>
                <li>A banner shows progress; evals appear here automatically.</li>
              </ol>
              <Button onClick={onCopyConsoleSnippet} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" />
                Copy snippet
              </Button>
              <Textarea
                readOnly
                value={consoleSnippet}
                className="font-mono text-[10px] h-40 resize-none"
              />
            </TabsContent>

            {/* Bulk paste */}
            <TabsContent value="paste" className="space-y-3">
              <p className="text-sm text-slate-700">
                Copy the evaluations table from Studioworks (Cmd/Ctrl+C) and paste below. Recognised formats: tab-separated, JSON array, or one-line-per-eval with name + date + 6 scores.
              </p>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"Anna Petrova\t2024-04-15\t3\t3\t2\t3\t4\t5\t20\nMaria Tamm\t2024-04-15\t2\t3\t3\t3\t5\t5\t21"}
                className="font-mono text-xs min-h-[160px]"
              />
              <div className="flex items-center gap-2">
                <Button onClick={onParse} disabled={!pasteText.trim()} className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Parse
                </Button>
                {pasteText.trim() && (
                  <Button variant="ghost" size="sm" onClick={() => { setPasteText(""); setParsed([]); }}>
                    Clear
                  </Button>
                )}
              </div>
            </TabsContent>
          </div>

          {/* Preview */}
          {parsed.length > 0 && (
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Search className="h-3.5 w-3.5 text-primary" />
                  Preview · {selected.size} of {parsed.length} selected
                </h4>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => toggleAll(true)} className="text-xs h-7">
                    Select all
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAll(false)} className="text-xs h-7">
                    Clear
                  </Button>
                </div>
              </div>
              <div className="max-h-[240px] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {parsed.map(row => {
                  const isSel = selected.has(row.externalId);
                  return (
                    <label
                      key={row.externalId}
                      className={`flex items-start gap-3 px-3 py-2 cursor-pointer transition-colors ${isSel ? "bg-primary/5" : "bg-white hover:bg-slate-50"}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={(e) => {
                          setSelected(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(row.externalId);
                            else next.delete(row.externalId);
                            return next;
                          });
                        }}
                        className="mt-1 h-3.5 w-3.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{row.presenterName}</span>
                          <Badge variant="outline" className="text-[10px]">{row.date}</Badge>
                          {row.totalScore != null && (
                            <Badge className="bg-primary/15 text-primary border-primary/25 text-[10px]">
                              {row.totalScore}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1 text-[10px] text-muted-foreground tabular-nums">
                          {row.ratings.hair && <span>Hair {row.ratings.hair.score}/{row.ratings.hair.maxScore}</span>}
                          {row.ratings.makeup && <span>· Makeup {row.ratings.makeup.score}/{row.ratings.makeup.maxScore}</span>}
                          {row.ratings.outfit && <span>· Outfit {row.ratings.outfit.score}/{row.ratings.outfit.maxScore}</span>}
                          {row.ratings.posture && <span>· Posture {row.ratings.posture.score}/{row.ratings.posture.maxScore}</span>}
                          {row.ratings.dealingStyle && <span>· Dealing {row.ratings.dealingStyle.score}/{row.ratings.dealingStyle.maxScore}</span>}
                          {row.ratings.gamePerformance && <span>· Perf {row.ratings.gamePerformance.score}/{row.ratings.gamePerformance.maxScore}</span>}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Attitude preview — behaviour records from the Attitude sheet.
              Committed together with the evaluations on Import. */}
          {attitudeEvents.length > 0 && (
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                Attitude · {attitudeEvents.length} record{attitudeEvents.length === 1 ? "" : "s"} to sync
              </h4>
              <div className="max-h-[160px] overflow-y-auto rounded-lg border border-violet-100 divide-y divide-violet-50">
                {attitudeEvents.slice(0, 50).map(ev => (
                  <div key={ev.externalId} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <Badge className={`text-[10px] shrink-0 ${ev.score >= 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                      {ev.score > 0 ? `+${ev.score}` : ev.score}
                    </Badge>
                    <span className="font-semibold text-slate-700 shrink-0">{ev.presenterName}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">{ev.date}</span>
                    {ev.comment && <span className="text-muted-foreground truncate">— {ev.comment}</span>}
                  </div>
                ))}
              </div>
              {attitudeEvents.length > 50 && (
                <p className="text-[11px] text-muted-foreground">…and {attitudeEvents.length - 50} more.</p>
              )}
            </div>
          )}

          {/* Attitude result summary (after import) */}
          {attitudeMutation.data && attitudeMutation.data.totalFound > 0 && (
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                Attitude synced
              </h4>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700 gap-1">
                  <Check className="h-3 w-3" /> {attitudeMutation.data.inserted} new
                </Badge>
                <Badge className="bg-slate-100 border-slate-200 text-slate-700 gap-1">
                  {attitudeMutation.data.skippedExisting} already had
                </Badge>
                {attitudeMutation.data.unmatched > 0 && (
                  <Badge className="bg-amber-50 border-amber-200 text-amber-700 gap-1">
                    <AlertTriangle className="h-3 w-3" /> {attitudeMutation.data.unmatched} unmatched
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Result summary (after import) */}
          {importMutation.data && (
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-primary" />
                Last import
              </h4>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700 gap-1">
                  <Check className="h-3 w-3" /> {importMutation.data.inserted} new
                </Badge>
                <Badge className="bg-slate-100 border-slate-200 text-slate-700 gap-1">
                  {importMutation.data.skippedExisting} already had
                </Badge>
                <Badge className="bg-amber-50 border-amber-200 text-amber-700 gap-1">
                  <AlertTriangle className="h-3 w-3" /> {importMutation.data.unmatched} unmatched
                </Badge>
                {importMutation.data.errors > 0 && (
                  <Badge className="bg-rose-50 border-rose-200 text-rose-700 gap-1">
                    <X className="h-3 w-3" /> {importMutation.data.errors} errors
                  </Badge>
                )}
              </div>
              {importMutation.data.details.some(d => d.error || (!d.matched && !d.skippedExisting)) && (
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer hover:text-slate-800">Show issues</summary>
                  <ul className="mt-1 ml-4 list-disc space-y-0.5">
                    {importMutation.data.details
                      .filter(d => d.error || (!d.matched && !d.skippedExisting))
                      .slice(0, 20)
                      .map(d => (
                        <li key={d.externalId}>
                          <strong>{d.presenterName}</strong> ({d.date}): {d.error ?? "no GP matched"}
                        </li>
                      ))}
                  </ul>
                </details>
              )}

              {/* Unmatched-name resolver — pick a real GP for each
                  presenter name the fuzzy matcher couldn't resolve.
                  After mapping, FM hits "Re-import mapped" to send
                  these rows again with a forceGpId override. */}
              {unmatchedNames.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <UserCheck className="h-4 w-4 text-amber-700" />
                    <h5 className="text-sm font-semibold text-amber-900">
                      Map unmatched names ({unmatchedNames.length})
                    </h5>
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] ml-auto">
                      {Object.keys(nameMappings).length} mapped
                    </Badge>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    These names didn&apos;t match any GP automatically. Pick a suggested match, create a brand-new GP, or pick one from the full list — then re-import.
                  </p>
                  <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                    {unmatchedNames.map(u => {
                      const key = u.name.toLowerCase().trim();
                      const mapped = nameMappings[key];
                      return (
                        <UnmatchedNameRow
                          key={u.externalId}
                          unmatched={u}
                          mappedGpId={mapped}
                          gpList={(gpList ?? []) as Array<{ id: number; name: string }>}
                          onMap={(gpId) => setNameMappings(prev => ({ ...prev, [key]: gpId }))}
                          onCreate={() => createGpMutation.mutate({ name: u.name })}
                          creating={createGpMutation.isPending && createGpMutation.variables?.name === u.name}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={onResolveUnmatched}
                      disabled={Object.keys(nameMappings).length === 0 || resolveMutation.isPending}
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                    >
                      {resolveMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserCheck className="h-3.5 w-3.5" />
                      )}
                      Re-import {Object.keys(nameMappings).length} mapped
                    </Button>
                    {Object.keys(nameMappings).length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setNameMappings({})} className="text-xs">
                        Clear mappings
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Tabs>

        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={onCommit}
            disabled={(selected.size === 0 && attitudeEvents.length === 0) || importMutation.isPending || attitudeMutation.isPending}
            className="bg-gradient-to-r from-primary to-primary/80 text-white"
          >
            {importMutation.isPending || attitudeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            Import {[
              selected.size > 0 ? `${selected.size} eval${selected.size === 1 ? "" : "s"}` : "",
              attitudeEvents.length > 0 ? `${attitudeEvents.length} attitude` : "",
            ].filter(Boolean).join(" + ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Trigger button — small standalone control that any page can drop
// in to expose the importer.
// ============================================

export function StudioworksImportButton({
  className,
  onImported,
  variant = "default",
  size = "default",
}: {
  className?: string;
  onImported?: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Download className="h-3.5 w-3.5 mr-1.5" />
        Import from Studioworks
      </Button>
      <StudioworksImporter
        open={open}
        onOpenChange={setOpen}
        onImported={onImported}
      />
    </>
  );
}

// ============================================
// Unmatched-name row — surfaces near-miss suggestions from the matcher
// AND a one-click "Create as new GP" option, so the FM never has to
// scroll the full GP list for names the system can't find. The fuzzy
// matcher is robust (handles diacritics, word order, typos via
// containsMatch + token similarity), so when it can't resolve a name it
// usually means the GP doesn't exist yet — this row lets the FM act on
// that fact inline instead of leaving the importer to add the GP.
// ============================================

function UnmatchedNameRow({
  unmatched, mappedGpId, gpList, onMap, onCreate, creating,
}: {
  unmatched: { name: string; date: string; externalId: string };
  mappedGpId: number | undefined;
  gpList: Array<{ id: number; name: string }>;
  onMap: (gpId: number) => void;
  onCreate: () => void;
  creating: boolean;
}) {
  // Top fuzzy candidates regardless of threshold — see studioworksSync.suggestMatches.
  const { data: suggestions } = trpc.studioworksSync.suggestMatches.useQuery(
    { name: unmatched.name, limit: 3 },
    { staleTime: 5 * 60_000 },
  );
  const topSuggestions = (suggestions ?? []).filter(s => s.score >= 0.45).slice(0, 3);
  const mappedName = mappedGpId ? gpList.find(g => g.id === mappedGpId)?.name : null;

  return (
    <div className="bg-white rounded-md border border-amber-200 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <Link2 className={`h-3.5 w-3.5 shrink-0 ${mappedGpId ? "text-emerald-600" : "text-amber-500"}`} />
        <span className="text-xs font-semibold text-slate-700 min-w-0 flex-1 truncate">{unmatched.name}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{unmatched.date}</span>
        <Select
          value={mappedGpId ? String(mappedGpId) : ""}
          onValueChange={v => onMap(Number(v))}
        >
          <SelectTrigger className="glass-input h-7 text-xs w-[160px] shrink-0">
            <SelectValue placeholder="Pick GP…" />
          </SelectTrigger>
          <SelectContent>
            {gpList.map(gp => (
              <SelectItem key={gp.id} value={String(gp.id)}>{gp.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Near-miss suggestions + create-new — the row's value-add. */}
      <div className="flex items-center gap-1.5 flex-wrap pl-5">
        {topSuggestions.length > 0 && (
          <>
            <Lightbulb className="h-3 w-3 text-amber-600 shrink-0" />
            <span className="text-[10px] text-amber-700 font-medium">Closest:</span>
            {topSuggestions.map(s => {
              const isMapped = mappedGpId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onMap(s.id)}
                  className={`inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 border transition-colors ${
                    isMapped
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-white border-amber-200 text-slate-700 hover:bg-amber-50 hover:border-amber-300"
                  }`}
                  title={`${s.matchedField === "realName" ? "Real name: " : ""}${s.name}`}
                >
                  {isMapped && <Check className="h-2.5 w-2.5" />}
                  <span className="truncate max-w-[120px]">{s.name}</span>
                  <span className="tabular-nums text-amber-600">{Math.round(s.score * 100)}%</span>
                </button>
              );
            })}
          </>
        )}
        <button
          type="button"
          onClick={onCreate}
          disabled={creating || !!mappedGpId}
          className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Create a brand-new GP with this exact name"
        >
          {creating ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <UserPlus className="h-2.5 w-2.5" />}
          Create new
        </button>
        {mappedName && (
          <span className="text-[10px] text-emerald-700 ml-auto">
            → <span className="font-medium">{mappedName}</span>
          </span>
        )}
      </div>
    </div>
  );
}
