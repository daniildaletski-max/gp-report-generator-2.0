import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";

export const userRouter = router({
  // Get current user with team info
  me: protectedProcedure.query(async ({ ctx }) => {
    const userWithTeam = await db.getUserWithTeam(ctx.user.id);
    return userWithTeam;
  }),

  updateEmail: protectedProcedure
    .input(z.object({ email: z.string().trim().email() }))
    .mutation(async ({ ctx, input }) => {
      await db.updateUserEmail(ctx.user.id, input.email);
      return { success: true, email: input.email };
    }),

  // List all users (admin only)
  list: adminProcedure.query(async () => {
    return await db.getAllUsers();
  }),

  // Assign user to team (admin only)
  assignToTeam: adminProcedure
    .input(z.object({
      userId: z.number(),
      teamId: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      await db.updateUserTeam(input.userId, input.teamId);
      return { success: true };
    }),

  // Update user role (admin only)
  updateRole: adminProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(['user', 'admin']),
    }))
    .mutation(async ({ input }) => {
      await db.updateUserRole(input.userId, input.role);
      return { success: true };
    }),

  // Delete user (admin only)
  delete: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent admin from deleting themselves
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete your own account' });
      }
      await db.deleteUser(input.userId);
      return { success: true };
    }),
});
