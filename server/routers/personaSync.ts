import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import * as db from "../db";
import { runPersonaSync } from "../services/personaSyncService";
import { testPersonaConnection } from "../services/personaScraper";

/**
 * Persona HR sync — attendance (sick leaves, missed days, late arrivals,
 * extra shifts) pulled straight from persona.fujitsu.ee into each GP's
 * monthly attendance row. Company-wide: workers are matched against the
 * whole roster (learned alias first, then the global fuzzy matcher).
 * Admin-only: it both reads HR data and overwrites attendance.
 */
export const personaSyncRouter = router({
  /** Step-by-step connection probe (auth + schedule page), no writes. */
  testConnection: adminProcedure.mutation(async () => {
    return testPersonaConnection();
  }),

  /** Scrape the month and write attendance for every matched worker. */
  syncNow: adminProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
    }))
    .mutation(async ({ ctx, input }) => {
      return runPersonaSync({
        month: input.month,
        year: input.year,
        trigger: "manual",
        triggeredById: ctx.user.id,
      });
    }),

  /**
   * Apply attendance for workers the matcher couldn't resolve: the admin
   * picks the right GP per worker; we write the counts AND learn the
   * alias so the same name auto-resolves on every future sync.
   */
  applyMapped: adminProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
      rows: z.array(z.object({
        workerName: z.string().min(1).max(255),
        gamePresenterId: z.number().int().positive(),
        sickLeaves: z.number().int().min(0).max(31),
        missedDays: z.number().int().min(0).max(31),
        lateToWork: z.number().int().min(0).max(31),
        extraShifts: z.number().int().min(0).max(31),
      })).min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      let applied = 0;
      const errors: Array<{ workerName: string; error: string }> = [];
      for (const row of input.rows) {
        try {
          const gp = await db.getGamePresenterById(row.gamePresenterId);
          if (!gp) throw new TRPCError({ code: "NOT_FOUND", message: `GP ${row.gamePresenterId} not found` });
          await db.applyPersonaAttendance(gp.id, input.month, input.year, {
            sickLeaves: row.sickLeaves,
            missedDays: row.missedDays,
            lateToWork: row.lateToWork,
            extraShifts: row.extraShifts,
          });
          await db.upsertPersonaAlias(row.workerName, gp.id, ctx.user.id);
          applied++;
        } catch (e) {
          errors.push({ workerName: row.workerName, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return { applied, errors };
    }),

  /** Top fuzzy candidates for an unmatched worker name (any threshold). */
  suggestMatches: adminProcedure
    .input(z.object({ name: z.string().min(1).max(255), limit: z.number().int().min(1).max(20).optional() }))
    .query(async ({ input }) => {
      const limit = input.limit ?? 5;
      const gps = await db.getAllGamePresenters();
      return gps
        .map(gp => {
          const stage = db.nameMatchScore(input.name, gp.name);
          const real = gp.realName ? db.nameMatchScore(input.name, gp.realName) : 0;
          return { id: gp.id, name: gp.name, realName: gp.realName ?? null, score: Math.max(stage, real) };
        })
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }),

  /** Recent sync runs for the history panel. */
  history: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ input }) => db.listPersonaSyncLogs(input?.limit ?? 20)),

  /** Learned worker-name → GP aliases. */
  aliases: adminProcedure.query(async () => db.listPersonaAliases()),

  addAlias: adminProcedure
    .input(z.object({ name: z.string().min(1).max(255), gamePresenterId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const gp = await db.getGamePresenterById(input.gamePresenterId);
      if (!gp) throw new TRPCError({ code: "NOT_FOUND", message: "Game presenter not found" });
      await db.upsertPersonaAlias(input.name, input.gamePresenterId, ctx.user.id);
      return { success: true };
    }),

  removeAlias: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.deletePersonaAlias(input.id);
      return { success: true };
    }),
});
