import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { generateExcelAndEmail, extractEvaluationFromImage, parseEvaluationDate, EvaluationDataSchema } from "./_shared";
import { SCORE_CONFIG } from "@shared/const";
import { publish } from "../_core/events";

export const evaluationRouter = router({
  uploadAndExtract: protectedProcedure
    .input(z.object({
      imageBase64: z.string().max(10 * 1024 * 1024), // Max 10MB base64
      filename: z.string().max(255).regex(/^[\w\-. ]+$/), // Safe filename
      mimeType: z.string().refine(m => ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(m), {
        message: 'Invalid image type. Allowed: PNG, JPEG, WebP'
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const fileKey = `evaluations/${ctx.user.id}/${nanoid()}-${db.sanitizeString(input.filename, 100)}`;
      const buffer = Buffer.from(input.imageBase64, "base64");
      const { url: imageUrl } = await storagePut(fileKey, buffer, input.mimeType);

      const extractedData = await extractEvaluationFromImage(imageUrl);
      const gp = await db.findOrCreateGamePresenter(extractedData.presenterName, undefined, ctx.user.id);
      const evalDate = parseEvaluationDate(extractedData.date);

      const evaluation = await db.createEvaluation({
        gamePresenterId: gp.id,
        evaluatorName: extractedData.evaluatorName || null,
        evaluationDate: evalDate,
        game: extractedData.game || null,
        totalScore: extractedData.totalScore || null,
        hairScore: extractedData.hair?.score || null,
        hairMaxScore: extractedData.hair?.maxScore || 3,
        hairComment: extractedData.hair?.comment || null,
        makeupScore: extractedData.makeup?.score || null,
        makeupMaxScore: extractedData.makeup?.maxScore || 3,
        makeupComment: extractedData.makeup?.comment || null,
        outfitScore: extractedData.outfit?.score || null,
        outfitMaxScore: extractedData.outfit?.maxScore || 3,
        outfitComment: extractedData.outfit?.comment || null,
        postureScore: extractedData.posture?.score || null,
        postureMaxScore: extractedData.posture?.maxScore || 3,
        postureComment: extractedData.posture?.comment || null,
        dealingStyleScore: extractedData.dealingStyle?.score || null,
        dealingStyleMaxScore: extractedData.dealingStyle?.maxScore || 5,
        dealingStyleComment: extractedData.dealingStyle?.comment || null,
        gamePerformanceScore: extractedData.gamePerformance?.score || null,
        gamePerformanceMaxScore: extractedData.gamePerformance?.maxScore || 5,
        gamePerformanceComment: extractedData.gamePerformance?.comment || null,
        screenshotUrl: imageUrl,
        screenshotKey: fileKey,
        rawExtractedData: extractedData,
        uploadedById: ctx.user.id,
        userId: ctx.user.id, // For data isolation - user sees their own uploads
      });

      // Realtime: live-update this user's open screens.
      publish({ type: "evaluations.changed", source: "upload", userId: ctx.user.id, gpId: gp.id });

      return {
        success: true,
        evaluation,
        extractedData,
        gamePresenter: gp,
      };
    }),

  /**
   * Manual evaluation entry — no screenshot required. Replaces the
   * "I have to upload a screenshot or it doesn't count" workflow with
   * a direct form. The FM picks a GP, sets per-criterion scores and
   * comments, the server computes appearance / gamePerformance / total
   * automatically.
   *
   * Idempotent at the API level only — the FM is responsible for
   * deciding whether they're double-entering. The Evaluations page
   * surfaces the full list so duplicates are easy to spot.
   */
  create: protectedProcedure
    .input(z.object({
      gamePresenterId: z.number().positive(),
      evaluatorName: z.string().max(255).optional(),
      evaluationDate: z.date(),
      game: z.string().max(100).optional(),
      hairScore: z.number().min(0).max(3).optional(),
      hairComment: z.string().max(1000).optional(),
      makeupScore: z.number().min(0).max(3).optional(),
      makeupComment: z.string().max(1000).optional(),
      outfitScore: z.number().min(0).max(3).optional(),
      outfitComment: z.string().max(1000).optional(),
      postureScore: z.number().min(0).max(3).optional(),
      postureComment: z.string().max(1000).optional(),
      dealingStyleScore: z.number().min(0).max(5).optional(),
      dealingStyleComment: z.string().max(1000).optional(),
      gamePerformanceScore: z.number().min(0).max(5).optional(),
      gamePerformanceComment: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // GP ownership — non-admin can only attach evals to their GPs.
      const gp = await db.getGamePresenterById(input.gamePresenterId);
      if (!gp) throw new TRPCError({ code: "NOT_FOUND", message: "Game Presenter not found" });
      if (ctx.user.role !== "admin" && gp.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied: cannot add evaluations to a GP you don't own" });
      }

      const {
        gamePresenterId,
        evaluatorName,
        evaluationDate,
        game,
        hairScore, hairComment,
        makeupScore, makeupComment,
        outfitScore, outfitComment,
        postureScore, postureComment,
        dealingStyleScore, dealingStyleComment,
        gamePerformanceScore, gamePerformanceComment,
      } = input;

      // Sanitize text fields and pull out clean inputs
      const cleanComment = (s?: string) => s ? db.sanitizeString(s, 1000) : null;
      const cleanName = (s?: string) => s ? db.sanitizeString(s, 255) : null;
      const cleanGame = (s?: string) => s ? db.sanitizeString(s, 100) : null;

      const evaluation = await db.createEvaluation({
        gamePresenterId,
        evaluatorName: cleanName(evaluatorName),
        evaluationDate,
        game: cleanGame(game),
        totalScore: null, // derived from sub-scores by createEvaluation
        hairScore: hairScore ?? null,
        hairMaxScore: 3,
        hairComment: cleanComment(hairComment),
        makeupScore: makeupScore ?? null,
        makeupMaxScore: 3,
        makeupComment: cleanComment(makeupComment),
        outfitScore: outfitScore ?? null,
        outfitMaxScore: 3,
        outfitComment: cleanComment(outfitComment),
        postureScore: postureScore ?? null,
        postureMaxScore: 3,
        postureComment: cleanComment(postureComment),
        dealingStyleScore: dealingStyleScore ?? null,
        dealingStyleMaxScore: 5,
        dealingStyleComment: cleanComment(dealingStyleComment),
        gamePerformanceScore: gamePerformanceScore ?? null,
        gamePerformanceMaxScore: 5,
        gamePerformanceComment: cleanComment(gamePerformanceComment),
        // appearance / gamePerformance / total are all derived inside
        // createEvaluation from the per-criterion scores above.
        rawExtractedData: { source: "manual", enteredAt: new Date().toISOString() } as any,
        uploadedById: ctx.user.id,
        userId: ctx.user.id,
      });

      publish({ type: "evaluations.changed", source: "manual", userId: ctx.user.id, gpId: evaluation.gamePresenterId });

      return { success: true, evaluation };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    // User-based data isolation: each user sees only their own data
    if (ctx.user.role !== 'admin') {
      return await db.getEvaluationsWithGPByUser(ctx.user.id);
    }
    // Admin sees all
    return await db.getEvaluationsWithGP();
  }),

  getByMonth: protectedProcedure
    .input(z.object({
      year: z.number(),
      month: z.number().min(1).max(12),
    }))
    .query(async ({ ctx, input }) => {
      // User-based data isolation
      if (ctx.user.role !== 'admin') {
        return await db.getEvaluationsByMonthAndUser(input.year, input.month, ctx.user.id);
      }
      return await db.getEvaluationsByMonth(input.year, input.month);
    }),

  /**
   * Cadence — for the Floor Manager Workspace. For each GP in the
   * team, returns:
   *  - last eval date / days-since
   *  - last total score and per-criterion sub-scores (used to pre-fill
   *    the Quick Evaluate form with sensible defaults)
   *  - per-criterion 6-eval rolling trend (used for sparklines)
   *  - "watch zone" — criteria where the average of the last 3 evals
   *    is below 70% of max, surfaced so the FM knows where to focus.
   *  - current-month attendance flags (sick / missed / late counts).
   *  - pending action-item count.
   * Read-only and team-scoped — non-admins only see their own teams.
   */
  cadence: protectedProcedure
    .input(z.object({ teamId: z.number().positive() }))
    .query(async ({ ctx, input }) => {
      // Authorize team access — FMs can only see their own.
      if (ctx.user.role !== 'admin') {
        const team = await db.getFmTeamById(input.teamId);
        if (!team || team.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }

      const gps = await db.getGamePresentersByTeam(input.teamId);
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const result = await Promise.all(gps.map(async (gp) => {
        const evals = await db.getEvaluationsByGP(gp.id);
        // Sort newest first by evaluationDate (fallback to createdAt).
        evals.sort((a, b) => {
          const ta = (a.evaluationDate ?? a.createdAt ?? new Date(0)).getTime?.() ?? 0;
          const tb = (b.evaluationDate ?? b.createdAt ?? new Date(0)).getTime?.() ?? 0;
          return tb - ta;
        });
        const last = evals[0] ?? null;
        const lastDate = last?.evaluationDate ?? last?.createdAt ?? null;
        const daysSince = lastDate ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / 86400000) : null;
        const last3 = evals.slice(0, 3);
        const avg = (key: keyof typeof evals[0]) => {
          const vals = last3.map(e => Number((e as any)[key])).filter(v => Number.isFinite(v) && v >= 0);
          if (vals.length === 0) return null;
          return vals.reduce((s, v) => s + v, 0) / vals.length;
        };
        const trends = {
          total: evals.slice(0, 6).map(e => Number(e.totalScore || 0)).reverse(),
          hair: evals.slice(0, 6).map(e => Number(e.hairScore || 0)).reverse(),
          makeup: evals.slice(0, 6).map(e => Number(e.makeupScore || 0)).reverse(),
          outfit: evals.slice(0, 6).map(e => Number(e.outfitScore || 0)).reverse(),
          posture: evals.slice(0, 6).map(e => Number(e.postureScore || 0)).reverse(),
          dealing: evals.slice(0, 6).map(e => Number(e.dealingStyleScore || 0)).reverse(),
          perf: evals.slice(0, 6).map(e => Number(e.gamePerformanceScore || 0)).reverse(),
        };
        const watchZone: Array<{ key: string; label: string; avg: number; max: number }> = [];
        const checkLow = (key: keyof typeof evals[0], label: string, max: number) => {
          const a = avg(key);
          if (a != null && a / max < 0.7) watchZone.push({ key: String(key), label, avg: Number(a.toFixed(2)), max });
        };
        checkLow("hairScore", "Hair", 3);
        checkLow("makeupScore", "Makeup", 3);
        checkLow("outfitScore", "Outfit", 3);
        checkLow("postureScore", "Posture", 3);
        checkLow("dealingStyleScore", "Dealing Style", 5);
        checkLow("gamePerformanceScore", "Game Performance", 5);

        // Attendance for current month — best-effort lookup.
        let attendance: { sick: number; missed: number; late: number; extra: number } | null = null;
        try {
          const att = await db.findAttendance(gp.id, currentMonth, currentYear);
          if (att) {
            attendance = {
              sick: att.sickLeaves ?? 0,
              missed: att.missedDays ?? 0,
              late: att.lateToWork ?? 0,
              extra: att.extraShifts ?? 0,
            };
          }
        } catch { /* swallow */ }

        // Open action items count.
        let openActions = 0;
        try {
          const items = await db.listActionItems({ gpId: gp.id });
          openActions = items.filter((i: any) => i.status === "open" || i.status === "in_progress").length;
        } catch { /* swallow */ }

        // Compute urgency tier from days-since plus eval count.
        const evalCount = evals.length;
        let urgency: "never" | "overdue" | "due-soon" | "fresh" = "fresh";
        if (evalCount === 0) urgency = "never";
        else if (daysSince != null && daysSince >= 21) urgency = "overdue";
        else if (daysSince != null && daysSince >= 14) urgency = "due-soon";

        // Smart auto-suggest — weighted average of the last 3 evals'
        // sub-scores. Most-recent eval has the highest weight, so
        // recent improvements bubble up. Confidence is derived from
        // (a) sample size (more evals = higher confidence) and (b)
        // variance (stable scores = higher confidence). FM gets a
        // pre-filled form they can confirm with one keypress.
        const suggestedScores = (() => {
          if (evals.length === 0) return null;
          const sample = evals.slice(0, 3);
          const weights = sample.length === 1 ? [1.0]
            : sample.length === 2 ? [0.65, 0.35]
            : [0.5, 0.3, 0.2];
          const weightedAvg = (key: keyof typeof evals[0]): number | null => {
            let sum = 0;
            let totalWeight = 0;
            for (let i = 0; i < sample.length; i++) {
              const v = Number((sample[i] as any)[key]);
              if (Number.isFinite(v) && v >= 0) {
                sum += v * weights[i];
                totalWeight += weights[i];
              }
            }
            if (totalWeight === 0) return null;
            return Math.round((sum / totalWeight) * 10) / 10;
          };
          // Variance across sample → low variance = high confidence.
          const variance = (key: keyof typeof evals[0]): number => {
            const vals = sample.map(e => Number((e as any)[key])).filter(v => Number.isFinite(v) && v >= 0);
            if (vals.length < 2) return 0;
            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
            return vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
          };
          const totalVariance = variance("hairScore") + variance("makeupScore") + variance("outfitScore")
            + variance("postureScore") + variance("dealingStyleScore") + variance("gamePerformanceScore");
          let confidence: "low" | "medium" | "high" = "medium";
          if (sample.length === 1) confidence = "low";
          else if (sample.length >= 3 && totalVariance < 1.5) confidence = "high";
          else if (totalVariance > 5) confidence = "low";
          return {
            hair: weightedAvg("hairScore"),
            makeup: weightedAvg("makeupScore"),
            outfit: weightedAvg("outfitScore"),
            posture: weightedAvg("postureScore"),
            dealing: weightedAvg("dealingStyleScore"),
            perf: weightedAvg("gamePerformanceScore"),
            sampleSize: sample.length,
            confidence,
          };
        })();

        return {
          gpId: gp.id,
          gpName: gp.name,
          evalCount,
          lastEvalDate: lastDate,
          daysSince,
          urgency,
          lastTotal: last?.totalScore ?? null,
          lastSubscores: last ? {
            hair: last.hairScore ?? null,
            makeup: last.makeupScore ?? null,
            outfit: last.outfitScore ?? null,
            posture: last.postureScore ?? null,
            dealing: last.dealingStyleScore ?? null,
            perf: last.gamePerformanceScore ?? null,
          } : null,
          suggestedScores,
          recentEvals: evals.slice(0, 3).map(e => ({
            id: e.id,
            date: e.evaluationDate ?? e.createdAt,
            totalScore: e.totalScore,
            evaluatorName: e.evaluatorName,
            game: e.game,
          })),
          trends,
          watchZone,
          attendance,
          openActions,
        };
      }));

      // Sort: never first (most urgent for new GPs), then overdue (longest first),
      // then due-soon, then fresh; alphabetical fallback.
      const urgencyRank: Record<string, number> = { never: 0, overdue: 1, "due-soon": 2, fresh: 3 };
      result.sort((a, b) => {
        const ua = urgencyRank[a.urgency] ?? 99;
        const ub = urgencyRank[b.urgency] ?? 99;
        if (ua !== ub) return ua - ub;
        if (a.daysSince != null && b.daysSince != null && a.daysSince !== b.daysSince) {
          return b.daysSince - a.daysSince;
        }
        return a.gpName.localeCompare(b.gpName);
      });

      return {
        teamId: input.teamId,
        gps: result,
        summary: {
          total: result.length,
          never: result.filter(r => r.urgency === "never").length,
          overdue: result.filter(r => r.urgency === "overdue").length,
          dueSoon: result.filter(r => r.urgency === "due-soon").length,
          fresh: result.filter(r => r.urgency === "fresh").length,
        },
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const evaluation = await db.getEvaluationWithGP(input.id);
      if (!evaluation) return null;
      
      // User-based data isolation: non-admin can only access their own evaluations
      if (ctx.user.role !== 'admin') {
        const evalUserId = evaluation.evaluation?.userId || evaluation.evaluation?.uploadedById;
        if (evalUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only view your own evaluations' });
        }
      }
      return evaluation;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().positive(),
      evaluatorName: z.string().max(255).optional(),
      evaluationDate: z.date().optional(),
      game: z.string().max(100).optional(),
      totalScore: z.number().min(0).max(100).optional(),
      // Bounds come from the rubric (SCORE_CONFIG) so they can't drift from
      // the real maxes — the previous hardcoded values let outfit/posture
      // reach 5 and dealing/game reach 10, well above their actual caps.
      hairScore: z.number().min(0).max(SCORE_CONFIG.hair.max).optional(),
      makeupScore: z.number().min(0).max(SCORE_CONFIG.makeup.max).optional(),
      outfitScore: z.number().min(0).max(SCORE_CONFIG.outfit.max).optional(),
      postureScore: z.number().min(0).max(SCORE_CONFIG.posture.max).optional(),
      dealingStyleScore: z.number().min(0).max(SCORE_CONFIG.dealingStyle.max).optional(),
      gamePerformanceScore: z.number().min(0).max(SCORE_CONFIG.gamePerformance.max).optional(),
      hairComment: z.string().max(1000).optional(),
      makeupComment: z.string().max(1000).optional(),
      outfitComment: z.string().max(1000).optional(),
      postureComment: z.string().max(1000).optional(),
      dealingStyleComment: z.string().max(1000).optional(),
      gamePerformanceComment: z.string().max(1000).optional(),
      /** Optional note explaining the edit — recorded in the audit trail. */
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership before update - user-based data isolation
      const evaluation = await db.getEvaluationWithGP(input.id);
      if (!evaluation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evaluation not found' });
      if (ctx.user.role !== 'admin') {
        const evalUserId = evaluation.evaluation?.userId || evaluation.evaluation?.uploadedById;
        if (evalUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only edit your own evaluations' });
        }
      }

      const { id, reason, ...data } = input;
      // Sanitize text fields
      if (data.evaluatorName) data.evaluatorName = db.sanitizeString(data.evaluatorName, 255);
      if (data.game) data.game = db.sanitizeString(data.game, 100);
      if (data.hairComment) data.hairComment = db.sanitizeString(data.hairComment, 1000);
      if (data.makeupComment) data.makeupComment = db.sanitizeString(data.makeupComment, 1000);
      if (data.outfitComment) data.outfitComment = db.sanitizeString(data.outfitComment, 1000);
      if (data.postureComment) data.postureComment = db.sanitizeString(data.postureComment, 1000);
      if (data.dealingStyleComment) data.dealingStyleComment = db.sanitizeString(data.dealingStyleComment, 1000);
      if (data.gamePerformanceComment) data.gamePerformanceComment = db.sanitizeString(data.gamePerformanceComment, 1000);

      // Derived scores (appearance / game / total) and the per-criterion
      // JSON are recomputed inside updateEvaluation via the scoring engine;
      // the edit is also captured in the evaluation_revisions audit trail.
      const updated = await db.updateEvaluation(id, data, { editedById: ctx.user.id, reason });
      return { success: true, evaluation: updated };
    }),

  /** Edit history (newest first) for one evaluation — owner / admin only. */
  history: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .query(async ({ ctx, input }) => {
      const evaluation = await db.getEvaluationWithGP(input.id);
      if (!evaluation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evaluation not found' });
      if (ctx.user.role !== 'admin') {
        const evalUserId = evaluation.evaluation?.userId || evaluation.evaluation?.uploadedById;
        if (evalUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }
      return await db.getEvaluationRevisions(input.id);
    }),

  /** Evaluations flagged for human review — scoped to the caller unless admin. */
  needsReview: protectedProcedure.query(async ({ ctx }) => {
    return await db.getEvaluationsNeedingReview(ctx.user.role === "admin" ? undefined : ctx.user.id);
  }),

  /** Dismiss the review flag after a human has checked the evaluation. */
  clearReview: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const evaluation = await db.getEvaluationWithGP(input.id);
      if (!evaluation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evaluation not found' });
      if (ctx.user.role !== 'admin') {
        const evalUserId = evaluation.evaluation?.userId || evaluation.evaluation?.uploadedById;
        if (evalUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }
      await db.clearEvaluationReviewFlag(input.id);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership before delete - user-based data isolation
      const evaluation = await db.getEvaluationWithGP(input.id);
      if (!evaluation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evaluation not found' });
      if (ctx.user.role !== 'admin') {
        const evalUserId = evaluation.evaluation?.userId || evaluation.evaluation?.uploadedById;
        if (evalUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only delete your own evaluations' });
        }
      }
      
      await db.deleteEvaluation(input.id);
      return { success: true };
    }),

  deleteByMonth: protectedProcedure
    .input(z.object({
      year: z.number(),
      month: z.number().min(1).max(12),
    }))
    .mutation(async ({ ctx, input }) => {
      // User-based data isolation
      if (ctx.user.role !== 'admin') {
        const count = await db.deleteEvaluationsByMonthAndUser(input.year, input.month, ctx.user.id);
        return { success: true, deletedCount: count };
      }
      const count = await db.deleteEvaluationsByMonth(input.year, input.month);
      return { success: true, deletedCount: count };
    }),

  deleteByDateRange: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      // User-based data isolation
      if (ctx.user.role !== 'admin') {
        const count = await db.deleteEvaluationsByDateRangeAndUser(input.startDate, input.endDate, ctx.user.id);
        return { success: true, deletedCount: count };
      }
      const count = await db.deleteEvaluationsByDateRange(input.startDate, input.endDate);
      return { success: true, deletedCount: count };
    }),

  /**
   * Coverage — for the Upload page team selector.
   * Returns each GP in the user's teams with their eval count for the
   * given month, average score, and last eval date so the FM can see
   * who still needs evaluations.
   */
  coverage: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number(),
      teamId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Get teams for this user
      let teams: Array<{ id: number; teamName: string; gamePresenters: Array<{ id: number; name: string; realName: string | null }> }>;
      if (ctx.user.role === 'admin') {
        const allTeams = await db.getAllTeamsWithGPs();
        teams = allTeams.map(t => ({
          id: t.id,
          teamName: t.teamName,
          gamePresenters: t.gamePresenters.map(gp => ({ id: gp.id, name: gp.name, realName: gp.realName })),
        }));
      } else {
        const userTeams = await db.getTeamsWithGPsByUser(ctx.user.id);
        teams = userTeams.map(t => ({
          id: t.id,
          teamName: t.teamName,
          gamePresenters: t.gamePresenters.map(gp => ({ id: gp.id, name: gp.name, realName: gp.realName })),
        }));
      }

      // Filter to specific team if requested
      if (input.teamId) {
        teams = teams.filter(t => t.id === input.teamId);
      }

      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 0, 23, 59, 59);

      const result = await Promise.all(teams.map(async (team) => {
        const gpCoverage = await Promise.all(team.gamePresenters.map(async (gp) => {
          const monthEvals = await db.getEvaluationsByGPAndMonth(gp.id, input.year, input.month);
          const allEvals = await db.getEvaluationsByGP(gp.id);
          // Sort newest first
          allEvals.sort((a, b) => {
            const ta = (a.evaluationDate ?? a.createdAt ?? new Date(0)).getTime?.() ?? 0;
            const tb = (b.evaluationDate ?? b.createdAt ?? new Date(0)).getTime?.() ?? 0;
            return tb - ta;
          });
          const lastEval = allEvals[0] ?? null;
          const lastDate = lastEval?.evaluationDate ?? lastEval?.createdAt ?? null;

          // Average score this month
          const scores = monthEvals.map(e => e.totalScore).filter((s): s is number => s != null && s > 0);
          const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

          // Determine status
          let status: 'complete' | 'partial' | 'missing' = 'missing';
          if (monthEvals.length >= 10) status = 'complete';
          else if (monthEvals.length > 0) status = 'partial';

          return {
            gpId: gp.id,
            gpName: gp.name,
            realName: gp.realName,
            evalCount: monthEvals.length,
            avgScore,
            lastEvalDate: lastDate,
            totalEvalsAllTime: allEvals.length,
            status,
          };
        }));

        // Sort: missing first, then partial, then complete; alphabetical within
        const statusRank: Record<string, number> = { missing: 0, partial: 1, complete: 2 };
        gpCoverage.sort((a, b) => {
          const sa = statusRank[a.status] ?? 99;
          const sb = statusRank[b.status] ?? 99;
          if (sa !== sb) return sa - sb;
          return a.gpName.localeCompare(b.gpName);
        });

        return {
          teamId: team.id,
          teamName: team.teamName,
          gps: gpCoverage,
          summary: {
            total: gpCoverage.length,
            complete: gpCoverage.filter(g => g.status === 'complete').length,
            partial: gpCoverage.filter(g => g.status === 'partial').length,
            missing: gpCoverage.filter(g => g.status === 'missing').length,
          },
        };
      }));

      return result;
    }),
});
