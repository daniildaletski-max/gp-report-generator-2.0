/**
 * Persona Sync Router
 * Provides tRPC procedures for syncing attendance data from Persona HR system.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../_core/trpc';
import * as db from '../db';
import { syncPersonaAttendance } from '../services/personaScraper';

export const personaSyncRouter = router({
  /**
   * Sync attendance data from Persona for a specific team and month.
   * Matches Persona workers to GPs by name and updates their attendance records.
   */
  syncTeam: protectedProcedure
    .input(z.object({
      teamId: z.number().positive(),
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify team ownership
      const team = await db.getFmTeamById(input.teamId);
      if (!team) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
      }
      if (ctx.user.role !== 'admin' && team.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const projectId = (team as any).personaProjectId as number | null;

      // Sync from Persona
      const result = await syncPersonaAttendance(input.month, input.year, projectId);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to sync from Persona',
        });
      }

      // Get GPs for this team
      const teamWithGPs = await db.getTeamWithGPs(input.teamId);
      const gps = teamWithGPs?.gamePresenters || [];

      // Match Persona workers to GPs by name (case-insensitive, partial match)
      let matched = 0;
      let unmatched = 0;
      const matchDetails: Array<{ gpName: string; personaName: string; matched: boolean }> = [];

      for (const worker of result.workers) {
        // Only process workers with actual absences
        if (worker.sickLeaves === 0 && worker.missedDays === 0 && worker.extraShifts === 0) {
          continue;
        }

        // Try to find matching GP
        const workerNameLower = worker.name.toLowerCase();
        const matchedGP = gps.find(gp => {
          const gpNameLower = gp.name.toLowerCase();
          // Exact match or one name contains the other
          return gpNameLower === workerNameLower ||
            gpNameLower.includes(workerNameLower) ||
            workerNameLower.includes(gpNameLower) ||
            // Try matching by last name
            gpNameLower.split(' ').some(part => workerNameLower.split(' ').includes(part) && part.length > 2);
        });

        if (matchedGP) {
          // Update attendance record
          const attendance = await db.getOrCreateAttendance(matchedGP.id, input.month, input.year);
          await db.updateAttendance(attendance.id, {
            sickLeaves: worker.sickLeaves,
            missedDays: worker.missedDays,
            extraShifts: worker.extraShifts,
          });
          matched++;
          matchDetails.push({ gpName: matchedGP.name, personaName: worker.name, matched: true });
        } else {
          unmatched++;
          matchDetails.push({ gpName: '', personaName: worker.name, matched: false });
        }
      }

      return {
        success: true,
        matched,
        unmatched,
        totalPersonaWorkers: result.workers.length,
        matchDetails,
        month: input.month,
        year: input.year,
      };
    }),

  /**
   * Preview Persona data without saving - shows what would be synced.
   */
  previewSync: protectedProcedure
    .input(z.object({
      teamId: z.number().positive(),
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
    }))
    .query(async ({ ctx, input }) => {
      const team = await db.getFmTeamById(input.teamId);
      if (!team) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
      }
      if (ctx.user.role !== 'admin' && team.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const projectId = (team as any).personaProjectId as number | null;
      const result = await syncPersonaAttendance(input.month, input.year, projectId);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to fetch from Persona',
        });
      }

      // Filter to workers with absences
      const workersWithAbsences = result.workers.filter(
        w => w.sickLeaves > 0 || w.missedDays > 0 || w.extraShifts > 0
      );

      return {
        workers: workersWithAbsences,
        totalWorkers: result.workers.length,
        month: result.month,
        year: result.year,
      };
    }),

  /**
   * Update team's Persona project ID (admin only).
   */
  setProjectId: adminProcedure
    .input(z.object({
      teamId: z.number().positive(),
      personaProjectId: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      const team = await db.getFmTeamById(input.teamId);
      if (!team) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
      }
      await db.updateFmTeam(input.teamId, { personaProjectId: input.personaProjectId ?? undefined });
      return { success: true };
    }),

  /**
   * Get all teams with their Persona project IDs.
   */
  getTeamsWithProjectIds: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'admin') {
      const teams = await db.getFmTeamsByUser(ctx.user.id);
      return teams.map(t => ({
        id: t.id,
        teamName: t.teamName,
        personaProjectId: (t as any).personaProjectId as number | null,
      }));
    }
    const teams = await db.getAllFmTeams();
    return teams.map(t => ({
      id: t.id,
      teamName: t.teamName,
      personaProjectId: (t as any).personaProjectId as number | null,
    }));
  }),
});
