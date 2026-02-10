import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

const bootTimestamp = Date.now();

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative").optional(),
      })
    )
    .query(({ input }) => {
      const now = Date.now();
      const uptimeMs = Math.max(0, now - bootTimestamp);

      return {
        ok: true,
        timestamp: now,
        uptimeMs,
        environment: process.env.NODE_ENV ?? "development",
        version: process.env.npm_package_version ?? "unknown",
        clientLatencyMs:
          typeof input.timestamp === "number"
            ? Math.max(0, now - input.timestamp)
            : null,
      } as const;
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
