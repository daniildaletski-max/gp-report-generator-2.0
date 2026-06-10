/**
 * Persona sync engine — the one flow shared by the admin "Sync now"
 * button and the scheduled cron: scrape a month from Persona, resolve
 * each worker to a GP (learned alias first, then the global fuzzy
 * matcher), overwrite that GP's monthly attendance, and record a
 * history row. Company-wide — every worker Persona returns is matched
 * against the whole roster.
 */
import * as db from "../db";
import { syncPersonaAttendance, type PersonaWorkerAttendance } from "./personaScraper";
import { createLogger } from "../services/logger";

const log = createLogger("PersonaSync");

export interface PersonaWorkerDetail {
  workerName: string;
  matched: boolean;
  viaAlias?: boolean;
  gpId?: number;
  gpName?: string;
  counts: { sickLeaves: number; missedDays: number; lateToWork: number; extraShifts: number };
  /** Exact dates per bucket — lets the UI show "which days". */
  dayBreakdown?: PersonaWorkerAttendance["dayBreakdown"];
  error?: string;
}

export interface PersonaSyncRunResult {
  success: boolean;
  error?: string;
  month: number;
  year: number;
  totalWorkers: number;
  matched: number;
  unmatched: number;
  applied: number;
  status: "success" | "partial" | "failed";
  details: PersonaWorkerDetail[];
  diagnostics?: { allTypes: string[]; bucketCounts: { sick: number; missed: number; extra: number; late: number; unknown: number } };
}

/** Optional roster filter — only workers of this Persona project sync.
 *  Unset = every worker on the schedule page. */
function projectIdFromEnv(): number | null {
  const raw = parseInt(process.env.PERSONA_PROJECT_ID || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export async function runPersonaSync(opts: {
  month: number;
  year: number;
  trigger: "manual" | "scheduled";
  triggeredById: number | null;
}): Promise<PersonaSyncRunResult> {
  const { month, year } = opts;
  const startedAt = new Date();

  const scrape = await syncPersonaAttendance(month, year, projectIdFromEnv());
  if (!scrape.success) {
    await db.recordPersonaSyncLog({
      teamId: null, triggeredById: opts.triggeredById, source: opts.trigger,
      month, year, status: "failed", totalWorkers: 0, matched: 0, unmatched: 0,
      errorMessage: scrape.error ?? "scrape failed", startedAt, completedAt: new Date(),
    });
    return {
      success: false, error: scrape.error, month, year,
      totalWorkers: 0, matched: 0, unmatched: 0, applied: 0,
      status: "failed", details: [], diagnostics: scrape.diagnostics,
    };
  }

  const details: PersonaWorkerDetail[] = [];
  let applied = 0;
  for (const worker of scrape.workers) {
    const counts = {
      sickLeaves: worker.sickLeaves,
      missedDays: worker.missedDays,
      lateToWork: worker.lateToWork,
      extraShifts: worker.extraShifts,
    };
    const base: PersonaWorkerDetail = {
      workerName: worker.name, matched: false, counts, dayBreakdown: worker.dayBreakdown,
    };
    try {
      // 1) A learned alias wins over the fuzzy matcher.
      const aliasGpId = await db.resolvePersonaAlias(worker.name);
      const aliasGp = aliasGpId ? await db.getGamePresenterById(aliasGpId) : null;
      let gpId: number; let gpName: string; let viaAlias = false;
      if (aliasGp) {
        gpId = aliasGp.id; gpName = aliasGp.name; viaAlias = true;
      } else {
        const match = await db.findBestMatchingGP(worker.name, 0.7);
        if (!match) { details.push(base); continue; }
        gpId = match.gamePresenter.id;
        gpName = match.gamePresenter.name;
      }
      await db.applyPersonaAttendance(gpId, month, year, counts);
      applied++;
      details.push({ ...base, matched: true, viaAlias, gpId, gpName });
    } catch (e) {
      details.push({ ...base, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const summary = db.summarizePersonaSync(details);
  await db.recordPersonaSyncLog({
    teamId: null, triggeredById: opts.triggeredById, source: opts.trigger,
    month, year, status: summary.status,
    totalWorkers: summary.totalWorkers, matched: summary.matched, unmatched: summary.unmatched,
    startedAt, completedAt: new Date(),
  });

  log.info(`Persona sync ${month}/${year} (${opts.trigger}): workers=${summary.totalWorkers} matched=${summary.matched} unmatched=${summary.unmatched} applied=${applied}`);

  return {
    success: true, month, year,
    totalWorkers: summary.totalWorkers, matched: summary.matched, unmatched: summary.unmatched,
    applied, status: summary.status, details, diagnostics: scrape.diagnostics,
  };
}
