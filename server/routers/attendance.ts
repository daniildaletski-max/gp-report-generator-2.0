import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { isTechnicalError, dedupeErrorDetails } from "@shared/errorClassification";

export const attendanceRouter = router({
  // Get or create attendance record for a GP in a specific month
  getOrCreate: protectedProcedure
    .input(z.object({
      gpId: z.number().positive(),
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
    }))
    .query(async ({ ctx, input }) => {
      // Verify GP ownership
      const gp = await db.getGamePresenterById(input.gpId);
      if (!gp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
      if (ctx.user.role !== 'admin' && gp.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      return await db.getOrCreateAttendance(input.gpId, input.month, input.year);
    }),

  // Update attendance metrics for a GP
  update: protectedProcedure
    .input(z.object({
      gpId: z.number().positive(),
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
      extraShifts: z.number().min(0).optional(),
      lateToWork: z.number().min(0).optional(),
      missedDays: z.number().min(0).optional(),
      sickLeaves: z.number().min(0).optional(),
      remarks: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify GP ownership
      const gp = await db.getGamePresenterById(input.gpId);
      if (!gp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
      if (ctx.user.role !== 'admin' && gp.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const attendance = await db.getOrCreateAttendance(input.gpId, input.month, input.year);
      const { gpId, month, year, ...data } = input;
      await db.updateAttendance(attendance.id, data);
      return { success: true };
    }),

  // Bulk update attendance for multiple GPs in a team
  bulkUpdate: protectedProcedure
    .input(z.object({
      teamId: z.number().positive(),
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
      updates: z.array(z.object({
        gpId: z.number().positive(),
        extraShifts: z.number().min(0).optional(),
        lateToWork: z.number().min(0).optional(),
        missedDays: z.number().min(0).optional(),
        sickLeaves: z.number().min(0).optional(),
        remarks: z.string().max(2000).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify team ownership
      if (ctx.user.role !== 'admin') {
        const team = await db.getFmTeamById(input.teamId);
        if (!team || team.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }

      let updated = 0;
      for (const update of input.updates) {
        const attendance = await db.getOrCreateAttendance(update.gpId, input.month, input.year);
        const { gpId, ...data } = update;
        await db.updateAttendance(attendance.id, data);
        updated++;
      }

      return { success: true, updated };
    }),

  // Get attendance summary for a team in a specific month
  teamSummary: protectedProcedure
    .input(z.object({
      teamId: z.number().positive(),
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
    }))
    .query(async ({ ctx, input }) => {
      // Verify team ownership
      if (ctx.user.role !== 'admin') {
        const team = await db.getFmTeamById(input.teamId);
        if (!team || team.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }

      const data = await db.getAttendanceByTeamMonth(input.teamId, input.month, input.year);

      // ========================================================
      // Filtered mistake count — single source of truth for both
      // Attendance and the GP Portal. The raw `monthlyGpStats.mistakes`
      // includes technical / TV / SYS errors, but the GP Portal
      // explicitly hides those (see gpAccess.getEvaluationsByToken).
      // Without this re-count the per-row Mistakes column shows a
      // bigger number than the GP themselves see in their portal —
      // confusing for both sides. We re-compute the same way:
      //   1. Pull error screenshots + Excel-imported gpErrors for the
      //      month.
      //   2. Drop technical errors (`isTechnicalError`).
      //   3. Dedupe cross-source pairs (`dedupeErrorDetails`).
      //   4. Count.
      //
      // PERF: previously this fired one query per GP for both
      // gpErrors AND error screenshots — N+1 of full-month scans.
      // Now we batch via two month-wide grouped queries (one for
      // each table) and group by gpId in memory before scoring.
      // ========================================================
      const gpIds = data.map(d => d.gamePresenter.id);
      const filteredByGp = new Map<number, number>();
      try {
        const [gpErrorsByGp, screenshotsByGp] = await Promise.all([
          db.getGpErrorsByMonthGroupedByGpId(gpIds, input.month, input.year),
          db.getErrorScreenshotsByMonthGroupedByGpId(gpIds, input.month, input.year),
        ]);
        for (const item of data) {
          const gpId = item.gamePresenter.id;
          const screenshotsRaw = screenshotsByGp.get(gpId) ?? [];
          const gpErrorsRaw = gpErrorsByGp.get(gpId) ?? [];
          const screenshots = screenshotsRaw.filter(e => !isTechnicalError({
            errorType: e.errorType,
            errorCategory: e.errorCategory,
            errorDescription: e.errorDescription,
          }));
          const gpErrs = gpErrorsRaw.filter(e => !isTechnicalError({
            errorCode: e.errorCode,
            errorDescription: e.errorDescription,
          }));
          const merged = [
            ...screenshots.map(e => ({
              id: e.id,
              source: 'screenshot' as const,
              errorType: e.errorType,
              errorDescription: e.errorDescription,
              tableId: e.tableId,
              errorDate: (e as any).errorDate ?? null,
              createdAt: e.createdAt,
            })),
            ...gpErrs.map(e => ({
              id: `excel-${e.id}`,
              source: 'excel' as const,
              errorType: e.errorCode || 'excel_error',
              errorDescription: e.errorDescription,
              tableId: e.tableId,
              errorDate: e.errorDate,
              createdAt: e.createdAt,
            })),
          ];
          filteredByGp.set(gpId, dedupeErrorDetails(merged).length);
        }
      } catch {
        // Best-effort: if the batch query throws, fall back to the
        // raw stats column rather than killing the whole request.
        // Next refresh retries.
        for (const item of data) {
          filteredByGp.set(
            item.gamePresenter.id,
            item.monthlyStats?.mistakes ?? item.attendance?.mistakes ?? 0,
          );
        }
      }

      // Attach filteredMistakes per row + use it in totals.
      const items = data.map(item => ({
        ...item,
        filteredMistakes: filteredByGp.get(item.gamePresenter.id) ?? 0,
      }));

      const totals = items.reduce((acc, item) => ({
        mistakes: acc.mistakes + item.filteredMistakes,
        extraShifts: acc.extraShifts + (item.attendance?.extraShifts ?? 0),
        lateToWork: acc.lateToWork + (item.attendance?.lateToWork ?? 0),
        missedDays: acc.missedDays + (item.attendance?.missedDays ?? 0),
        sickLeaves: acc.sickLeaves + (item.attendance?.sickLeaves ?? 0),
      }), { mistakes: 0, extraShifts: 0, lateToWork: 0, missedDays: 0, sickLeaves: 0 });

      return { items, totals, gpCount: items.length };
    }),

  // Get attendance trends for a team across multiple months
  trends: protectedProcedure
    .input(z.object({
      teamId: z.number().positive(),
      months: z.number().min(2).max(12).optional().default(6),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        const team = await db.getFmTeamById(input.teamId);
        if (!team || team.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }
      return await db.getAttendanceTrends(input.teamId, input.months);
    }),
});
