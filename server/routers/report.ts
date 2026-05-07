import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { MONTH_NAMES } from "@shared/const";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import { exportToGoogleSheets, isGoogleSheetsAvailable } from "../services/googleSheetsService";
import { generateExcelAndEmail, generateAndPersistNarratives, extractEvaluationFromImage, parseEvaluationDate, EvaluationDataSchema } from "./_shared";
import { createLogger } from "../services/logger";
const log = createLogger("Router");

export const reportRouter = router({
  // Auto-fill text fields based on evaluation data using LLM
  autoFillFields: protectedProcedure
    .input(z.object({
      teamId: z.number().positive(),
      reportMonth: z.number().min(1).max(12),
      reportYear: z.number().min(2020).max(2100),
    }))
    .mutation(async ({ ctx, input }) => {
      // User-based data isolation: verify team belongs to user
      if (ctx.user.role !== 'admin') {
        const team = await db.getFmTeamById(input.teamId);
        if (!team || team.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only generate content for your own teams' });
        }
      }
      
      const team = await db.getFmTeamById(input.teamId);
      if (!team) throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });

      const monthName = MONTH_NAMES[input.reportMonth - 1];
      const stats = await db.getGPMonthlyStats(input.teamId, input.reportYear, input.reportMonth);
      const attendance = await db.getAttendanceByTeamMonth(input.teamId, input.reportMonth, input.reportYear);
      
      // Get error counts for each GP (user-scoped)
      const errorCounts = await db.getErrorCountByGP(input.reportMonth, input.reportYear, ctx.user.id);
      
      // Get attitude data for each GP in the team
      const teamGPs = await db.getGamePresentersByTeam(input.teamId);
      const attitudeData: { gpName: string; positive: number; negative: number; total: number }[] = [];
      
      for (const gp of teamGPs) {
        const attitudes = await db.getAttitudeScreenshotsForGP(gp.id, input.reportMonth, input.reportYear);
        const positive = attitudes.filter(a => a.attitudeType === 'positive').length;
        const negative = attitudes.filter(a => a.attitudeType === 'negative').length;
        if (positive > 0 || negative > 0) {
          attitudeData.push({ gpName: gp.name, positive, negative, total: positive - negative });
        }
      }

      if (stats.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No evaluation data available for this month' });
      }

      // Prepare data summary for LLM
      const avgTotal = stats.reduce((sum, gp) => sum + Number(gp.avgTotalScore || 0), 0) / stats.length;
      const avgAppearance = stats.reduce((sum, gp) => sum + Number(gp.avgAppearanceScore || 0), 0) / stats.length;
      const avgGamePerf = stats.reduce((sum, gp) => sum + Number(gp.avgGamePerfScore || 0), 0) / stats.length;
      
      const topPerformers = [...stats]
        .sort((a, b) => Number(b.avgTotalScore || 0) - Number(a.avgTotalScore || 0))
        .slice(0, 3);
      
      const needsImprovement = stats.filter(gp => Number(gp.avgTotalScore || 0) < 18);
      
      // Calculate attendance stats
      const totalMistakes = attendance.reduce((sum, a) => sum + (a.monthlyStats?.mistakes || a.attendance?.mistakes || 0), 0);
      const totalExtraShifts = attendance.reduce((sum, a) => sum + (a.attendance?.extraShifts || 0), 0);
      const totalLate = attendance.reduce((sum, a) => sum + (a.attendance?.lateToWork || 0), 0);
      const totalMissed = attendance.reduce((sum, a) => sum + (a.attendance?.missedDays || 0), 0);
      const totalSick = attendance.reduce((sum, a) => sum + (a.attendance?.sickLeaves || 0), 0);
      
      // Build detailed GP performance data
      const gpDetailedData = stats.map(gp => {
        const gpErrors = errorCounts.find(e => e.gpName === gp.gpName);
        const gpAttitude = attitudeData.find(a => a.gpName === gp.gpName);
        const gpAttendance = attendance.find(a => a.gamePresenter.name === gp.gpName);
        
        return {
          name: gp.gpName,
          avgScore: Number(gp.avgTotalScore || 0).toFixed(1),
          appearanceScore: Number(gp.avgAppearanceScore || 0).toFixed(1),
          gamePerformanceScore: Number(gp.avgGamePerfScore || 0).toFixed(1),
          evaluationCount: gp.evaluationCount,
          errorCount: gpErrors?.errorCount || 0,
          attitudePositive: gpAttitude?.positive || 0,
          attitudeNegative: gpAttitude?.negative || 0,
          attitudeTotal: gpAttitude?.total || 0,
          lateArrivals: gpAttendance?.attendance?.lateToWork || 0,
          missedDays: gpAttendance?.attendance?.missedDays || 0,
        };
      });
      
      // Identify GPs with most errors
      const gpsWithErrors = gpDetailedData.filter(gp => gp.errorCount > 0)
        .sort((a, b) => b.errorCount - a.errorCount);
      
      // Identify GPs with negative attitude
      const gpsWithNegativeAttitude = gpDetailedData.filter(gp => gp.attitudeNegative > 0)
        .sort((a, b) => b.attitudeNegative - a.attitudeNegative);
      
      // Identify GPs with positive attitude
      const gpsWithPositiveAttitude = gpDetailedData.filter(gp => gp.attitudePositive > 0)
        .sort((a, b) => b.attitudePositive - a.attitudePositive);

      const totalErrors = gpsWithErrors.reduce((sum, gp) => sum + gp.errorCount, 0);
      const totalPositiveAttitude = attitudeData.reduce((sum, a) => sum + a.positive, 0);
      const totalNegativeAttitude = attitudeData.reduce((sum, a) => sum + a.negative, 0);

      const formatGpLine = (gp: (typeof gpDetailedData)[number]) => (
        `${gp.name} | Score ${gp.avgScore}/22 | Appearance ${gp.appearanceScore}/12 | Game ${gp.gamePerformanceScore}/10 | ` +
        `Evals ${gp.evaluationCount} | Errors ${gp.errorCount} | Attitude +${gp.attitudePositive}/-${gp.attitudeNegative} | ` +
        `Late ${gp.lateArrivals} | Missed ${gp.missedDays}`
      );

      // Build comprehensive context for LLM
      const dataContext = `
Team: ${team.teamName}
Floor Manager: ${team.floorManagerName}
Period: ${monthName} ${input.reportYear}

=== EVALUATION STATISTICS ===
- Total GPs Evaluated: ${stats.length}
- Average Total Score: ${avgTotal.toFixed(1)}/22 (${avgTotal >= 20 ? "Excellent" : avgTotal >= 18 ? "Good" : avgTotal >= 16 ? "Needs Improvement" : "Critical"})
- Average Appearance Score: ${avgAppearance.toFixed(1)}/12
- Average Game Performance Score: ${avgGamePerf.toFixed(1)}/10

=== TOP PERFORMERS (by evaluation score) ===
${topPerformers.map((gp, i) => {
const detail = gpDetailedData.find(d => d.name === gp.gpName);
return `${i + 1}. ${gp.gpName} - ${Number(gp.avgTotalScore || 0).toFixed(1)}/22 (${detail?.evaluationCount || 0} evaluations, ${detail?.errorCount || 0} errors, attitude: +${detail?.attitudePositive || 0}/-${detail?.attitudeNegative || 0})`;
}).join("\n")}

${needsImprovement.length > 0 ? `=== GPs NEEDING IMPROVEMENT (score < 18) ===
${needsImprovement.map(gp => {
const detail = gpDetailedData.find(d => d.name === gp.gpName);
return `- ${gp.gpName}: ${Number(gp.avgTotalScore || 0).toFixed(1)}/22 (Appearance: ${detail?.appearanceScore}/12, Game Perf: ${detail?.gamePerformanceScore}/10)`;
}).join("\n")}` : "=== All GPs are performing well (score >= 18) ==="}

=== ERROR ANALYSIS ===
- Total Team Errors: ${totalErrors}
${gpsWithErrors.length > 0 ? `GPs with errors:
${gpsWithErrors.slice(0, 5).map(gp => `- ${gp.name}: ${gp.errorCount} errors`).join("\n")}` : "No errors recorded this month"}

=== ATTITUDE ANALYSIS ===
- Total Positive Feedback: ${totalPositiveAttitude}
- Total Negative Feedback: ${totalNegativeAttitude}
${gpsWithPositiveAttitude.length > 0 ? `GPs with positive attitude feedback:
${gpsWithPositiveAttitude.slice(0, 3).map(gp => `- ${gp.name}: +${gp.attitudePositive}`).join("\n")}` : "No positive attitude feedback recorded"}
${gpsWithNegativeAttitude.length > 0 ? `GPs with negative attitude feedback:
${gpsWithNegativeAttitude.slice(0, 3).map(gp => `- ${gp.name}: -${gp.attitudeNegative}`).join("\n")}` : "No negative attitude feedback recorded"}

=== ATTENDANCE SUMMARY ===
- Total Mistakes/Errors: ${totalMistakes}
- Extra Shifts Worked: ${totalExtraShifts}
- Late Arrivals: ${totalLate}
- Missed Days: ${totalMissed}
- Sick Leaves: ${totalSick}

=== INDIVIDUAL GP BREAKDOWN ===
${gpDetailedData.map(formatGpLine).join("\n")}
`;

      const sharedPromptRules = `Rules:
- Use only facts present in the data context.
- Do NOT invent names, numbers, or events.
- If data is missing, state it is not available rather than guessing.
- Keep the tone professional and concise.`;

      // Generate FM Performance text
      const fmPerformanceResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an experienced Floor Manager writing a self-evaluation for a monthly casino operations report.

Guidelines:
- Write in first person, professionally and concisely
- Focus on: team management achievements, studio operations improvements, handling of challenges
- Reference specific metrics from the data (scores, error reduction, attitude improvements)
- Keep it to 3-4 sentences
- Do NOT use bullet points
- Be specific about what was accomplished this month

${sharedPromptRules}`
          },
          {
            role: "user",
            content: `Based on this comprehensive team data, write a brief FM self-evaluation that highlights your management achievements:\n${dataContext}`
          }
        ]
      });

      // Generate Goals text with enhanced prompt
      const goalsResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an experienced Floor Manager creating SMART goals for a monthly casino operations report.

Guidelines for writing optimal Team Goals:
1. Analyze the data to identify the TOP 3 priority areas:
 - GPs with low evaluation scores (< 18/22) need improvement plans
 - GPs with high error counts need error reduction targets
 - GPs with negative attitude feedback need behavior coaching
 - Attendance issues (late arrivals, missed days) need addressing

2. For each goal, be SPECIFIC:
 - Name the GPs who need improvement (if applicable)
 - Set measurable targets (e.g., "reduce errors by 50%", "improve score to 19+")
 - Focus on actionable improvements

3. Balance the goals:
 - 1 goal for maintaining/rewarding top performers
 - 1-2 goals for addressing weaknesses (errors, scores, attitude)
 - Consider team-wide improvements if no individual issues

4. Format: Write 3-4 concise sentences. Do NOT use bullet points.

IMPORTANT: Be specific with names and numbers from the data. Generic goals are not acceptable.

${sharedPromptRules}`
          },
          {
            role: "user",
            content: `Based on this comprehensive team performance data, create specific, actionable Team Goals for next month:\n${dataContext}`
          }
        ]
      });

      // Generate Team Overview text with enhanced prompt
      const teamOverviewResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an experienced Floor Manager writing a comprehensive Team Overview for a monthly casino operations report.

Guidelines for writing an optimal Team Overview:
1. Start with overall team performance assessment:
 - Team average score and what it indicates (Excellent/Good/Needs Work)
 - Compare appearance vs game performance scores

2. Highlight achievements:
 - Name top 2-3 performers with their scores
 - Mention any GPs with positive attitude feedback
 - Note extra shifts or exceptional dedication

3. Address concerns honestly:
 - Name GPs with scores below 18 and their specific issues
 - Mention error counts for GPs with multiple errors
 - Note any negative attitude feedback recipients
 - Address attendance issues (late arrivals, missed days)

4. Provide balanced perspective:
 - Acknowledge both strengths and areas for improvement
 - Be factual and data-driven

5. Format: Write 4-5 concise sentences. Do NOT use bullet points.

IMPORTANT: Use specific names and numbers from the data. A good overview is honest, specific, and actionable.

${sharedPromptRules}`
          },
          {
            role: "user",
            content: `Based on this comprehensive team performance data, write a detailed Team Overview that accurately reflects the team's performance this month:\n${dataContext}`
          }
        ]
      });

      const fmPerformanceContent = fmPerformanceResponse.choices[0]?.message?.content;
      const goalsContent = goalsResponse.choices[0]?.message?.content;
      const teamOverviewContent = teamOverviewResponse.choices[0]?.message?.content;
      
      // Ensure we extract string content from LLM response
      const fmPerformance = typeof fmPerformanceContent === 'string' ? fmPerformanceContent : '';
      const goalsThisMonth = typeof goalsContent === 'string' ? goalsContent : '';
      const teamOverview = typeof teamOverviewContent === 'string' ? teamOverviewContent : '';

      return {
        fmPerformance,
        goalsThisMonth,
        teamOverview,
        stats: {
          totalGPs: stats.length,
          avgTotal: avgTotal.toFixed(1),
          avgAppearance: avgAppearance.toFixed(1),
          avgGamePerf: avgGamePerf.toFixed(1),
          topPerformers: topPerformers.map(gp => ({
            name: gp.gpName,
            score: Number(gp.avgTotalScore || 0).toFixed(1)
          })),
          needsImprovement: needsImprovement.map(gp => ({
            name: gp.gpName,
            score: Number(gp.avgTotalScore || 0).toFixed(1)
          })),
          attendance: {
            totalMistakes,
            totalExtraShifts,
            totalLate,
            totalMissed,
            totalSick
          }
        }
      };
    }),

  generate: protectedProcedure
    .input(z.object({
      teamId: z.number(),
      reportMonth: z.number().min(1).max(12),
      reportYear: z.number(),
      fmPerformance: z.string().optional(),
      goalsThisMonth: z.string().optional(),
      teamOverview: z.string().optional(),
      additionalComments: z.string().optional(),
      autoFill: z.boolean().optional().default(true), // Auto-fill empty fields by default
    }))
    .mutation(async ({ ctx, input }) => {
      // User-based data isolation: verify team belongs to user
      if (ctx.user.role !== 'admin') {
        const teamCheck = await db.getFmTeamById(input.teamId);
        if (!teamCheck || teamCheck.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only generate reports for your own teams' });
        }
      }
      
      const team = await db.getFmTeamById(input.teamId);
      if (!team) throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });

      const stats = await db.getGPMonthlyStats(input.teamId, input.reportYear, input.reportMonth);
      const attendance = await db.getAttendanceByTeamMonth(input.teamId, input.reportMonth, input.reportYear);
      const monthName = MONTH_NAMES[input.reportMonth - 1];
      
      // Get error counts for each GP (user-scoped)
      const errorCounts = await db.getErrorCountByGP(input.reportMonth, input.reportYear, ctx.user.id);
      
      // Get attitude data for each GP in the team
      const teamGPs = await db.getGamePresentersByTeam(input.teamId);
      const attitudeData: { gpName: string; positive: number; negative: number; total: number }[] = [];
      
      for (const gp of teamGPs) {
        const attitudes = await db.getAttitudeScreenshotsForGP(gp.id, input.reportMonth, input.reportYear);
        const positive = attitudes.filter(a => a.attitudeType === 'positive').length;
        const negative = attitudes.filter(a => a.attitudeType === 'negative').length;
        if (positive > 0 || negative > 0) {
          attitudeData.push({ gpName: gp.name, positive, negative, total: positive - negative });
        }
      }

      // Auto-generate content if fields are empty and autoFill is enabled
      let fmPerformance = input.fmPerformance || null;
      let goalsThisMonth = input.goalsThisMonth || null;
      let teamOverview = input.teamOverview || null;

      if (input.autoFill && stats.length > 0) {
        // Calculate team statistics for auto-generation
        const avgTotal = stats.reduce((sum, gp) => sum + Number(gp.avgTotalScore || 0), 0) / stats.length;
        const avgAppearance = stats.reduce((sum, gp) => sum + Number(gp.avgAppearanceScore || 0), 0) / stats.length;
        const avgGamePerf = stats.reduce((sum, gp) => sum + Number(gp.avgGamePerfScore || 0), 0) / stats.length;
        
        const topPerformers = [...stats]
          .sort((a, b) => Number(b.avgTotalScore || 0) - Number(a.avgTotalScore || 0))
          .slice(0, 3);
        
        const needsImprovement = stats.filter(gp => Number(gp.avgTotalScore || 0) < 18);
        
        // Calculate attendance stats
        const totalMistakes = attendance.reduce((sum, a) => sum + (a.monthlyStats?.mistakes || a.attendance?.mistakes || 0), 0);
        const totalExtraShifts = attendance.reduce((sum, a) => sum + (a.attendance?.extraShifts || 0), 0);
        const totalLate = attendance.reduce((sum, a) => sum + (a.attendance?.lateToWork || 0), 0);
        const totalMissed = attendance.reduce((sum, a) => sum + (a.attendance?.missedDays || 0), 0);
        const totalSick = attendance.reduce((sum, a) => sum + (a.attendance?.sickLeaves || 0), 0);
        
        // Build detailed GP performance data
        const gpDetailedData = stats.map(gp => {
          const gpErrors = errorCounts.find(e => e.gpName === gp.gpName);
          const gpAttitude = attitudeData.find(a => a.gpName === gp.gpName);
          const gpAttendance = attendance.find(a => a.gamePresenter.name === gp.gpName);
          
          return {
            name: gp.gpName,
            avgScore: Number(gp.avgTotalScore || 0).toFixed(1),
            appearanceScore: Number(gp.avgAppearanceScore || 0).toFixed(1),
            gamePerformanceScore: Number(gp.avgGamePerfScore || 0).toFixed(1),
            evaluationCount: gp.evaluationCount,
            errorCount: gpErrors?.errorCount || 0,
            attitudePositive: gpAttitude?.positive || 0,
            attitudeNegative: gpAttitude?.negative || 0,
            attitudeTotal: gpAttitude?.total || 0,
            lateArrivals: gpAttendance?.attendance?.lateToWork || 0,
            missedDays: gpAttendance?.attendance?.missedDays || 0,
          };
        });
        
        // Identify GPs with most errors
        const gpsWithErrors = gpDetailedData.filter(gp => gp.errorCount > 0)
          .sort((a, b) => b.errorCount - a.errorCount);
        
        // Identify GPs with negative attitude
        const gpsWithNegativeAttitude = gpDetailedData.filter(gp => gp.attitudeNegative > 0)
          .sort((a, b) => b.attitudeNegative - a.attitudeNegative);
        
        // Identify GPs with positive attitude
        const gpsWithPositiveAttitude = gpDetailedData.filter(gp => gp.attitudePositive > 0)
          .sort((a, b) => b.attitudePositive - a.attitudePositive);

        // Build comprehensive context for LLM
        const dataContext = `
Team: ${team.teamName}
Floor Manager: ${team.floorManagerName}
Period: ${monthName} ${input.reportYear}

=== EVALUATION STATISTICS ===
- Total GPs Evaluated: ${stats.length}
- Average Total Score: ${avgTotal.toFixed(1)}/22 (${avgTotal >= 20 ? 'Excellent' : avgTotal >= 18 ? 'Good' : avgTotal >= 16 ? 'Needs Improvement' : 'Critical'})
- Average Appearance Score: ${avgAppearance.toFixed(1)}/12
- Average Game Performance Score: ${avgGamePerf.toFixed(1)}/10

=== TOP PERFORMERS (by evaluation score) ===
${topPerformers.map((gp, i) => {
const detail = gpDetailedData.find(d => d.name === gp.gpName);
return `${i + 1}. ${gp.gpName} - ${Number(gp.avgTotalScore || 0).toFixed(1)}/22 (${detail?.evaluationCount || 0} evaluations, ${detail?.errorCount || 0} errors, attitude: +${detail?.attitudePositive || 0}/-${detail?.attitudeNegative || 0})`;
}).join('\n')}

${needsImprovement.length > 0 ? `=== GPs NEEDING IMPROVEMENT (score < 18) ===
${needsImprovement.map(gp => {
const detail = gpDetailedData.find(d => d.name === gp.gpName);
return `- ${gp.gpName}: ${Number(gp.avgTotalScore || 0).toFixed(1)}/22 (Appearance: ${detail?.appearanceScore}/12, Game Perf: ${detail?.gamePerformanceScore}/10)`;
}).join('\n')}` : '=== All GPs are performing well (score >= 18) ==='}

=== ERROR ANALYSIS ===
- Total Team Errors: ${gpsWithErrors.reduce((sum, gp) => sum + gp.errorCount, 0)}
${gpsWithErrors.length > 0 ? `GPs with errors:
${gpsWithErrors.slice(0, 5).map(gp => `- ${gp.name}: ${gp.errorCount} errors`).join('\n')}` : 'No errors recorded this month'}

=== ATTITUDE ANALYSIS ===
- Total Positive Feedback: ${attitudeData.reduce((sum, a) => sum + a.positive, 0)}
- Total Negative Feedback: ${attitudeData.reduce((sum, a) => sum + a.negative, 0)}
${gpsWithPositiveAttitude.length > 0 ? `GPs with positive attitude feedback:
${gpsWithPositiveAttitude.slice(0, 3).map(gp => `- ${gp.name}: +${gp.attitudePositive}`).join('\n')}` : ''}
${gpsWithNegativeAttitude.length > 0 ? `GPs with negative attitude feedback:
${gpsWithNegativeAttitude.slice(0, 3).map(gp => `- ${gp.name}: -${gp.attitudeNegative}`).join('\n')}` : ''}

=== ATTENDANCE SUMMARY ===
- Total Mistakes/Errors: ${totalMistakes}
- Extra Shifts Worked: ${totalExtraShifts}
- Late Arrivals: ${totalLate}
- Missed Days: ${totalMissed}
- Sick Leaves: ${totalSick}

=== INDIVIDUAL GP BREAKDOWN ===
${gpDetailedData.map(gp => 
`${gp.name}: Score ${gp.avgScore}/22, Errors: ${gp.errorCount}, Attitude: +${gp.attitudePositive}/-${gp.attitudeNegative}, Late: ${gp.lateArrivals}`
).join('\n')}
`;

        // Auto-generate Team Overview if empty
        if (!teamOverview) {
          try {
            const teamOverviewResponse = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: `You are an experienced Floor Manager writing a comprehensive Team Overview for a monthly casino operations report.

Guidelines for writing an optimal Team Overview:
1. Start with overall team performance assessment:
 - Team average score and what it indicates (Excellent/Good/Needs Work)
 - Compare appearance vs game performance scores

2. Highlight achievements:
 - Name top 2-3 performers with their scores
 - Mention any GPs with positive attitude feedback
 - Note extra shifts or exceptional dedication

3. Address concerns honestly:
 - Name GPs with scores below 18 and their specific issues
 - Mention error counts for GPs with multiple errors
 - Note any negative attitude feedback recipients
 - Address attendance issues (late arrivals, missed days)

4. Provide balanced perspective:
 - Acknowledge both strengths and areas for improvement
 - Be factual and data-driven

5. Format: Write 4-5 concise sentences. Do NOT use bullet points.

IMPORTANT: Use specific names and numbers from the data. A good overview is honest, specific, and actionable.`
                },
                {
                  role: "user",
                  content: `Based on this comprehensive team performance data, write a detailed Team Overview that accurately reflects the team's performance this month:\n${dataContext}`
                }
              ]
            });
            const content = teamOverviewResponse.choices[0]?.message?.content;
            teamOverview = typeof content === 'string' ? content : null;
          } catch (e) {
            log.error('Failed to auto-generate teamOverview', e instanceof Error ? e : new Error(String(e)));
          }
        }

        // Auto-generate Goals if empty
        if (!goalsThisMonth) {
          try {
            const goalsResponse = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: `You are an experienced Floor Manager creating SMART goals for a monthly casino operations report.

Guidelines for writing optimal Team Goals:
1. Analyze the data to identify the TOP 3 priority areas:
 - GPs with low evaluation scores (< 18/22) need improvement plans
 - GPs with high error counts need error reduction targets
 - GPs with negative attitude feedback need behavior coaching
 - Attendance issues (late arrivals, missed days) need addressing

2. For each goal, be SPECIFIC:
 - Name the GPs who need improvement (if applicable)
 - Set measurable targets (e.g., "reduce errors by 50%", "improve score to 19+")
 - Focus on actionable improvements

3. Balance the goals:
 - 1 goal for maintaining/rewarding top performers
 - 1-2 goals for addressing weaknesses (errors, scores, attitude)
 - Consider team-wide improvements if no individual issues

4. Format: Write 3-4 concise sentences. Do NOT use bullet points.

IMPORTANT: Be specific with names and numbers from the data. Generic goals are not acceptable.`
                },
                {
                  role: "user",
                  content: `Based on this comprehensive team performance data, create specific, actionable Team Goals for next month:\n${dataContext}`
                }
              ]
            });
            const content = goalsResponse.choices[0]?.message?.content;
            goalsThisMonth = typeof content === 'string' ? content : null;
          } catch (e) {
            log.error('Failed to auto-generate goalsThisMonth', e instanceof Error ? e : new Error(String(e)));
          }
        }
      }

      const report = await db.createReport({
        teamId: input.teamId,
        reportMonth: input.reportMonth,
        reportYear: input.reportYear,
        fmPerformance: fmPerformance,
        goalsThisMonth: goalsThisMonth,
        teamOverview: teamOverview,
        additionalComments: input.additionalComments || null,
        reportData: { stats, attendance },
        status: "generated",
        generatedById: ctx.user.id,
      });

      // Generate richer narratives (executive summary, top wins/
      // concerns, per-GP reviews) and persist to the report row
      // before the workbook gets built. The Excel sheet builder reads
      // these fields off the row.
      await generateAndPersistNarratives({
        reportId: report.id,
        teamId: input.teamId,
        reportMonth: input.reportMonth,
        reportYear: input.reportYear,
        userId: ctx.user.id,
        teamName: team.teamName,
        fmName: team.floorManagerName,
      });

      await notifyOwner({
        title: "New Report Generated",
        content: `A new Team Monthly Overview report has been generated for ${team.teamName} - ${MONTH_NAMES[input.reportMonth - 1]} ${input.reportYear}`,
      });

      await generateExcelAndEmail(ctx, report.id);

      return { ...report };
    }),

  /**
   * "Generate reports for ALL my teams in one click."
   *
   * Loops every team the caller can see, runs a baseline report
   * generation per team (auto-fill enabled, no manual text supplied),
   * and pipes each through `generateExcelAndEmail` so every team's FM
   * gets their report on email automatically. Returns a per-team
   * outcome so the UI can display "5 succeeded, 1 failed".
   *
   * Sequential rather than parallel: each `generateExcelAndEmail` is
   * IO-heavy (Excel build + S3 upload + Sheets export + email send),
   * and running them in parallel against rate-limited services
   * (Google Sheets / Resend) is asking for partial failures.
   *
   * Saves the FM ~30 minutes/month at small team counts and scales
   * linearly from there.
   */
  generateAllForMonth: protectedProcedure
    .input(z.object({
      reportMonth: z.number().min(1).max(12),
      reportYear: z.number().min(2020).max(2100),
    }))
    .mutation(async ({ ctx, input }) => {
      const allTeams = await db.getAllFmTeams();
      const teams = ctx.user.role === "admin"
        ? allTeams
        : allTeams.filter(t => t.userId === ctx.user.id);

      const results: Array<{
        teamId: number;
        teamName: string;
        status: "success" | "failed";
        reportId?: number;
        emailSent?: boolean;
        error?: string;
      }> = [];

      for (const team of teams) {
        try {
          const report = await db.createReport({
            teamId: team.id,
            reportMonth: input.reportMonth,
            reportYear: input.reportYear,
            fmPerformance: null,
            goalsThisMonth: null,
            teamOverview: null,
            additionalComments: null,
            reportData: {},
            status: "generated",
            // Mark the report as owned by the team's FM so per-user
            // listing shows it under the right account. The admin who
            // triggered this is captured separately in `generatedById`
            // when admins are doing bulk runs.
            generatedById: ctx.user.id,
            userId: team.userId ?? ctx.user.id,
          });
          // Email recipient: when an admin runs the bulk job they
          // shouldn't get every team's email — each report belongs to
          // a different FM. Look up the team owner's email/name so
          // generateExcelAndEmail addresses the message to them. Fall
          // back to the caller's email when the team has no owner.
          let recipientCtx: { user: { id: number; role: string; email?: string | null; name?: string | null } } = ctx;
          if (team.userId && team.userId !== ctx.user.id) {
            const owner = await db.getUserById(team.userId);
            if (owner?.email) {
              recipientCtx = {
                user: {
                  id: owner.id,
                  role: owner.role ?? "fm",
                  email: owner.email,
                  name: owner.name ?? null,
                },
              };
            }
          }
          // Generate narratives before the email pass so the bulk path
          // produces the same rich content as on-demand + cron.
          await generateAndPersistNarratives({
            reportId: report.id,
            teamId: team.id,
            reportMonth: input.reportMonth,
            reportYear: input.reportYear,
            userId: recipientCtx.user.id,
            teamName: team.teamName,
            fmName: team.floorManagerName,
          });
          const result = await generateExcelAndEmail(recipientCtx, report.id);
          results.push({
            teamId: team.id,
            teamName: team.teamName,
            status: "success",
            reportId: report.id,
            emailSent: result.emailSent,
          });
        } catch (e) {
          log.error(`Bulk generate failed for team ${team.id}`, e instanceof Error ? e : new Error(String(e)));
          results.push({
            teamId: team.id,
            teamName: team.teamName,
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const succeeded = results.filter(r => r.status === "success").length;
      const failed = results.filter(r => r.status === "failed").length;
      const emailsSent = results.filter(r => r.emailSent).length;

      // One owner notification for the whole batch — better than spamming
      // per-team in `generate`.
      try {
        await notifyOwner({
          title: "Bulk monthly reports generated",
          content: `Generated ${succeeded} of ${results.length} reports for ${MONTH_NAMES[input.reportMonth - 1]} ${input.reportYear}${failed > 0 ? ` (${failed} failed)` : ""}.`,
        });
      } catch {
        /* notifications are best-effort */
      }

      return {
        results,
        totals: { teams: results.length, succeeded, failed, emailsSent },
        month: input.reportMonth,
        year: input.reportYear,
      };
    }),

  exportToExcel: protectedProcedure
    .input(z.object({
      reportId: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      return generateExcelAndEmail(ctx, input.reportId);
    }),

  exportToGoogleSheets: protectedProcedure
    .input(z.object({
      reportId: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      log.info("exportToGoogleSheets START", { reportId: input.reportId });

      if (!isGoogleSheetsAvailable()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google Sheets export is not configured. Please add Google service account credentials.' });
      }

      const reportWithTeam = await db.getReportWithTeam(input.reportId);
      if (!reportWithTeam) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });

      if (ctx.user.role !== 'admin' && reportWithTeam.report.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const { report, team } = reportWithTeam;
      const teamName = team?.teamName || "Unknown Team";
      const fmName = team?.floorManagerName || "Unknown FM";

      const freshAttendance = await db.getAttendanceByTeamMonth(report.teamId, report.reportMonth, report.reportYear);

      const attitudeByGp: Record<number, { positive: number; negative: number; entries: Array<{ date: string; type: string; comment: string; score: number }> }> = {};
      for (const item of freshAttendance) {
        if (item.gamePresenter?.id) {
          const gpAttitudeEntries = await db.getAttitudeScreenshotsForGP(item.gamePresenter.id, report.reportMonth, report.reportYear);
          const positive = gpAttitudeEntries.filter(e => (e.attitudeScore || 0) > 0).length;
          const negative = gpAttitudeEntries.filter(e => (e.attitudeScore || 0) < 0).length;
          const entries = gpAttitudeEntries.map(e => ({
            date: e.evaluationDate ? new Date(e.evaluationDate).toLocaleDateString() : new Date(e.createdAt).toLocaleDateString(),
            type: (e.attitudeScore || 0) > 0 ? 'POSITIVE' : 'NEGATIVE',
            comment: e.comment || '',
            score: e.attitudeScore || 0,
          }));
          attitudeByGp[item.gamePresenter.id] = { positive, negative, entries };
        }
      }

      const gpEvaluationsData = await db.getGPEvaluationsForDataSheet(report.teamId, report.reportYear, report.reportMonth);
      const prevMonth = report.reportMonth === 1 ? 12 : report.reportMonth - 1;
      const prevYear = report.reportMonth === 1 ? report.reportYear - 1 : report.reportYear;
      const prevMonthEvaluations = await db.getGPEvaluationsForDataSheet(report.teamId, prevYear, prevMonth);

      const result = await exportToGoogleSheets({
        report: {
          id: report.id,
          teamId: report.teamId,
          reportMonth: report.reportMonth,
          reportYear: report.reportYear,
          fmPerformance: report.fmPerformance,
          goalsThisMonth: report.goalsThisMonth,
          teamOverview: report.teamOverview,
          additionalComments: report.additionalComments,
        },
        teamName,
        fmName,
        attendanceData: freshAttendance,
        attitudeByGp,
        gpEvaluationsData,
        prevMonthEvaluations,
      }, ctx.user.email);

      // Update report with Google Sheets URL
      await db.updateReport(report.id, {
        googleSheetsUrl: result.spreadsheetUrl,
      });

      log.info("exportToGoogleSheets DONE", { spreadsheetUrl: result.spreadsheetUrl });
      return {
        success: true,
        spreadsheetUrl: result.spreadsheetUrl,
        spreadsheetId: result.spreadsheetId,
      };
    }),

  googleSheetsAvailable: protectedProcedure.query(() => {
    return { available: isGoogleSheetsAvailable() };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    // User-based data isolation: each user sees only their own reports
    if (ctx.user.role !== 'admin') {
      return await db.getReportsWithTeamsByUser(ctx.user.id);
    }
    // Admin sees all
    return await db.getReportsWithTeams();
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const report = await db.getReportWithTeam(input.id);
      if (!report) return null;
      
      // User-based data isolation: non-admin can only access their own reports
      if (ctx.user.role !== 'admin' && report.report.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only view your own reports' });
      }
      return report;
    }),

  // Admin: list all reports with team info
  listAll: adminProcedure.query(async () => {
    return await db.getAllReportsWithTeam();
  }),

  // Delete report with ownership check - user-based data isolation
  delete: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === 'admin';
      
      const success = await db.deleteReportWithCheckByUser(
        input.id,
        ctx.user.id,
        isAdmin
      );
      if (!success) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found or access denied' });
      }
      
      return { success: true };
    }),
});
