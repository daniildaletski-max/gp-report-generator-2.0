import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";

export const fmTeamRouter = router({
  // List teams - for non-admin shows only their own teams, for admin shows all
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === 'admin') {
      return await db.getAllFmTeams();
    }
    // User sees only teams they created
    return await db.getFmTeamsByUser(ctx.user.id);
  }),

  // List all teams with stats (admin only)
  listWithStats: adminProcedure.query(async () => {
    return await db.getAllTeamsWithStats();
  }),

  // Get team details with users (admin only)
  getWithUsers: adminProcedure
    .input(z.object({ teamId: z.number() }))
    .query(async ({ input }) => {
      return await db.getTeamWithUsers(input.teamId);
    }),
  
  // Initialize default teams (admin only)
  initialize: adminProcedure.mutation(async () => {
    await db.initializeDefaultTeams();
    return { success: true };
  }),

  // Create new team - any authenticated user can create their own team
  create: protectedProcedure
    .input(z.object({
      teamName: z.string().min(1),
      floorManagerName: z.string().min(1),
      // Optional direct email for the FM. When set, Team Monthly
      // Overview reports go straight to this address — bypassing the
      // user-link lookup so admins can route to FMs that don't have
      // a `users` row yet. Empty string is treated as null.
      managerEmail: z.string().email().optional().or(z.literal("")),
    }))
    .mutation(async ({ ctx, input }) => {
      const { managerEmail, ...rest } = input;
      const team = await db.createFmTeam({
        ...rest,
        managerEmail: managerEmail ? managerEmail : null,
        userId: ctx.user.id,
      });
      return team;
    }),

  // Update team - users can update their own teams, admin can update any
  update: protectedProcedure
    .input(z.object({
      teamId: z.number(),
      teamName: z.string().min(1).optional(),
      floorManagerName: z.string().min(1).optional(),
      // Pass empty string to clear; omit to leave unchanged.
      managerEmail: z.string().email().optional().or(z.literal("")),
      gpIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership for non-admin users
      if (ctx.user.role !== 'admin') {
        const team = await db.getFmTeamById(input.teamId);
        if (!team || team.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only update your own teams' });
        }
      }
      const { teamId, gpIds, managerEmail, ...rest } = input;
      // Empty string from the form → clear the override (NULL in DB).
      const data: Record<string, unknown> = { ...rest };
      if (managerEmail !== undefined) {
        data.managerEmail = managerEmail === "" ? null : managerEmail;
      }
      if (gpIds !== undefined) {
        await db.updateTeamWithGPs(teamId, data, gpIds);
      } else {
        await db.updateFmTeam(teamId, data);
      }
      return { success: true };
    }),

  // Delete team - users can delete their own teams, admin can delete any
  delete: protectedProcedure
    .input(z.object({ teamId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership for non-admin users
      if (ctx.user.role !== 'admin') {
        const team = await db.getFmTeamById(input.teamId);
        if (!team || team.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only delete your own teams' });
        }
      }
      await db.deleteFmTeam(input.teamId);
      return { success: true };
    }),

  // Get team with GPs - users see their own, admin sees all
  getWithGPs: protectedProcedure
    .input(z.object({ teamId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        const team = await db.getFmTeamById(input.teamId);
        if (!team || team.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only view your own teams' });
        }
      }
      return await db.getTeamWithGPs(input.teamId);
    }),

  // List teams with GPs - users see their own, admin sees all
  listWithGPs: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'admin') {
      return await db.getTeamsWithGPsByUser(ctx.user.id);
    }
    return await db.getAllTeamsWithGPs();
  }),

  // Assign GPs to team - users can assign to their own teams
  assignGPs: protectedProcedure
    .input(z.object({
      teamId: z.number(),
      gpIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        const team = await db.getFmTeamById(input.teamId);
        if (!team || team.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only assign GPs to your own teams' });
        }
        // Verify GP ownership
        const verification = await db.verifyGpOwnershipByUser(input.gpIds, ctx.user.id);
        if (!verification.valid) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only assign your own GPs' });
        }
      }
      return await db.assignGPsToTeam(input.gpIds, input.teamId);
    }),

  // Remove GPs from team - users can remove from their own teams
  removeGPs: protectedProcedure
    .input(z.object({
      gpIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        const verification = await db.verifyGpOwnershipByUser(input.gpIds, ctx.user.id);
        if (!verification.valid) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only remove your own GPs from teams' });
        }
      }
      return await db.removeGPsFromTeam(input.gpIds);
    }),

  // Get unassigned GPs - users see their own unassigned GPs
  getUnassignedGPs: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'admin') {
      return await db.getUnassignedGPsByUser(ctx.user.id);
    }
    return await db.getUnassignedGPs();
  }),
});
