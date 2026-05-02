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
      })).min(1).max(500),
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
});
