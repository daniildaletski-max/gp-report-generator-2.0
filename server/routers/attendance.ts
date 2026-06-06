import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";

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

      const attendance = await db.getOrCreateAttendance(input.gpId, input.month, input.year);
      const { gpId, month, year, ...data } = input;
      await db.updateAttendance(attendance.id, data);
      return { success: true };
    }),

  // Bulk update attendance for multiple GPs
  bulkUpdate: protectedProcedure
    .input(z.object({
      teamId: z.number().positive().optional(),
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
      let updated = 0;
      for (const update of input.updates) {
        const attendance = await db.getOrCreateAttendance(update.gpId, input.month, input.year);
        const { gpId, ...data } = update;
        await db.updateAttendance(attendance.id, data);
        updated++;
      }

      return { success: true, updated };
    }),

  // Get attendance summary in a specific month (whole company, or one
  // legacy team if a teamId is still supplied).
  teamSummary: protectedProcedure
    .input(z.object({
      teamId: z.number().positive().optional(),
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
    }))
    .query(async ({ input }) => {
      const data = await db.getAttendanceByTeamMonth(input.teamId, input.month, input.year);

      // Mistake count is whatever is in `monthlyGpStats.mistakes`, which
      // is set directly from the "Error Count Analysis" sheet, column E,
      // at upload time. No filtering, no dedup, no cross-source merge —
      // the Excel file IS the source of truth.
      const items = data.map(item => ({
        ...item,
        filteredMistakes: item.monthlyStats?.mistakes ?? item.attendance?.mistakes ?? 0,
      }));

      const totals = items.reduce((acc, item) => ({
        mistakes: acc.mistakes + (item.monthlyStats?.mistakes ?? item.attendance?.mistakes ?? 0),
        extraShifts: acc.extraShifts + (item.attendance?.extraShifts ?? 0),
        lateToWork: acc.lateToWork + (item.attendance?.lateToWork ?? 0),
        missedDays: acc.missedDays + (item.attendance?.missedDays ?? 0),
        sickLeaves: acc.sickLeaves + (item.attendance?.sickLeaves ?? 0),
      }), { mistakes: 0, extraShifts: 0, lateToWork: 0, missedDays: 0, sickLeaves: 0 });

      return { items, totals, gpCount: items.length };
    }),

  // Get company-wide attendance trends across multiple months.
  trends: protectedProcedure
    .input(z.object({
      teamId: z.number().positive().optional(),
      months: z.number().min(2).max(12).optional().default(6),
    }))
    .query(async ({ input }) => {
      return await db.getAttendanceTrends(input.teamId, input.months);
    }),
});
