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

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Download, Bookmark, Terminal, ClipboardPaste, Check, X, AlertTriangle,
  Loader2, Send, ExternalLink, Copy, ChevronRight, Search, Sparkles,
} from "lucide-react";

// ============================================
// Bookmarklet payload — self-contained JS that scrapes the current
// Studioworks page, gathers evaluations, and POSTs to our endpoint.
// Designed to be tolerant of unknown DOM: tries JSON via fetch
// (re-using existing session cookies), falls back to scraping rows
// off the page. Never throws — surfaces errors to the user instead.
// ============================================
function buildBookmarkletScript(opts: { apiOrigin: string; sessionToken: string }): string {
  // The script is wrapped in an IIFE and as a string we URL-encode
  // for the bookmarklet form. Variables are inlined at copy time.
  const body = `
(async () => {
  const API = ${JSON.stringify(opts.apiOrigin)};
  const TOKEN = ${JSON.stringify(opts.sessionToken)};
  const banner = (msg, color) => {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "position:fixed;top:16px;right:16px;background:" + color + ";color:white;padding:12px 16px;border-radius:8px;font-family:system-ui;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.2)";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  };
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

  const importMutation = trpc.studioworksSync.importBatch.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Imported ${res.inserted} · ${res.skippedExisting} duplicate · ${res.unmatched} unmatched`,
      );
      setParsed([]);
      setPasteText("");
      setSelected(new Set());
      onImported?.();
      // Don't auto-close so the FM can see the import summary.
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
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
    if (toSend.length === 0) {
      toast.error("Select at least one evaluation");
      return;
    }
    importMutation.mutate({ evaluations: toSend });
  }, [parsed, selected, importMutation]);

  const onCopyBookmarklet = useCallback(async () => {
    // Build the script with no token (the user's app session cookie
    // travels via fetch credentials when they're on the same origin
    // as the API, but for cross-origin Studioworks→our-API the user
    // would need to grant access first). For the bookmarklet form we
    // produce a console-friendly snippet by default — the user can
    // also drag the link to their bookmarks bar.
    const apiOrigin = window.location.origin;
    const script = buildBookmarkletScript({ apiOrigin, sessionToken: "" });
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
    const script = buildBookmarkletScript({ apiOrigin, sessionToken: "" });
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Console snippet copied", {
        description: "Open team.studioworks.ee/evaluations, open DevTools (F12), Console tab, paste, hit Enter.",
      });
    } catch {
      toast.error("Couldn't copy — please copy manually from the textarea below.");
    }
  }, []);

  const consoleSnippet = useMemo(() => {
    return buildBookmarkletScript({ apiOrigin: typeof window !== "undefined" ? window.location.origin : "", sessionToken: "" });
  }, []);

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
            Move evaluations from team.studioworks.ee into here without retyping them. Three options below — pick whatever's easiest.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="bookmarklet" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-3 w-full">
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
            {/* Bookmarklet */}
            <TabsContent value="bookmarklet" className="space-y-3">
              <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
                <li>Click <strong>Copy bookmarklet</strong> below.</li>
                <li>Drag the link onto your browser&apos;s bookmarks bar (or right-click → Add bookmark, paste URL).</li>
                <li>Open <a href="https://team.studioworks.ee/evaluations" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">team.studioworks.ee/evaluations <ExternalLink className="h-3 w-3" /></a> in another tab. Make sure you&apos;re logged in.</li>
                <li>Click the bookmarklet. A banner shows progress; evals appear here automatically.</li>
              </ol>
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
            </div>
          )}
        </Tabs>

        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={onCommit}
            disabled={parsed.length === 0 || selected.size === 0 || importMutation.isPending}
            className="bg-gradient-to-r from-primary to-primary/80 text-white"
          >
            {importMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            Import {selected.size > 0 ? `${selected.size} selected` : ""}
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
