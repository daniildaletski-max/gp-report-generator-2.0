/**
 * Persona Sync Router
 *
 * Provides tRPC procedures for syncing attendance data from the
 * Persona HR system. Differences from the original:
 *   - matches workers to GPs via the existing fuzzy matcher
 *     (`findBestMatchingGP`), so naming variations / partial matches
 *     are handled the same way they are everywhere else in the app
 *   - persists every attempt to `persona_sync_logs` so the admin can
 *     see when each team last got fresh data and why a sync failed
 *   - exposes `previewSync` and `lastSync` so the UI can show what
 *     would change before actually applying it
 *
 * Sync-log writes are best-effort: if the persona_sync_logs table
 * is missing (e.g. migration not yet applied) or the insert errors
 * for any reason, we log it and continue. Logging failures must never
 * block the actual scrape/match/update.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import * as db from "../db";
import { syncPersonaAttendance } from "../services/personaScraper";
import { createLogger } from "../services/logger";

const log = createLogger("PersonaSync");

/**
 * Wrap a sync-log DB write in a try/catch — failures here (e.g. table
 * missing because the migration wasn't applied yet) must NEVER stop
 * the actual sync from running.
 */
async function tryLog<T>(op: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await op();
  } catch (err) {
    log.warn(`${label} (non-fatal — sync continues)`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

interface MatchDetail {
  gpId: number | null;
  gpName: string;
  personaName: string;
  matched: boolean;
  similarity: number;
  changes: { sickLeaves?: { from: number; to: number }; missedDays?: { from: number; to: number }; extraShifts?: { from: number; to: number } };
  /**
   * Diagnostic info for unmatched rows so the admin can tell at a
   * glance WHY each Persona worker didn't match: closest GP candidate
   * (name + similarity) plus a one-word reason (`below-threshold` |
   * `wrong-team` | `no-candidates`).
   */
  reason?: "below-threshold" | "wrong-team" | "no-candidates";
  closestGpName?: string;
  closestGpTeam?: number | null;
  closestSimilarity?: number;
}

/**
 * Run the actual sync. Extracted so it's reusable from both the
 * `syncTeam` mutation and the scheduled cron job (which lives in
 * scheduledReports.ts).
 */
export async function runPersonaSyncForTeam(opts: {
  teamId: number;
  month: number;
  year: number;
  triggeredById: number | null;
  source: "manual" | "scheduled";
  dryRun?: boolean;
}): Promise<{
  matched: number;
  unmatched: number;
  totalPersonaWorkers: number;
  matchDetails: MatchDetail[];
  status: "success" | "partial" | "failed";
  error?: string;
}> {
  const team = await db.getFmTeamById(opts.teamId);
  if (!team) throw new Error("Team not found");

  // Open a sync-log row early so even a hard failure leaves a trace.
  // Best-effort: if the persona_sync_logs table is missing or the insert
  // fails for any reason, we keep going — the sync itself must not be
  // blocked by a logging failure.
  const logRow = opts.dryRun
    ? null
    : await tryLog(
        () => db.createSyncLog({
          teamId: opts.teamId,
          triggeredById: opts.triggeredById,
          source: opts.source,
          month: opts.month,
          year: opts.year,
          status: "failed", // updated below on success
          totalWorkers: 0,
          matched: 0,
          unmatched: 0,
        }),
        "createSyncLog failed",
      );

  try {
    const projectId = (team as any).personaProjectId as number | null;
    const result = await syncPersonaAttendance(opts.month, opts.year, projectId);

    if (!result.success) {
      if (logRow) {
        await tryLog(
          () => db.updateSyncLog(logRow.id, {
            status: "failed",
            errorMessage: result.error || "Persona scrape returned success=false",
            completedAt: new Date(),
          }),
          "updateSyncLog (failure path) failed",
        );
      }
      return {
        matched: 0,
        unmatched: 0,
        totalPersonaWorkers: 0,
        matchDetails: [],
        status: "failed",
        error: result.error || "Failed to sync from Persona",
      };
    }

    let matched = 0;
    let unmatched = 0;
    const matchDetails: MatchDetail[] = [];
    const userId = team.userId ?? undefined;

    for (const worker of result.workers) {
      // Use the same fuzzy matcher the rest of the app uses.
      // Threshold 0.7 mirrors what evaluation upload uses.
      // NOTE: findBestMatchingGPByUser signature is (name, threshold, userId)
      // — keep the argument order in sync with that.
      const match = userId
        ? await db.findBestMatchingGPByUser(worker.name, 0.7, userId)
        : await db.findBestMatchingGP(worker.name, 0.7);

      // For diagnostic logging: when the strict 0.7 match fails OR
      // matches the wrong team, ALSO compute the closest fuzzy match
      // at threshold 0 across the full GP table. Lets the FM see "this
      // Persona person is closest to GP X (62%)" instead of an opaque
      // "no match found" — they can decide whether it's a spelling
      // issue, a wrong-team Persona project, or a person who
      // genuinely isn't a GP.
      const closestForDebug = !match || match.gamePresenter.teamId !== opts.teamId
        ? (userId
          ? await db.findBestMatchingGPByUser(worker.name, 0, userId)
          : await db.findBestMatchingGP(worker.name, 0))
        : null;

      // Only accept matches whose GP belongs to *this* team — Persona
      // returns workers across the whole project, but we only want the
      // GPs that the FM owns.
      if (match && match.gamePresenter.teamId === opts.teamId) {
        const existing = await db.getOrCreateAttendance(match.gamePresenter.id, opts.month, opts.year);
        const changes: MatchDetail["changes"] = {};
        if ((existing.sickLeaves ?? 0) !== worker.sickLeaves) {
          changes.sickLeaves = { from: existing.sickLeaves ?? 0, to: worker.sickLeaves };
        }
        if ((existing.missedDays ?? 0) !== worker.missedDays) {
          changes.missedDays = { from: existing.missedDays ?? 0, to: worker.missedDays };
        }
        if ((existing.extraShifts ?? 0) !== worker.extraShifts) {
          changes.extraShifts = { from: existing.extraShifts ?? 0, to: worker.extraShifts };
        }

        if (!opts.dryRun && Object.keys(changes).length > 0) {
          await db.updateAttendance(existing.id, {
            sickLeaves: worker.sickLeaves,
            missedDays: worker.missedDays,
            extraShifts: worker.extraShifts,
          });
        }
        matched++;
        matchDetails.push({
          gpId: match.gamePresenter.id,
          gpName: match.gamePresenter.name,
          personaName: worker.name,
          matched: true,
          similarity: match.similarity,
          changes,
        });
      } else {
        unmatched++;
        // Decide the reason for the failure so the FM gets actionable
        // feedback, not just "no match found".
        let reason: MatchDetail["reason"] = "no-candidates";
        if (match && match.gamePresenter.teamId !== opts.teamId) {
          // We DID find a strong match but it belongs to another team.
          // Almost always means the Persona Project ID configured for
          // this team is actually the project ID of a different team.
          reason = "wrong-team";
        } else if (closestForDebug) {
          // We found a candidate but its similarity is below 0.7.
          reason = "below-threshold";
        }
        const closest = match || closestForDebug;
        matchDetails.push({
          gpId: null,
          gpName: "",
          personaName: worker.name,
          matched: false,
          similarity: match?.similarity ?? 0,
          changes: {},
          reason,
          closestGpName: closest?.gamePresenter.name,
          closestGpTeam: closest?.gamePresenter.teamId,
          closestSimilarity: closest?.similarity,
        });
      }
    }

    const status: "success" | "partial" | "failed" = unmatched > 0 ? "partial" : "success";

    if (logRow) {
      await tryLog(
        () => db.updateSyncLog(logRow.id, {
          status,
          totalWorkers: result.workers.length,
          matched,
          unmatched,
          completedAt: new Date(),
        }),
        "updateSyncLog (success path) failed",
      );
    }

    return {
      matched,
      unmatched,
      totalPersonaWorkers: result.workers.length,
      matchDetails,
      status,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    log.error("Persona sync failed", error instanceof Error ? error : new Error(errMessage), { teamId: opts.teamId });
    if (logRow) {
      await tryLog(
        () => db.updateSyncLog(logRow.id, {
          status: "failed",
          errorMessage: errMessage,
          completedAt: new Date(),
        }),
        "updateSyncLog (catch path) failed",
      );
    }
    throw error;
  }
}

const monthYear = z.object({
  teamId: z.number().positive(),
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(2100),
});

export const personaSyncRouter = router({
  syncTeam: protectedProcedure
    .input(monthYear)
    .mutation(async ({ ctx, input }) => {
      const team = await db.getFmTeamById(input.teamId);
      if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      if (ctx.user.role !== "admin" && team.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      try {
        const result = await runPersonaSyncForTeam({
          teamId: input.teamId,
          month: input.month,
          year: input.year,
          triggeredById: ctx.user.id,
          source: "manual",
        });
        if (result.status === "failed") {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Sync failed" });
        }
        return { success: true, ...result, month: input.month, year: input.year };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Sync failed",
        });
      }
    }),

  /**
   * Dry-run Persona scrape: returns a `matchDetails` array describing
   * exactly what would change, without touching the DB.
   */
  previewSync: protectedProcedure
    .input(monthYear)
    .mutation(async ({ ctx, input }) => {
      const team = await db.getFmTeamById(input.teamId);
      if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      if (ctx.user.role !== "admin" && team.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const result = await runPersonaSyncForTeam({
        teamId: input.teamId,
        month: input.month,
        year: input.year,
        triggeredById: ctx.user.id,
        source: "manual",
        dryRun: true,
      });
      return { ...result, month: input.month, year: input.year };
    }),

  /** Last sync attempt (any status) for a team — drives the "Last synced X minutes ago" label. */
  lastSync: protectedProcedure
    .input(z.object({ teamId: z.number().positive() }))
    .query(async ({ ctx, input }) => {
      const team = await db.getFmTeamById(input.teamId);
      if (!team) return null;
      if (ctx.user.role !== "admin" && team.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return db.getLastSyncForTeam(input.teamId);
    }),

  /** Recent sync history for a team — admin/FM can audit failures. */
  history: protectedProcedure
    .input(z.object({ teamId: z.number().positive(), limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const team = await db.getFmTeamById(input.teamId);
      if (!team) return [];
      if (ctx.user.role !== "admin" && team.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return db.getRecentSyncsForTeam(input.teamId, input.limit);
    }),

  setProjectId: adminProcedure
    .input(z.object({ teamId: z.number().positive(), personaProjectId: z.number().nullable() }))
    .mutation(async ({ input }) => {
      const team = await db.getFmTeamById(input.teamId);
      if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      await db.updateFmTeam(input.teamId, { personaProjectId: input.personaProjectId ?? undefined });
      return { success: true };
    }),

  getTeamsWithProjectIds: protectedProcedure.query(async ({ ctx }) => {
    const teams = ctx.user.role === "admin"
      ? await db.getAllFmTeams()
      : await db.getFmTeamsByUser(ctx.user.id);
    // Pull last sync per team in parallel so the UI can show freshness.
    const lastSyncs = await Promise.all(teams.map(t => db.getLastSyncForTeam(t.id)));
    return teams.map((t, i) => ({
      id: t.id,
      teamName: t.teamName,
      personaProjectId: (t as any).personaProjectId as number | null,
      lastSync: lastSyncs[i]
        ? {
            startedAt: lastSyncs[i]!.startedAt,
            status: lastSyncs[i]!.status,
            matched: lastSyncs[i]!.matched,
            unmatched: lastSyncs[i]!.unmatched,
            month: lastSyncs[i]!.month,
            year: lastSyncs[i]!.year,
            source: lastSyncs[i]!.source,
          }
        : null,
    }));
  }),

  /**
   * Sync every team the caller can see, sequentially, in one round-trip.
   *
   * The Persona admin UX previously forced the FM to:
   *   1. Pick a team
   *   2. Click Sync
   *   3. Wait for it to finish
   *   4. Repeat for the next team
   * — with five teams that's five separate user actions per month. This
   * procedure runs them all in one go and returns a per-team result so
   * the UI can render a single "Sync All" button and show what
   * succeeded/failed for each team in one place.
   *
   * Sequential rather than parallel because each Persona session is a
   * stateful Puppeteer browser session; running them in parallel would
   * fight over the single browser instance.
   */
  syncAllTeams: protectedProcedure
    .input(z.object({ month: z.number().min(1).max(12), year: z.number().min(2020).max(2030) }))
    .mutation(async ({ ctx, input }) => {
      const allTeams = await db.getAllFmTeams();
      const teams = ctx.user.role === "admin"
        ? allTeams
        : allTeams.filter(t => t.userId === ctx.user.id);

      const results: Array<{
        teamId: number;
        teamName: string;
        status: "success" | "partial" | "failed";
        matched: number;
        unmatched: number;
        error?: string;
      }> = [];

      for (const team of teams) {
        try {
          const r = await runPersonaSyncForTeam({
            teamId: team.id,
            month: input.month,
            year: input.year,
            triggeredById: ctx.user.id,
            source: "manual",
          });
          results.push({
            teamId: team.id,
            teamName: team.teamName,
            status: r.status,
            matched: r.matched,
            unmatched: r.unmatched,
            error: r.error,
          });
        } catch (e) {
          results.push({
            teamId: team.id,
            teamName: team.teamName,
            status: "failed",
            matched: 0,
            unmatched: 0,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const totalMatched = results.reduce((s, r) => s + r.matched, 0);
      const totalUnmatched = results.reduce((s, r) => s + r.unmatched, 0);
      const failed = results.filter(r => r.status === "failed").length;

      return {
        results,
        month: input.month,
        year: input.year,
        totals: { teams: results.length, matched: totalMatched, unmatched: totalUnmatched, failed },
      };
    }),
});
