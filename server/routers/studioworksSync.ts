/**
 * Studioworks Sync Router
 *
 * Pulls evaluations from team.studioworks.ee and inserts them into our
 * `evaluations` table — replacing the manual screenshot-upload flow.
 *
 * Mirrors the Persona-sync admin pattern: testConnection probe, manual
 * Sync now, history. Idempotent insert: each evaluation is keyed by
 * (gpId, evaluationDate, evaluatorName, game) so re-running sync
 * doesn't create duplicates.
 *
 * Tenant scoping: cross-team writes happen via the global GP fuzzy
 * matcher, but each evaluation is tagged with the calling user's
 * userId so per-user data isolation in the rest of the app keeps
 * working.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { publish } from "../_core/events";
import {
  syncStudioworksEvaluations,
  testStudioworksConnection,
  type ExtractedEvaluation,
} from "../services/studioworksScraper";
import { createLogger } from "../services/logger";

const log = createLogger("StudioworksSync");

interface ImportDetail {
  externalId: string;
  presenterName: string;
  evaluatorName?: string;
  date: string;
  game?: string;
  matched: boolean;
  /** Resolved GP id when matched. */
  gpId?: number;
  gpName?: string;
  /** Skipped because we already have this exact evaluation in DB. */
  skippedExisting?: boolean;
  /** Error string when this row failed to insert (other rows still process). */
  error?: string;
}

export interface StudioworksSyncSummary {
  status: "success" | "partial" | "failed";
  source: "json" | "html" | "none";
  totalFound: number;
  inserted: number;
  skippedExisting: number;
  unmatched: number;
  errors: number;
  details: ImportDetail[];
  error?: string;
}

/**
 * Parse a date string from Studioworks (e.g. "30 Apr 2026" or
 * "2026-04-30T00:00:00Z") into a Date. Returns null if unparseable.
 */
function parseStudioworksDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // Fallback: "30 Apr 2026" pattern
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const monthIdx = months.indexOf(m[2].slice(0, 3).toLowerCase());
    if (monthIdx >= 0) {
      return new Date(Number(m[3]), monthIdx, Number(m[1]));
    }
  }
  return null;
}

/**
 * Idempotency check: do we already have this exact evaluation?
 *
 * Matches on (gpId, day, evaluator, game) using strict equality —
 * NULL/empty on either side counts as a distinct value, so:
 *   - existing(NULL evaluator) does NOT match incoming("Kristo")
 *   - existing("Kristo") does NOT match incoming(NULL)
 * Previous looser logic (`if both non-empty AND different → skip`)
 * caused the duplicate check to silently drop valid new evaluations
 * whenever a manual/historical row had a NULL evaluator on the same
 * day as an incoming sync row.
 */
async function findExistingEvaluation(opts: {
  gpId: number;
  date: Date;
  evaluatorName?: string;
  game?: string;
}) {
  const evals = await db.getEvaluationsByGP(opts.gpId);
  const dayKey = (d: Date | null) => d ? d.toISOString().slice(0, 10) : "";
  const target = dayKey(opts.date);
  // Strict: treat null/undefined/"" as one value; non-empty strings
  // are compared verbatim.
  const sameKey = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "") === (b ?? "");
  for (const e of evals) {
    if (!e.evaluationDate) continue;
    if (dayKey(new Date(e.evaluationDate)) !== target) continue;
    if (!sameKey(opts.evaluatorName, e.evaluatorName)) continue;
    if (!sameKey(opts.game, e.game)) continue;
    return e;
  }
  return null;
}

async function importOne(
  raw: ExtractedEvaluation,
  /** Admin who clicked Sync — used as the FALLBACK ownership stamp
   *  when the GP itself has no owner. The primary ownership goes to
   *  the GP's userId so user-scoped reads still see this eval. */
  triggeredByAdminUserId: number,
  /** Optional override: when the FM has manually mapped an unmatched
   *  studioworks name to a specific GP via the importer UI, we skip
   *  the fuzzy matcher and use this id directly. */
  forceGpId?: number,
): Promise<ImportDetail> {
  const date = parseStudioworksDate(raw.date);
  const baseDetail: ImportDetail = {
    externalId: raw.externalId,
    presenterName: raw.presenterName,
    evaluatorName: raw.evaluatorName,
    date: raw.date,
    game: raw.game,
    matched: false,
  };

  if (!date) {
    return { ...baseDetail, error: `unparseable date: "${raw.date}"` };
  }

  // GP resolution — prefer the FM's explicit override, otherwise fall
  // back to the SAME global fuzzy matcher used by everything else.
  let gpId: number;
  let gpName: string;
  let gpOwnerId: number | null = null;
  if (forceGpId) {
    const gp = await db.getGamePresenterById(forceGpId);
    if (!gp) {
      return { ...baseDetail, error: `forced GP id ${forceGpId} not found` };
    }
    gpId = gp.id;
    gpName = gp.name;
    gpOwnerId = gp.userId ?? null;
  } else {
    const match = await db.findBestMatchingGP(raw.presenterName, 0.7);
    if (!match) {
      return { ...baseDetail, error: `no GP matched for "${raw.presenterName}"` };
    }
    gpId = match.gamePresenter.id;
    gpName = match.gamePresenter.name;
    gpOwnerId = match.gamePresenter.userId ?? null;
  }

  // Idempotency
  const existing = await findExistingEvaluation({
    gpId,
    date,
    evaluatorName: raw.evaluatorName,
    game: raw.game,
  });
  if (existing) {
    return {
      ...baseDetail,
      matched: true,
      gpId,
      gpName,
      skippedExisting: true,
    };
  }

  // Build the evaluation row. Fields fall back to their schema defaults
  // when studioworks didn't supply a particular rating (e.g. older
  // evaluations missing one of the criteria).
  try {
    const r = raw.ratings;
    await db.createEvaluation({
      gamePresenterId: gpId,
      evaluatorName: raw.evaluatorName ?? null,
      evaluationDate: date,
      game: raw.game ?? null,
      totalScore: raw.totalScore ?? null,
      hairScore: r.hair?.score ?? null,
      hairMaxScore: r.hair?.maxScore ?? 3,
      hairComment: r.hair?.comment ?? null,
      makeupScore: r.makeup?.score ?? null,
      makeupMaxScore: r.makeup?.maxScore ?? 3,
      makeupComment: r.makeup?.comment ?? null,
      outfitScore: r.outfit?.score ?? null,
      outfitMaxScore: r.outfit?.maxScore ?? 3,
      outfitComment: r.outfit?.comment ?? null,
      postureScore: r.posture?.score ?? null,
      postureMaxScore: r.posture?.maxScore ?? 3,
      postureComment: r.posture?.comment ?? null,
      dealingStyleScore: r.dealingStyle?.score ?? null,
      dealingStyleMaxScore: r.dealingStyle?.maxScore ?? 5,
      dealingStyleComment: r.dealingStyle?.comment ?? null,
      gamePerformanceScore: r.gamePerformance?.score ?? null,
      gamePerformanceMaxScore: r.gamePerformance?.maxScore ?? 5,
      gamePerformanceComment: r.gamePerformance?.comment ?? null,
      // rawExtractedData stores the externalId so we can do future
      // upgrades (proper external-id idempotency) without a migration.
      rawExtractedData: {
        source: "studioworks",
        externalId: raw.externalId,
        overallComment: raw.overallComment ?? null,
        scrapedAt: new Date().toISOString(),
        triggeredByAdminUserId: triggeredByAdminUserId,
      } as any,
      // IMPORTANT: ownership goes to the GP's owner (the FM whose team
      // this GP belongs to), NOT the admin who triggered the sync.
      // Otherwise user-scoped reads (getEvaluationsWithGPByUser etc.)
      // would hide the eval from the FM who actually needs it.
      // Fallback to the admin only when the GP has no owner yet
      // (orphan GPs created via fuzzy-create on upload paths).
      uploadedById: gpOwnerId ?? triggeredByAdminUserId,
      userId: gpOwnerId ?? triggeredByAdminUserId,
    });
    return { ...baseDetail, matched: true, gpId, gpName };
  } catch (e) {
    return {
      ...baseDetail,
      matched: true,
      gpId,
      gpName,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============================================
// Excel export importer
//
// The most robust ingest path: the FM clicks "Export report XLS" in
// Studioworks, uploads the .xlsx here, and we parse it server-side with
// the SAME exceljs the error-file importer uses. No Puppeteer/Chromium,
// no browser console, no bookmarklet cross-origin blocks.
//
// We don't know Studioworks' exact export columns, so the parser is
// header-driven and tolerant: it scans the first rows for a header,
// classifies each column by name (presenter / date / score / the six
// sub-criteria / evaluator / game), and reads rows beneath it. Anything
// it can't classify is ignored. The raw headers are echoed back so the
// UI (and we) can see exactly what the export contained.
// ============================================

/** Local-timezone ISO day (yyyy-mm-dd). Avoids the off-by-one that
 *  toISOString() introduces when the deploy host runs in a non-UTC zone
 *  (Studioworks is an Estonian/UTC+2-3 operation). */
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** FNV-1a — stable per-row id so re-parsing the same file yields the
 *  same externalIds (used only as React keys; dedup happens on
 *  gpId/date/evaluator/game in importOne). */
function fnv1a(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

type ExcelCell = { value: any } | undefined | null;

function cellText(cell: ExcelCell): string | null {
  const v = cell?.value;
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as any;
    if (o.text != null) return String(o.text).trim() || null;
    if (Array.isArray(o.richText)) return o.richText.map((p: any) => p.text).join("").trim() || null;
    if (o.result != null) return String(o.result).trim() || null;
    if (o.hyperlink != null && o.text != null) return String(o.text).trim() || null;
  }
  return String(v).trim() || null;
}

function cellNumber(cell: ExcelCell): number | null {
  const v = cell?.value;
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "result" in (v as any) && typeof (v as any).result === "number") {
    return (v as any).result;
  }
  const s = cellText(cell);
  if (!s) return null;
  // First number in the cell — handles "18", "18/24", "18 pts", "18,5".
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function cellDate(cell: ExcelCell): string | null {
  const v = cell?.value;
  if (v == null) return null;
  if (v instanceof Date) return isoDay(v);
  if (typeof v === "number") {
    // Excel serial date: days since 1899-12-30.
    return isoDay(new Date(Math.round((v - 25569) * 86400 * 1000)));
  }
  if (typeof v === "object" && v !== null && "result" in (v as any) && (v as any).result instanceof Date) {
    return isoDay((v as any).result);
  }
  const s = cellText(cell);
  if (!s) return null;
  // European day-first numeric dates: dd.mm.yyyy or dd/mm/yyyy. Handled
  // before parseStudioworksDate because new Date() misreads them.
  const dm = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dm) {
    const day = Number(dm[1]), mon = Number(dm[2]), yr = Number(dm[3]);
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) return isoDay(new Date(yr, mon - 1, day));
  }
  const d = parseStudioworksDate(s);
  return d ? isoDay(d) : null;
}

type ColumnKind =
  | "name" | "evaluator" | "date" | "game" | "totalScore" | "comment"
  | "hair" | "makeup" | "outfit" | "posture" | "dealingStyle" | "gamePerformance"
  // Markers that identify the WRONG export (the /people summary).
  | "attendance" | "workload" | "bonus" | "since";

/** Map a header label to a known column kind, or null when unrecognised.
 *  Order matters: specific sub-criteria are tested before the generic
 *  "score" catch-all so e.g. "Hair score" → hair, not totalScore. */
function classifyHeader(raw: string): ColumnKind | null {
  const s = raw.toLowerCase().replace(/[._/\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  // Sub-criteria (most specific first).
  if (/\bhair\b/.test(s)) return "hair";
  if (/make ?up/.test(s)) return "makeup";
  if (/\b(outfit|clothing|dress|attire|costume|wardrobe)\b/.test(s)) return "outfit";
  if (/\b(posture|body language|stance|presence)\b/.test(s)) return "posture";
  if (/dealing/.test(s)) return "dealingStyle";
  if (/(game ?perf|performance|game ?comment|commentary|gameplay)/.test(s)) return "gamePerformance";
  // Aggregate-export markers (used only to detect the wrong file).
  if (/attendance/.test(s)) return "attendance";
  if (/workload/.test(s)) return "workload";
  if (/bonus/.test(s)) return "bonus";
  if (/^since$/.test(s)) return "since";
  // Identity / meta.
  if (/(evaluator|reviewer|assessor|graded by|evaluated by|checked by|author|supervisor)/.test(s)) return "evaluator";
  if (/(game type|game name|^game$|table|studio)/.test(s)) return "game";
  if (/(presenter|game presenter|^gp$|gp name|employee|dealer|staff|^name$|full name|^person$)/.test(s)) return "name";
  if (/(date|evaluated on|created|submitted|^day$|when)/.test(s)) return "date";
  if (/(comment|note|feedback|remark|summary)/.test(s)) return "comment";
  // Generic score — last so specific criteria win.
  if (/(total|score|result|points|overall|grade|rating|evaluation|mark)/.test(s)) return "totalScore";
  return null;
}

interface ExcelRawEval {
  externalId: string;
  presenterName: string;
  evaluatorName?: string;
  date: string;
  game?: string;
  totalScore?: number;
  ratings: {
    hair?: { score: number; maxScore: number };
    makeup?: { score: number; maxScore: number };
    outfit?: { score: number; maxScore: number };
    posture?: { score: number; maxScore: number };
    dealingStyle?: { score: number; maxScore: number };
    gamePerformance?: { score: number; maxScore: number };
  };
  overallComment?: string;
}

interface SheetParseResult {
  rows: ExcelRawEval[];
  sheetName: string;
  headerRowNumber: number;
  detectedColumns: string[];
  rawHeaders: string[];
  totalDataRows: number;
  skippedRows: number;
  warnings: string[];
  looksAggregate: boolean;
}

/** One behaviour record from the Studioworks "Attitude" sheet. Maps 1:1
 *  onto our `attitude_screenshots` model (each row is a +1/-1 event that
 *  the attitude derivation sums into monthly_gp_stats.attitude). */
interface AttitudeRawEvent {
  externalId: string;
  presenterName: string;
  date: string;
  type: "positive" | "negative" | "neutral";
  score: number;
  comment?: string;
}

/** Workbook-level result: the chosen evaluation sheet result PLUS the
 *  attitude events parsed from the (separate) Attitude sheet. */
type WorkbookParseResult = SheetParseResult & { attitudeEvents: AttitudeRawEvent[] };

const SUBCRITERIA_MAX: Record<string, number> = {
  hair: 3, makeup: 3, outfit: 3, posture: 3, dealingStyle: 5, gamePerformance: 5,
};

function isLikelyName(s: string | null): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (/^\d+$/.test(t)) return false;
  // Require at least one letter (Latin incl. extended, Greek, Cyrillic).
  // Explicit ranges instead of \p{L} so we don't need the /u flag, which
  // tsc rejects without an es6+ target.
  if (!/[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/.test(t)) return false;
  const lower = t.toLowerCase();
  if (["total", "grand total", "name", "presenter", "gp name", "employee", "sum", "average", "avg"].includes(lower)) return false;
  return true;
}

/** Rank a `name`-class header. The real Studioworks export has BOTH
 *  "Dealer Name" (a lowercase login slug — useless for GP fuzzy
 *  matching) and "Employee Name" (the human-readable name). We need to
 *  pick the human-readable one even though it appears second. */
function nameColumnScore(raw: string): number {
  const s = raw.toLowerCase();
  if (/employee/.test(s)) return 10;
  if (/full name/.test(s)) return 9;
  if (/presenter|game presenter|\bgp\b/.test(s)) return 8;
  if (/^name$/.test(s.trim())) return 7;
  if (/dealer|staff/.test(s)) return 3;
  return 5;
}

/** Parse a single worksheet into evaluation rows. Best-effort: returns
 *  an empty `rows` with explanatory `warnings` when the layout doesn't
 *  match (so the caller can surface actionable feedback). */
function parseSheet(sheet: any): SheetParseResult {
  const warnings: string[] = [];
  const sheetName: string = sheet?.name || "Sheet";

  let headerRowNumber = 0;
  let colMap: Partial<Record<ColumnKind, number>> = {};
  let rawHeaders: string[] = [];
  const maxScan = Math.min(8, sheet?.rowCount || 8);
  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r);
    const localMap: Partial<Record<ColumnKind, number>> = {};
    const headers: string[] = [];
    // For the `name` kind, keep the highest-scoring header — so when
    // both "Dealer Name" (slug) and "Employee Name" (human) are present
    // we pick the human one even if it appears later.
    let bestNameScore = -1;
    row.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
      const txt = cellText(cell);
      if (!txt) return;
      headers.push(txt);
      const kind = classifyHeader(txt);
      if (!kind) return;
      if (kind === "name") {
        const score = nameColumnScore(txt);
        if (score > bestNameScore) {
          bestNameScore = score;
          localMap.name = colNumber;
        }
        return;
      }
      if (localMap[kind] == null) localMap[kind] = colNumber; // first column wins per kind
    });
    const hasName = localMap.name != null;
    const hasEvalSignal =
      localMap.date != null || localMap.totalScore != null ||
      localMap.hair != null || localMap.dealingStyle != null || localMap.gamePerformance != null;
    if (hasName && hasEvalSignal) {
      headerRowNumber = r;
      colMap = localMap;
      rawHeaders = headers;
      break;
    }
    if (headers.length > rawHeaders.length) rawHeaders = headers; // richest row as fallback context
  }

  const looksAggregate =
    (colMap.attendance != null || colMap.workload != null || colMap.bonus != null || colMap.since != null) &&
    colMap.date == null && colMap.hair == null && colMap.dealingStyle == null && colMap.gamePerformance == null;

  // Reject the People summary export. Its "Evaluation" column ("3/57")
  // would otherwise be misread as a score and create garbage rows — so
  // we refuse it and point the user at the right export. The real
  // Evaluations export always has a Date column, so this never fires for
  // it (looksAggregate requires date == null).
  if (looksAggregate) {
    warnings.push(`This looks like the People summary export (workload / attendance / bonus / since columns). It holds per-person totals — e.g. "3/57" evaluations done — not individual evaluations with scores. Open the Evaluations page in Studioworks and use its "Export report XLS" instead.`);
    return { rows: [], sheetName, headerRowNumber, detectedColumns: [], rawHeaders, totalDataRows: 0, skippedRows: 0, warnings, looksAggregate };
  }

  if (headerRowNumber === 0) {
    warnings.push(`Couldn't find an evaluations header on sheet "${sheetName}". Columns seen: ${rawHeaders.slice(0, 14).join(", ") || "(none)"}.`);
    return { rows: [], sheetName, headerRowNumber: 0, detectedColumns: [], rawHeaders, totalDataRows: 0, skippedRows: 0, warnings, looksAggregate };
  }

  const detectedColumns = (Object.keys(colMap) as ColumnKind[]).map(String);
  const rows: ExcelRawEval[] = [];
  let totalDataRows = 0;
  let skippedRows = 0;
  const lastRow = sheet.rowCount || 0;
  for (let r = headerRowNumber + 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const name = colMap.name != null ? cellText(row.getCell(colMap.name)) : null;
    if (!isLikelyName(name)) { if (name) skippedRows++; continue; }
    totalDataRows++;

    const dateStr = colMap.date != null ? cellDate(row.getCell(colMap.date)) : null;
    const date = dateStr ?? isoDay(new Date());
    const evaluatorName = colMap.evaluator != null ? (cellText(row.getCell(colMap.evaluator)) ?? undefined) : undefined;
    const game = colMap.game != null ? (cellText(row.getCell(colMap.game)) ?? undefined) : undefined;

    let totalScore: number | undefined =
      colMap.totalScore != null ? (cellNumber(row.getCell(colMap.totalScore)) ?? undefined) : undefined;
    // importBatch caps totalScore at 0..100; drop anything outside so a
    // single odd cell can't fail the whole commit's validation.
    if (totalScore != null && (totalScore < 0 || totalScore > 100)) totalScore = undefined;

    const ratings: ExcelRawEval["ratings"] = {};
    for (const k of ["hair", "makeup", "outfit", "posture", "dealingStyle", "gamePerformance"] as const) {
      const col = colMap[k];
      if (col != null) {
        const sc = cellNumber(row.getCell(col));
        if (sc != null) ratings[k] = { score: sc, maxScore: SUBCRITERIA_MAX[k] };
      }
    }

    const overallComment = colMap.comment != null ? (cellText(row.getCell(colMap.comment)) ?? undefined) : undefined;
    const externalId = `xlsx-${fnv1a(`${name}|${date}|${evaluatorName ?? ""}|${game ?? ""}`)}-${r}`;
    rows.push({ externalId, presenterName: name!.trim(), evaluatorName, date, game, totalScore, ratings, overallComment });
  }

  if (rows.length === 0 && totalDataRows === 0) {
    warnings.push(`Found the header on "${sheetName}" but no data rows under it. Columns: ${rawHeaders.slice(0, 14).join(", ")}.`);
  }

  return { rows, sheetName, headerRowNumber, detectedColumns, rawHeaders, totalDataRows, skippedRows, warnings, looksAggregate };
}

// ============================================
// Multi-eval wide-format parser (the real Studioworks export)
//
// The actual "Export report XLS" off /evaluations is a wide table with
// FOUR sheets:
//   • "Appearance"        — 1 row per GP, columns repeat in 5 slots:
//                           Hair, Notes, Make-up, Notes, Outfit, Notes,
//                           Posture, Notes, sum EV{N}, Date, Evaluator
//   • "Game Performance"  — same shape, slots repeat: Game Type, Game
//                           performance, Notes, Dealing style, Notes,
//                           SCORE for EV{N}, Date, Evaluator
//   • "Attitude"          — behaviour records (not evaluations)
//   • "Attendance"        — attendance grid
//
// Row 1 carries the "Evaluation N" super-column labels marking slot
// boundaries. Row 2 has the actual column names. Each GP has UP TO 5
// evaluations stacked horizontally; most slots are empty. To build one
// full ExtractedEvaluation we have to:
//   1. Pick the GP row by "Employee Name" (the human-readable name —
//      "Dealer Name" is a login slug we can't fuzzy-match).
//   2. For each slot N in Appearance with a non-empty Date, read the
//      four appearance sub-scores + sum + date + evaluator.
//   3. Cross-look up the same GP row in Game Performance, find the
//      slot whose Date matches, and join in game/perf/dealing/score.
//
// The generic header-driven parser can't express this — it ignores the
// "Evaluation N" super-columns and reads only the first slot. So we run
// this layout-specific parser first, falling back to the generic one.
// ============================================

interface MultiSheetLayout {
  nameCol: number;
  // Slot index (1..5) -> column name -> column number.
  slots: Map<number, Map<string, number>>;
  rawHeaders: string[];
}

/** Build a per-slot column map for a sheet whose row 1 has "Evaluation
 *  N" super-column groupings and row 2 has the real column names. */
function buildMultiSheetLayout(sheet: any): MultiSheetLayout | null {
  if (!sheet) return null;
  const groupRow = sheet.getRow(1);
  const colRow = sheet.getRow(2);
  if (!groupRow || !colRow) return null;

  // Find the human-readable name column ("Employee Name" beats "Dealer
  // Name" beats anything else in the `name` class).
  let nameCol = 0;
  let bestNameScore = -1;
  const rawHeaders: string[] = [];
  colRow.eachCell({ includeEmpty: false }, (cell: any, col: number) => {
    const txt = cellText(cell);
    if (!txt) return;
    rawHeaders.push(txt);
    if (classifyHeader(txt) === "name") {
      const score = nameColumnScore(txt);
      if (score > bestNameScore) { bestNameScore = score; nameCol = col; }
    }
  });
  if (nameCol === 0) return null;

  // Walk row 1 to attach a slot number to every column under each
  // "Evaluation N" / "Record N" super-column header. Merged cells make
  // the slot label appear only in the first column of the span, so we
  // also carry forward the last-seen slot to subsequent columns.
  const slots = new Map<number, Map<string, number>>();
  let curSlot = 0;
  const totalCols = Math.max(groupRow.actualCellCount || 0, colRow.actualCellCount || 0, sheet.columnCount || 0);
  for (let col = 1; col <= totalCols; col++) {
    const groupTxt = cellText(groupRow.getCell(col));
    if (groupTxt) {
      const m = groupTxt.match(/(?:evaluation|record)\s+(\d+)/i);
      if (m) curSlot = Number(m[1]);
    }
    if (curSlot > 0) {
      const colName = cellText(colRow.getCell(col));
      if (colName) {
        if (!slots.has(curSlot)) slots.set(curSlot, new Map());
        // Don't overwrite — first occurrence per slot wins (matters for
        // header-like duplicates within a slot, which the export
        // doesn't actually have but defends against future drift).
        const slotMap = slots.get(curSlot)!;
        if (!slotMap.has(colName)) slotMap.set(colName, col);
      }
    }
  }

  if (slots.size === 0) return null;
  return { nameCol, slots, rawHeaders };
}

/** Look up a slot column by trying a list of header aliases. */
function findSlotCol(slot: Map<string, number>, aliases: string[]): number | undefined {
  const entries = Array.from(slot.entries());
  for (const a of aliases) {
    const al = a.toLowerCase();
    for (let i = 0; i < entries.length; i++) {
      if (entries[i][0].toLowerCase() === al) return entries[i][1];
    }
  }
  // Fuzzy fallback: substring match (case-insensitive).
  for (const a of aliases) {
    const al = a.toLowerCase();
    for (let i = 0; i < entries.length; i++) {
      if (entries[i][0].toLowerCase().includes(al)) return entries[i][1];
    }
  }
  return undefined;
}

/** Parse the real wide multi-eval Studioworks export. Returns null when
 *  the workbook isn't the expected shape so the caller can fall through
 *  to the generic per-sheet parser. */
function parseStudioworksMultiEval(wb: any): SheetParseResult | null {
  const sheets: any[] = wb?.worksheets || [];
  const appearance = sheets.find(s => /appearance/i.test(s.name || ""));
  if (!appearance) return null;

  const appLayout = buildMultiSheetLayout(appearance);
  if (!appLayout) return null;
  // Confirm we're actually looking at the Appearance multi-eval layout
  // (not a coincidentally-named sheet). At least one slot must carry
  // Hair / Make-up / Outfit / Posture columns.
  const firstSlot = appLayout.slots.get(Array.from(appLayout.slots.keys()).sort((a, b) => a - b)[0]);
  if (!firstSlot) return null;
  const hasAppearanceSignal = ["Hair", "Make-up", "Outfit", "Posture"]
    .some(c => findSlotCol(firstSlot, [c]) != null);
  if (!hasAppearanceSignal) return null;

  const gamePerf = sheets.find(s => /game ?performance/i.test(s.name || ""));
  const gpLayout = gamePerf ? buildMultiSheetLayout(gamePerf) : null;

  // For O(1) cross-sheet GP lookup. Key = lowercased trimmed name from
  // "Employee Name" so it matches Appearance's name.
  const gpRowByName = new Map<string, number>();
  if (gamePerf && gpLayout) {
    const lastRowGp = gamePerf.rowCount || 0;
    for (let r = 3; r <= lastRowGp; r++) {
      const n = cellText(gamePerf.getRow(r).getCell(gpLayout.nameCol));
      if (n) gpRowByName.set(n.toLowerCase().trim(), r);
    }
  }

  const rows: ExcelRawEval[] = [];
  let totalDataRows = 0;
  let skippedRows = 0;
  const lastRow = appearance.rowCount || 0;

  const slotKeys = Array.from(appLayout.slots.keys()).sort((a, b) => a - b);

  for (let r = 3; r <= lastRow; r++) {
    const aRow = appearance.getRow(r);
    const name = cellText(aRow.getCell(appLayout.nameCol));
    if (!isLikelyName(name)) { if (name) skippedRows++; continue; }
    totalDataRows++;

    const gpRowNum = gpRowByName.get(name!.toLowerCase().trim()) ?? null;
    const gpRow = gpRowNum && gamePerf ? gamePerf.getRow(gpRowNum) : null;

    for (const slotIdx of slotKeys) {
      const slot = appLayout.slots.get(slotIdx)!;
      const dateCol = findSlotCol(slot, ["Date"]);
      const date = dateCol ? cellDate(aRow.getCell(dateCol)) : null;
      if (!date) continue; // empty slot — no eval here

      const evaluatorCol = findSlotCol(slot, ["Evaluator"]);
      const evaluatorName = evaluatorCol ? (cellText(aRow.getCell(evaluatorCol)) ?? undefined) : undefined;

      const ratings: ExcelRawEval["ratings"] = {};
      const hairCol = findSlotCol(slot, ["Hair"]);
      if (hairCol) { const sc = cellNumber(aRow.getCell(hairCol)); if (sc != null) ratings.hair = { score: sc, maxScore: 3 }; }
      const muCol = findSlotCol(slot, ["Make-up", "Makeup"]);
      if (muCol) { const sc = cellNumber(aRow.getCell(muCol)); if (sc != null) ratings.makeup = { score: sc, maxScore: 3 }; }
      const ofCol = findSlotCol(slot, ["Outfit"]);
      if (ofCol) { const sc = cellNumber(aRow.getCell(ofCol)); if (sc != null) ratings.outfit = { score: sc, maxScore: 3 }; }
      const poCol = findSlotCol(slot, ["Posture"]);
      if (poCol) { const sc = cellNumber(aRow.getCell(poCol)); if (sc != null) ratings.posture = { score: sc, maxScore: 3 }; }

      const sumCol = (() => {
        const entries = Array.from(slot.entries());
        for (let i = 0; i < entries.length; i++) {
          if (/^sum/i.test(entries[i][0])) return entries[i][1];
        }
        return undefined;
      })();
      const appearanceSum = sumCol ? cellNumber(aRow.getCell(sumCol)) : null;

      // Cross-sheet join: find the Game Performance slot for this GP
      // whose Date matches our Appearance slot's Date. We DON'T assume
      // slot N in Appearance == slot N in GamePerformance (it usually
      // does, but matching by date is safer if Studioworks ever
      // re-orders).
      let game: string | undefined;
      let gpfSlotScore: number | null = null;
      if (gpRow && gpLayout) {
        const gpSlotKeys = Array.from(gpLayout.slots.keys());
        for (let i = 0; i < gpSlotKeys.length; i++) {
          const gpSlot = gpLayout.slots.get(gpSlotKeys[i])!;
          const gpDateCol = findSlotCol(gpSlot, ["Date"]);
          const gpDate = gpDateCol ? cellDate(gpRow.getCell(gpDateCol)) : null;
          if (gpDate !== date) continue;
          const gameCol = findSlotCol(gpSlot, ["Game Type", "Game"]);
          if (gameCol) game = cellText(gpRow.getCell(gameCol)) ?? undefined;
          const gpfCol = findSlotCol(gpSlot, ["Game performance", "Performance"]);
          if (gpfCol) { const sc = cellNumber(gpRow.getCell(gpfCol)); if (sc != null) ratings.gamePerformance = { score: sc, maxScore: 5 }; }
          const dsCol = findSlotCol(gpSlot, ["Dealing style/accuracy", "Dealing style", "Dealing"]);
          if (dsCol) { const sc = cellNumber(gpRow.getCell(dsCol)); if (sc != null) ratings.dealingStyle = { score: sc, maxScore: 5 }; }
          // "SCORE for EV{N}" — Studioworks' per-slot total for the
          // game-performance sheet (max 10 = perf 5 + dealing 5).
          const gpSlotEntries = Array.from(gpSlot.entries());
          for (let j = 0; j < gpSlotEntries.length; j++) {
            if (/^score/i.test(gpSlotEntries[j][0])) {
              const sc = cellNumber(gpRow.getCell(gpSlotEntries[j][1]));
              if (sc != null) gpfSlotScore = sc;
            }
          }
          break;
        }
      }

      // Combined total = appearance sum (out of 12) + game-perf score
      // (out of 10), so up to 22 per evaluation. Stay inside the
      // importBatch 0..100 zod cap.
      let totalScore: number | undefined;
      if (appearanceSum != null || gpfSlotScore != null) {
        const t = (appearanceSum ?? 0) + (gpfSlotScore ?? 0);
        if (t > 0 && t <= 100) totalScore = t;
      }

      const externalId = `xlsx-sw-${fnv1a(`${name}|${date}|${evaluatorName ?? ""}|${slotIdx}`)}`;
      rows.push({
        externalId,
        presenterName: name!.trim(),
        evaluatorName,
        date,
        game,
        totalScore,
        ratings,
      });
    }
  }

  const detected: string[] = ["name", "date", "evaluator"];
  if (firstSlot && findSlotCol(firstSlot, ["Hair"])) detected.push("hair");
  if (firstSlot && findSlotCol(firstSlot, ["Make-up", "Makeup"])) detected.push("makeup");
  if (firstSlot && findSlotCol(firstSlot, ["Outfit"])) detected.push("outfit");
  if (firstSlot && findSlotCol(firstSlot, ["Posture"])) detected.push("posture");
  if (gpLayout) {
    detected.push("game", "gamePerformance", "dealingStyle", "totalScore");
  }

  const warnings: string[] = [];
  if (!gamePerf) {
    warnings.push("No 'Game Performance' sheet found — only Appearance scores were imported. Re-export from Studioworks if you also need Game and Dealing scores.");
  }

  return {
    rows,
    sheetName: gamePerf ? `Appearance + Game Performance` : `Appearance`,
    headerRowNumber: 2,
    detectedColumns: detected,
    rawHeaders: appLayout.rawHeaders,
    totalDataRows,
    skippedRows,
    warnings,
    looksAggregate: false,
  };
}

/**
 * Parse the "Attitude" sheet (wide format: 3 "Record N" slots per GP,
 * each = Date / Type (POSITIVE|NEGATIVE) / Score (+1|-1) / Comment).
 * Returns one event per non-empty record. Each maps onto an
 * attitude_screenshots row downstream.
 */
function parseStudioworksAttitude(wb: any): AttitudeRawEvent[] {
  const sheets: any[] = wb?.worksheets || [];
  const sheet = sheets.find(s => /attitude/i.test(s?.name || ""));
  if (!sheet) return [];
  const layout = buildMultiSheetLayout(sheet); // row1 "Record N", row2 col names
  if (!layout) return [];

  const out: AttitudeRawEvent[] = [];
  const slotKeys = Array.from(layout.slots.keys()).sort((a, b) => a - b);
  const lastRow = sheet.rowCount || 0;
  for (let r = 3; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const name = cellText(row.getCell(layout.nameCol));
    if (!isLikelyName(name)) continue;
    for (const slotIdx of slotKeys) {
      const slot = layout.slots.get(slotIdx)!;
      const dateCol = findSlotCol(slot, ["Date"]);
      const date = dateCol ? cellDate(row.getCell(dateCol)) : null;
      if (!date) continue; // empty record slot

      const typeCol = findSlotCol(slot, ["Type"]);
      const scoreCol = findSlotCol(slot, ["Score"]);
      const commentCol = findSlotCol(slot, ["Comment"]);
      const rawType = (typeCol ? cellText(row.getCell(typeCol)) : null)?.toLowerCase() ?? "";
      let score = scoreCol ? cellNumber(row.getCell(scoreCol)) : null;

      // Resolve type/score consistently — trust the Type label first,
      // fall back to the sign of the score, default neutral.
      let type: AttitudeRawEvent["type"] = "neutral";
      if (/pos/.test(rawType)) type = "positive";
      else if (/neg/.test(rawType)) type = "negative";
      else if (score != null && score > 0) type = "positive";
      else if (score != null && score < 0) type = "negative";

      if (score == null) score = type === "positive" ? 1 : type === "negative" ? -1 : 0;
      // Normalise the sign to match the type so a stray "1" on a NEGATIVE
      // row can't flip the net attitude.
      if (type === "positive") score = Math.abs(score);
      else if (type === "negative") score = -Math.abs(score);
      else score = 0;
      if (score === 0 && type === "neutral") continue; // nothing scoreable

      const comment = commentCol ? (cellText(row.getCell(commentCol)) ?? undefined) : undefined;
      const externalId = `xlsx-att-${fnv1a(`${name}|${date}|${slotIdx}|${comment ?? ""}`)}`;
      out.push({ externalId, presenterName: name!.trim(), date, type, score, comment });
    }
  }
  return out;
}

/** Parse a whole workbook. Tries the layout-specific multi-eval parser
 *  (real Studioworks export) first; falls back to the generic
 *  per-sheet header-driven parser for any other shape. Attitude events
 *  are parsed independently from the Attitude sheet and attached. */
export function parseStudioworksWorkbook(wb: any): WorkbookParseResult {
  const attitudeEvents = parseStudioworksAttitude(wb);
  const sheets: any[] = wb?.worksheets || [];
  if (sheets.length === 0) {
    return { rows: [], sheetName: "", headerRowNumber: 0, detectedColumns: [], rawHeaders: [], totalDataRows: 0, skippedRows: 0, warnings: ["The workbook has no sheets."], looksAggregate: false, attitudeEvents };
  }
  // 1) Studioworks "Export report XLS" multi-eval layout — preferred.
  const multi = parseStudioworksMultiEval(wb);
  if (multi && multi.rows.length > 0) return { ...multi, attitudeEvents };
  // 2) Generic per-sheet header-driven parser (single-row-per-eval
  //    exports and any other reasonable shape).
  const results = sheets.map(parseSheet);
  results.sort((a, b) => {
    if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
    return b.detectedColumns.length - a.detectedColumns.length;
  });
  const best = results[0];
  if (best.rows.length === 0) {
    const allWarnings = Array.from(new Set(results.flatMap(r => r.warnings)));
    // If multi-eval detection ran but produced 0 rows, include its
    // warnings so the user sees actionable feedback.
    if (multi && multi.warnings.length) allWarnings.push(...multi.warnings);
    return { ...best, warnings: allWarnings.length ? allWarnings : best.warnings, attitudeEvents };
  }
  return { ...best, attitudeEvents };
}

export const studioworksSyncRouter = router({
  /**
   * Diagnostic probe — runs login + page load + extraction discovery
   * but DOES NOT write to DB. Returns per-step status + a screenshot
   * of the page on failure so the admin can see what's actually going
   * on. Same UX pattern as personaSync.testConnection.
   */
  testConnection: adminProcedure.mutation(async () => {
    return await testStudioworksConnection();
  }),

  /**
   * Parse an uploaded Studioworks "Export report XLS" file into preview
   * rows — does NOT write to DB. The FM reviews/deselects rows in the
   * UI, then commits them through `importBatch` (same matcher/dedup as
   * every other ingest path).
   *
   * Header-driven & tolerant: works whether the export is name-first or
   * date-first, totals-only or with the six sub-criteria, and across
   * date formats ("6 Jun 2026", ISO, dd.mm.yyyy, Excel serials). The
   * raw headers are echoed back so an unexpected layout is diagnosable
   * at a glance instead of silently importing nothing.
   *
   * FM-accessible (not admin-only) — FMs ingest their own teams.
   */
  parseExcel: protectedProcedure
    .input(z.object({
      fileBase64: z.string().min(1),
      filename: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ExcelJS = await import("exceljs");
      // Tolerate a data-URL prefix ("data:...;base64,XXXX").
      const b64 = input.fileBase64.includes(",")
        ? input.fileBase64.slice(input.fileBase64.indexOf(",") + 1)
        : input.fileBase64;
      const buf = Buffer.from(b64, "base64");
      if (buf.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file was empty or could not be decoded." });
      }
      const wb = new ExcelJS.default.Workbook();
      try {
        await wb.xlsx.load(buf as any);
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Couldn't read that as an .xlsx file${e instanceof Error ? `: ${e.message}` : ""}. Make sure you exported "Export report XLS" (not CSV or PDF).`,
        });
      }
      const parsed = parseStudioworksWorkbook(wb);
      log.info(`Studioworks parseExcel (user=${ctx.user.id}): file="${input.filename ?? "?"}" sheet="${parsed.sheetName}" rows=${parsed.rows.length} attitude=${parsed.attitudeEvents.length} skipped=${parsed.skippedRows} cols=[${parsed.detectedColumns.join(",")}]`);
      return {
        rows: parsed.rows,
        attitudeEvents: parsed.attitudeEvents,
        sheetName: parsed.sheetName,
        headerRowNumber: parsed.headerRowNumber,
        detectedColumns: parsed.detectedColumns,
        rawHeaders: parsed.rawHeaders,
        totalDataRows: parsed.totalDataRows,
        skippedRows: parsed.skippedRows,
        warnings: parsed.warnings,
        looksAggregate: parsed.looksAggregate,
      };
    }),

  /**
   * Pull evaluations and insert them. Per-row errors don't stop the
   * batch — each row reports its own status.
   */
  syncNow: adminProcedure.mutation(async ({ ctx }): Promise<StudioworksSyncSummary> => {
    const result = await syncStudioworksEvaluations();
    if (!result.success) {
      return {
        status: "failed",
        source: result.source,
        totalFound: 0,
        inserted: 0,
        skippedExisting: 0,
        unmatched: 0,
        errors: 0,
        details: [],
        error: result.error,
      };
    }

    const details: ImportDetail[] = [];
    for (const raw of result.evaluations) {
      try {
        const d = await importOne(raw, ctx.user.id);
        details.push(d);
      } catch (e) {
        details.push({
          externalId: raw.externalId,
          presenterName: raw.presenterName,
          evaluatorName: raw.evaluatorName,
          date: raw.date,
          game: raw.game,
          matched: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const inserted = details.filter(d => d.matched && !d.skippedExisting && !d.error).length;
    const skippedExisting = details.filter(d => d.skippedExisting).length;
    const unmatched = details.filter(d => !d.matched && !d.error?.includes("date")).length;
    const errors = details.filter(d => d.error).length;
    const status: StudioworksSyncSummary["status"] =
      result.evaluations.length === 0 ? "failed" :
        unmatched > 0 || errors > 0 ? "partial" : "success";

    log.info(`Studioworks sync: source=${result.source} found=${result.evaluations.length} inserted=${inserted} skipped=${skippedExisting} unmatched=${unmatched} errors=${errors}`);

    if (inserted > 0) publish({ type: "evaluations.changed", source: "studioworks", count: inserted });

    return {
      status,
      source: result.source,
      totalFound: result.evaluations.length,
      inserted,
      skippedExisting,
      unmatched,
      errors,
      details,
    };
  }),

  /**
   * Client-side import — accepts an array of evaluations the FM has
   * already extracted from team.studioworks.ee (via bookmarklet, dev
   * console paste, or bulk-paste UI) and runs them through the SAME
   * `importOne` matcher / dedup that the server-side scraper uses.
   *
   * Why this exists: the server-side Puppeteer scraper depends on
   * Chromium runtime libs that aren't installed on the deploy host,
   * so we let the FM's already-authenticated browser do the
   * extraction and just POST the structured rows here. No browser
   * deps, no creds in our env, instant.
   *
   * Accessible to FMs (not just admin) because they need to ingest
   * evaluations for their own teams without filing IT tickets.
   */
  importBatch: protectedProcedure
    .input(z.object({
      evaluations: z.array(z.object({
        externalId: z.string().min(1),
        presenterName: z.string().min(1).max(255),
        evaluatorName: z.string().max(255).optional(),
        date: z.string().min(1),
        game: z.string().max(100).optional(),
        totalScore: z.number().min(0).max(100).optional(),
        ratings: z.object({
          hair: z.object({ score: z.number(), maxScore: z.number(), comment: z.string().optional() }).optional(),
          makeup: z.object({ score: z.number(), maxScore: z.number(), comment: z.string().optional() }).optional(),
          outfit: z.object({ score: z.number(), maxScore: z.number(), comment: z.string().optional() }).optional(),
          posture: z.object({ score: z.number(), maxScore: z.number(), comment: z.string().optional() }).optional(),
          dealingStyle: z.object({ score: z.number(), maxScore: z.number(), comment: z.string().optional() }).optional(),
          gamePerformance: z.object({ score: z.number(), maxScore: z.number(), comment: z.string().optional() }).optional(),
        }),
        overallComment: z.string().optional(),
        /** Optional FM-supplied override: skip fuzzy matching and use
         *  this GP id directly. Used by the unmatched-resolver UI when
         *  the importer couldn't auto-match a name. */
        forceGpId: z.number().int().positive().optional(),
      })).min(1).max(1000),
    }))
    .mutation(async ({ ctx, input }): Promise<StudioworksSyncSummary> => {
      const details: ImportDetail[] = [];
      for (const raw of input.evaluations) {
        try {
          const { forceGpId, ...rest } = raw;
          // Authorize the override: FMs can only force-match into GPs
          // they own. Admins can force into anything.
          if (forceGpId && ctx.user.role !== "admin") {
            const gp = await db.getGamePresenterById(forceGpId);
            if (!gp || (gp.userId && gp.userId !== ctx.user.id)) {
              details.push({
                externalId: raw.externalId,
                presenterName: raw.presenterName,
                evaluatorName: raw.evaluatorName,
                date: raw.date,
                game: raw.game,
                matched: false,
                error: "Cannot map to a GP outside your team",
              });
              continue;
            }
          }
          const d = await importOne(rest as ExtractedEvaluation, ctx.user.id, forceGpId);
          // For FMs, only allow imports that match a GP they own.
          // If the matched GP belongs to another FM, refuse —
          // otherwise an FM could silently inject evaluations into
          // someone else's team.
          if (ctx.user.role !== "admin" && d.matched && d.gpId) {
            const gp = await db.getGamePresenterById(d.gpId);
            if (gp && gp.userId && gp.userId !== ctx.user.id) {
              details.push({
                ...d,
                error: "Skipped: GP belongs to a different FM",
              });
              continue;
            }
          }
          details.push(d);
        } catch (e) {
          details.push({
            externalId: raw.externalId,
            presenterName: raw.presenterName,
            evaluatorName: raw.evaluatorName,
            date: raw.date,
            game: raw.game,
            matched: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const inserted = details.filter(d => d.matched && !d.skippedExisting && !d.error).length;
      const skippedExisting = details.filter(d => d.skippedExisting).length;
      const unmatched = details.filter(d => !d.matched && !d.error?.includes("date")).length;
      const errors = details.filter(d => d.error).length;
      const status: StudioworksSyncSummary["status"] =
        input.evaluations.length === 0 ? "failed" :
          unmatched > 0 || errors > 0 ? "partial" : "success";

      log.info(`Studioworks import-batch (user=${ctx.user.id}): submitted=${input.evaluations.length} inserted=${inserted} skipped=${skippedExisting} unmatched=${unmatched} errors=${errors}`);

      if (inserted > 0) publish({ type: "evaluations.changed", source: "studioworks", userId: ctx.user.id, count: inserted });

      return {
        status,
        source: "json",
        totalFound: input.evaluations.length,
        inserted,
        skippedExisting,
        unmatched,
        errors,
        details,
      };
    }),

  /**
   * Import attitude records parsed from the Studioworks "Attitude" sheet.
   * Each record (POSITIVE +1 / NEGATIVE -1) becomes an
   * `attitude_screenshots` row — the same model the screenshot-OCR path
   * feeds — after which the GP's monthly attitude is recomputed (which
   * respects any manual override via attitudeIsManual).
   *
   * Idempotent: a record is skipped when an attitude row already exists
   * for the same GP / day / score / comment, so re-uploading the same
   * export never double-counts. Same fuzzy-match + team-ownership rules
   * as importBatch.
   */
  importAttitudeBatch: protectedProcedure
    .input(z.object({
      events: z.array(z.object({
        externalId: z.string().min(1),
        presenterName: z.string().min(1).max(255),
        date: z.string().min(1),
        type: z.enum(["positive", "negative", "neutral"]),
        score: z.number().int().min(-10).max(10),
        comment: z.string().max(2000).optional(),
        forceGpId: z.number().int().positive().optional(),
      })).min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      interface AttitudeDetail {
        externalId: string;
        presenterName: string;
        date: string;
        type: string;
        score: number;
        matched: boolean;
        gpId?: number;
        gpName?: string;
        skippedExisting?: boolean;
        error?: string;
      }
      const details: AttitudeDetail[] = [];
      const touched = new Map<string, { gpId: number; month: number; year: number }>();
      // (gpId,month,year) → set of existing+staged record signatures, for
      // both in-DB and in-batch dedup.
      const sigCache = new Map<string, Set<string>>();
      const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

      for (const ev of input.events) {
        const base: AttitudeDetail = {
          externalId: ev.externalId, presenterName: ev.presenterName,
          date: ev.date, type: ev.type, score: ev.score, matched: false,
        };
        try {
          const d = parseStudioworksDate(ev.date);
          if (!d) { details.push({ ...base, error: `unparseable date: "${ev.date}"` }); continue; }
          const month = d.getMonth() + 1;
          const year = d.getFullYear();

          // GP resolution — explicit override (authorized) or fuzzy match.
          let gpId: number; let gpName: string; let gpOwnerId: number | null = null;
          if (ev.forceGpId) {
            const gp = await db.getGamePresenterById(ev.forceGpId);
            if (!gp) { details.push({ ...base, error: `forced GP id ${ev.forceGpId} not found` }); continue; }
            if (ctx.user.role !== "admin" && gp.userId && gp.userId !== ctx.user.id) {
              details.push({ ...base, error: "Cannot map to a GP outside your team" }); continue;
            }
            gpId = gp.id; gpName = gp.name; gpOwnerId = gp.userId ?? null;
          } else {
            const match = await db.findBestMatchingGP(ev.presenterName, 0.7);
            if (!match) { details.push({ ...base, error: `no GP matched for "${ev.presenterName}"` }); continue; }
            gpId = match.gamePresenter.id; gpName = match.gamePresenter.name; gpOwnerId = match.gamePresenter.userId ?? null;
            if (ctx.user.role !== "admin" && gpOwnerId && gpOwnerId !== ctx.user.id) {
              details.push({ ...base, matched: true, gpId, gpName, error: "Skipped: GP belongs to a different FM" }); continue;
            }
          }

          // Idempotency: build (and cache) the signature set for this bucket.
          const key = `${gpId}-${month}-${year}`;
          let sigs = sigCache.get(key);
          if (!sigs) {
            sigs = new Set<string>();
            const existing = await db.getAttitudeScreenshotsForGP(gpId, month, year);
            for (const row of existing) {
              const eff = row.evaluationDate ?? row.createdAt ?? new Date();
              sigs.add(`${isoDay(new Date(eff))}|${row.attitudeScore ?? 0}|${norm(row.comment)}`);
            }
            sigCache.set(key, sigs);
          }
          const sig = `${isoDay(d)}|${ev.score}|${norm(ev.comment)}`;
          if (sigs.has(sig)) { details.push({ ...base, matched: true, gpId, gpName, skippedExisting: true }); continue; }

          await db.createAttitudeScreenshot({
            gamePresenterId: gpId,
            gpName: ev.presenterName,
            evaluationDate: d,
            attitudeType: ev.type,
            attitudeScore: ev.score,
            attitudeCategory: ev.type,
            comment: ev.comment ?? null,
            month,
            year,
            uploadedById: ctx.user.id,
            rawExtractedData: { source: "studioworks", externalId: ev.externalId } as any,
          });
          sigs.add(sig);
          touched.set(key, { gpId, month, year });
          details.push({ ...base, matched: true, gpId, gpName });
        } catch (e) {
          details.push({ ...base, error: e instanceof Error ? e.message : String(e) });
        }
      }

      // Recompute monthly attitude for each touched bucket. Skips rows
      // pinned as a manual override (attitudeIsManual = 1) internally.
      for (const { gpId, month, year } of Array.from(touched.values())) {
        try { await db.recomputeGPAttitudeFromScreenshots(gpId, month, year); }
        catch (e) { log.warn(`attitude recompute failed gp=${gpId} ${month}/${year}: ${e instanceof Error ? e.message : String(e)}`); }
      }

      const inserted = details.filter(d => d.matched && !d.skippedExisting && !d.error).length;
      const skippedExisting = details.filter(d => d.skippedExisting).length;
      const unmatched = details.filter(d => !d.matched && !d.error?.includes("date")).length;
      const errors = details.filter(d => d.error).length;
      const status: StudioworksSyncSummary["status"] =
        input.events.length === 0 ? "failed" : (unmatched > 0 || errors > 0 ? "partial" : "success");

      log.info(`Studioworks attitude import (user=${ctx.user.id}): submitted=${input.events.length} inserted=${inserted} skipped=${skippedExisting} unmatched=${unmatched} errors=${errors} recomputed=${touched.size}`);

      if (inserted > 0) publish({ type: "evaluations.changed", source: "studioworks-attitude", userId: ctx.user.id, count: inserted });

      return { status, totalFound: input.events.length, inserted, skippedExisting, unmatched, errors, details };
    }),
});
