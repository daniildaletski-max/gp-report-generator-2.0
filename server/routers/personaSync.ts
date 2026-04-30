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
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import * as db from "../db";
import { syncPersonaAttendance } from "../services/personaScraper";
import { createLogger } from "../services/logger";

const log = createLogger("PersonaSync");

interface MatchDetail {
  gpId: number | null;
  gpName: string;
  personaName: string;
  matched: boolean;
  similarity: number;
  changes: { sickLeaves?: { from: number; to: number }; missedDays?: { from: number; to: number }; extraShifts?: { from: number; to: number } };
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
  const logRow = opts.dryRun
    ? null
    : await db.createSyncLog({
        teamId: opts.teamId,
        triggeredById: opts.triggeredById,
        source: opts.source,
        month: opts.month,
        year: opts.year,
        status: "failed", // updated below on success
        totalWorkers: 0,
        matched: 0,
        unmatched: 0,
      });

  try {
    const projectId = (team as any).personaProjectId as number | null;
    const result = await syncPersonaAttendance(opts.month, opts.year, projectId);

    if (!result.success) {
      if (logRow) {
        await db.updateSyncLog(logRow.id, {
          status: "failed",
          errorMessage: result.error || "Persona scrape returned success=false",
          completedAt: new Date(),
        });
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
      // Skip workers with no recorded attendance changes — we don't
      // want to overwrite manually-edited rows with zeros.
      if (worker.sickLeaves === 0 && worker.missedDays === 0 && worker.extraShifts === 0) {
        continue;
      }

      // Use the same fuzzy matcher the rest of the app uses.
      // Threshold 0.7 mirrors what evaluation upload uses.
      const match = userId
        ? await db.findBestMatchingGPByUser(worker.name, userId, 0.7)
        : await db.findBestMatchingGP(worker.name, 0.7);

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
        matchDetails.push({
          gpId: null,
          gpName: "",
          personaName: worker.name,
          matched: false,
          similarity: match?.similarity ?? 0,
          changes: {},
        });
      }
    }

    const status: "success" | "partial" | "failed" = unmatched > 0 ? "partial" : "success";

    if (logRow) {
      await db.updateSyncLog(logRow.id, {
        status,
        totalWorkers: result.workers.length,
        matched,
        unmatched,
        completedAt: new Date(),
      });
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
      await db.updateSyncLog(logRow.id, {
        status: "failed",
        errorMessage: errMessage,
        completedAt: new Date(),
      });
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
});
