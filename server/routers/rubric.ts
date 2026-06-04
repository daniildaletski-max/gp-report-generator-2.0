/**
 * Rubric router — read + author the versioned scoring rubric.
 *
 * Reads are available to any signed-in user (the client / exporters can
 * resolve the active rubric or a specific version). Authoring (create a
 * new version, switch the active one) is admin-only — a new version is an
 * immutable snapshot, so changing the rubric never rewrites past scores.
 */
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { validateRubricDraft } from "@shared/scoring";

const criterionDraftSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  maxScore: z.number().int().min(1).max(100),
  group: z.enum(["appearance", "game"]),
  sortOrder: z.number().int().min(0).optional(),
});

export const rubricRouter = router({
  /** The rubric version new evaluations are scored under. */
  getActive: protectedProcedure.query(() => db.getActiveRubricVersion()),

  /** All versions of the default rubric (newest first). */
  listVersions: protectedProcedure.query(() => db.listRubricVersions()),

  /** A specific version (the value stored on each evaluation). */
  getVersion: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .query(({ input }) => db.getRubricVersionById(input.id)),

  /** Create a new immutable version. Admin only. */
  createVersion: adminProcedure
    .input(
      z.object({
        label: z.string().min(1).max(255),
        criteria: z.array(criterionDraftSchema).min(1),
        activate: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const issues = validateRubricDraft(input.criteria);
      if (issues.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: issues.map((i) => i.message).join(" ") });
      }
      return await db.createRubricVersion({
        label: input.label,
        criteria: input.criteria,
        activate: input.activate,
        createdById: ctx.user.id,
      });
    }),

  /** Switch the active version. Admin only. */
  activateVersion: adminProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ input }) => {
      const result = await db.setActiveRubricVersion(input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Rubric version not found" });
      return result;
    }),
});
