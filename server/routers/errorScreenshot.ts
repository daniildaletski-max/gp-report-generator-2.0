import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { createLogger } from "../services/logger";
import { parseIsoDateLocal } from "../db/_dateRange";
const log = createLogger("Router");

export const errorScreenshotRouter = router({
  // Upload and analyze error screenshot
  upload: protectedProcedure
    .input(z.object({
      imageBase64: z.string(),
      filename: z.string(),
      mimeType: z.string().optional(),
      gpId: z.number().optional(), // Optional GP ID for direct linking
    }))
    .mutation(async ({ ctx, input }) => {
      // Auto-detect month and year from current date
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      
      // Decode and upload image to S3
      const imageBuffer = Buffer.from(input.imageBase64, 'base64');
      const fileKey = `error-screenshots/${year}/${month}/${Date.now()}-${input.filename}`;
      const contentType = input.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      
      const { url: screenshotUrl } = await storagePut(fileKey, imageBuffer, contentType);
      
      // Use AI to analyze the error screenshot
      const analysisPrompt = `Analyze this error screenshot from a casino game presenter evaluation system.

Extract the following information:
1. GP Name (Game Presenter name) - the person who made the error
2. Error Type - classify as one of: dealing_error, procedure_error, game_rules_error, communication_error, appearance_error, technical_error, other
3. Error Category - more specific sub-category
4. Error Description - detailed description of what went wrong
5. Severity - classify as: low, medium, high, or critical
6. Game Type - if visible (e.g., Blackjack, Roulette, Baccarat)
7. Table ID - if visible
8. Error Date - if visible

Respond in JSON format:
{
"gpName": "string or null",
"errorType": "string",
"errorCategory": "string",
"errorDescription": "string",
"severity": "low|medium|high|critical",
"gameType": "string or null",
"tableId": "string or null",
"errorDate": "YYYY-MM-DD or null"
}`;

      const llmResponse = await invokeLLM({
        messages: [
          { role: 'system', content: 'You are an expert at analyzing casino game presenter error reports. Extract information accurately from screenshots.' },
          { 
            role: 'user', 
            content: [
              { type: 'text', text: analysisPrompt },
              { type: 'image_url', image_url: { url: `data:${contentType};base64,${input.imageBase64}` } }
            ]
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'error_analysis',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                gpName: { type: ['string', 'null'] },
                errorType: { type: 'string' },
                errorCategory: { type: 'string' },
                errorDescription: { type: 'string' },
                severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                gameType: { type: ['string', 'null'] },
                tableId: { type: ['string', 'null'] },
                errorDate: { type: ['string', 'null'] }
              },
              required: ['gpName', 'errorType', 'errorCategory', 'errorDescription', 'severity', 'gameType', 'tableId', 'errorDate'],
              additionalProperties: false
            }
          }
        }
      });

      let extractedData: any = {};
      try {
        const message = llmResponse?.choices?.[0]?.message;
        const content = message?.content;
        if (content) {
          extractedData = JSON.parse(typeof content === 'string' ? content : '{}');
        }
      } catch (e) {
        log.error('Failed to parse LLM response', e instanceof Error ? e : new Error(String(e)));
        // Continue with default empty data
      }

      // Use provided GP ID directly if available, otherwise try to match by name
      let gamePresenterId: number | null = input.gpId || null;
      let gpNameToUse: string | null = null;

      // User-scoped GP matching for data isolation
      const userGps = ctx.user.role !== 'admin' 
        ? await db.getAllGamePresentersByUser(ctx.user.id) 
        : await db.getAllGamePresenters();

      if (input.gpId) {
        // Get GP name from ID
        const gp = userGps.find(g => g.id === input.gpId);
        gpNameToUse = gp?.name || null;
      } else if (extractedData.gpName) {
        // Fallback to name matching
        gpNameToUse = extractedData.gpName;
        const matchedGp = userGps.find(gp => 
          gp.name.toLowerCase() === extractedData.gpName.toLowerCase() ||
          gp.name.toLowerCase().includes(extractedData.gpName.toLowerCase()) ||
          extractedData.gpName.toLowerCase().includes(gp.name.toLowerCase())
        );
        if (matchedGp) {
          gamePresenterId = matchedGp.id;
        }
      }

      // Derive month/year from the parsed errorDate so a screenshot
      // uploaded in April that depicts a March incident is filed under
      // March. Falls back to upload moment when no parseable errorDate.
      // `parseIsoDateLocal` interprets the OCR'd `YYYY-MM-DD` value as
      // local-day midnight rather than UTC — without that, a 1-Mar-2026
      // entry parsed on a US server would shift to Feb 28 and land in
      // the wrong monthly bucket.
      const parsedErrorDate = parseIsoDateLocal(extractedData.errorDate);
      const errorMonth = parsedErrorDate ? parsedErrorDate.getMonth() + 1 : month;
      const errorYear = parsedErrorDate ? parsedErrorDate.getFullYear() : year;

      // Save to database
      const errorScreenshot = await db.createErrorScreenshot({
        gamePresenterId,
        gpName: gpNameToUse || extractedData.gpName || 'Unknown',
        errorDate: parsedErrorDate,
        errorType: extractedData.errorType || 'other',
        errorCategory: extractedData.errorCategory || '',
        errorDescription: extractedData.errorDescription || '',
        severity: extractedData.severity || 'medium',
        gameType: extractedData.gameType || null,
        tableId: extractedData.tableId || null,
        screenshotUrl,
        screenshotKey: fileKey,
        rawExtractedData: extractedData,
        month: errorMonth,
        year: errorYear,
        uploadedById: ctx.user.id,
        processedAt: new Date(),
      });

      // Update monthly stats if GP was matched
      if (gamePresenterId) {
        await db.incrementGPMistakes(gamePresenterId, errorMonth, errorYear);
      }

      return {
        ...errorScreenshot,
        extractedData,
        gpMatched: !!gamePresenterId,
      };
    }),

  // List error screenshots for a month
  list: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2030),
      gamePresenterId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // User-based data isolation
      if (ctx.user.role !== 'admin') {
        return await db.getErrorScreenshotsByUser(input.month, input.year, ctx.user.id, input.gamePresenterId);
      }
      return await db.getErrorScreenshots(input.month, input.year, input.gamePresenterId);
    }),

  // Delete error screenshot
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // User-based data isolation
      if (ctx.user.role !== 'admin') {
        await db.deleteErrorScreenshotByUser(input.id, ctx.user.id);
      } else {
        await db.deleteErrorScreenshot(input.id);
      }
      return { success: true };
    }),

  // Get error statistics by type
  stats: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2030),
    }))
    .query(async ({ ctx, input }) => {
      // User-based data isolation
      if (ctx.user.role !== 'admin') {
        return await db.getErrorScreenshotStatsByUser(input.month, input.year, ctx.user.id);
      }
      return await db.getErrorScreenshotStats(input.month, input.year);
    }),
});
