import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { nanoid } from "nanoid";

export const invitationRouter = router({
  // Create new invitation
  create: adminProcedure
    .input(z.object({
      email: z.string().email(),
      teamId: z.number().optional(),
      role: z.enum(['user', 'admin']).default('user'),
      expiresInDays: z.number().min(1).max(30).default(7),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if invitation already exists for this email
      const existing = await db.getInvitationByEmail(input.email);
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'An active invitation already exists for this email' });
      }
      
      const token = nanoid(32);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
      
      const invitation = await db.createInvitation({
        email: input.email.toLowerCase(),
        token,
        teamId: input.teamId || null,
        role: input.role,
        status: 'pending',
        expiresAt,
        createdById: ctx.user.id,
      });
      
      return invitation;
    }),

  // List all invitations
  list: adminProcedure.query(async () => {
    // First expire old invitations
    await db.expireOldInvitations();
    return await db.getAllInvitations();
  }),

  // Get invitation stats
  stats: adminProcedure.query(async () => {
    await db.expireOldInvitations();
    return await db.getInvitationStats();
  }),

  // Revoke invitation
  revoke: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.updateInvitationStatus(input.id, 'revoked');
      return { success: true };
    }),

  // Delete invitation
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteInvitation(input.id);
      return { success: true };
    }),

  // Resend invitation (create new token)
  resend: adminProcedure
    .input(z.object({
      id: z.number(),
      expiresInDays: z.number().min(1).max(30).default(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const invitations = await db.getAllInvitations();
      const existing = invitations.find(i => i.id === input.id);
      
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
      }
      
      // Delete old invitation
      await db.deleteInvitation(input.id);
      
      // Create new one with same details
      const token = nanoid(32);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
      
      const newInvitation = await db.createInvitation({
        email: existing.email,
        token,
        teamId: existing.teamId,
        role: existing.role,
        status: 'pending',
        expiresAt,
        createdById: ctx.user.id,
      });
      
      return newInvitation;
    }),

  // Validate invitation token (public)
  validate: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const invitation = await db.getInvitationByToken(input.token);
      
      if (!invitation) {
        return { valid: false, reason: 'Invitation not found' };
      }
      
      if (invitation.status === 'accepted') {
        return { valid: false, reason: 'Invitation already used' };
      }
      
      if (invitation.status === 'revoked') {
        return { valid: false, reason: 'Invitation has been revoked' };
      }
      
      if (invitation.status === 'expired' || invitation.expiresAt < new Date()) {
        return { valid: false, reason: 'Invitation has expired' };
      }
      
      // Get team info
      const team = invitation.teamId ? await db.getFmTeamById(invitation.teamId) : null;
      
      return {
        valid: true,
        invitation: {
          email: invitation.email,
          role: invitation.role,
          teamId: invitation.teamId,
          teamName: team?.teamName || null,
          expiresAt: invitation.expiresAt,
        },
      };
    }),

  // Accept invitation (called after OAuth login)
  accept: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await db.getInvitationByToken(input.token);
      
      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
      }
      
      if (invitation.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation is no longer valid' });
      }
      
      if (invitation.expiresAt < new Date()) {
        await db.updateInvitationStatus(invitation.id, 'expired');
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation has expired' });
      }
      
      // Check if email matches (optional - can be removed for flexibility)
      // if (ctx.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      //   throw new Error('Email does not match invitation');
      // }
      
      // Update user with team and role from invitation
      await db.updateUserFromInvitation(ctx.user.id, invitation.teamId, invitation.role);
      
      // Mark invitation as accepted
      await db.updateInvitationStatus(invitation.id, 'accepted', ctx.user.id);
      
      return { success: true };
    }),

  // Bulk create invitations
  bulkCreate: adminProcedure
    .input(z.object({
      emails: z.array(z.string().email()),
      teamId: z.number().optional(),
      role: z.enum(['user', 'admin']).default('user'),
      expiresInDays: z.number().min(1).max(30).default(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const results: { email: string; success: boolean; error?: string; token?: string }[] = [];
      
      for (const email of input.emails) {
        try {
          // Check if invitation already exists
          const existing = await db.getInvitationByEmail(email);
          if (existing) {
            results.push({ email, success: false, error: 'Invitation already exists' });
            continue;
          }
          
          const token = nanoid(32);
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
          
          await db.createInvitation({
            email: email.toLowerCase(),
            token,
            teamId: input.teamId || null,
            role: input.role,
            status: 'pending',
            expiresAt,
            createdById: ctx.user.id,
          });
          
          results.push({ email, success: true, token });
        } catch (error: any) {
          results.push({ email, success: false, error: error.message });
        }
      }
      
      return {
        total: input.emails.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      };
    }),
});
