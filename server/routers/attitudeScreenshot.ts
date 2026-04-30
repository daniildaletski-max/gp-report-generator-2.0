import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { createLogger } from "../services/logger";
const log = createLogger("Router");

/**
 * Parse an OCR'd attitude entry date like "3 Jan 2026, 21:00" or
 * "3 Jan 2026" into a JS Date. Returns null when the string is
 * missing or doesn't match the expected layout — callers should
 * fall back to the upload moment in that case.
 *
 * Exported so smartUpload's ATTITUDE branch can reuse the same
 * parser and stay consistent with this router's behaviour.
 */
const ATTITUDE_DATE_RE = /^(\d+)\s+(\w+)\s+(\d+),?\s*(\d+:\d+)?$/;
const MONTH_NAME_TO_NUM: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};
export function parseAttitudeEntryDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const m = raw.match(ATTITUDE_DATE_RE);
  if (!m) return null;
  const [, d, monName, y, t] = m;
  const monNum = MONTH_NAME_TO_NUM[monName];
  if (!monNum) return null;
  const isoLike = `${y}-${monNum}-${d.padStart(2, "0")}${t ? `T${t}` : ""}`;
  const parsed = new Date(isoLike);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const attitudeScreenshotRouter = router({
  // Upload and analyze attitude screenshot
  upload: protectedProcedure
    .input(z.object({
      imageBase64: z.string(),
      filename: z.string(),
      mimeType: z.string().optional(),
      gpName: z.string().optional(), // Optional GP name if known
      gpId: z.number().optional(), // Optional GP ID for direct linking
    }))
    .mutation(async ({ ctx, input }) => {
      // Auto-detect month and year from current date
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      
      // Decode and upload image to S3
      const imageBuffer = Buffer.from(input.imageBase64, 'base64');
      const fileKey = `attitude-screenshots/${year}/${month}/${Date.now()}-${input.filename}`;
      const contentType = input.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      
      const { url: screenshotUrl } = await storagePut(fileKey, imageBuffer, contentType);
      
      // Use AI to analyze the attitude screenshot - extract ALL entries
      const analysisPrompt = `Analyze this attitude evaluation screenshot from a casino game presenter evaluation system.

This screenshot shows an attitude entry table with columns: Date, Type (POSITIVE/NEGATIVE), Comment, Score.

IMPORTANT: Extract ALL attitude entries visible in the screenshot, not just one.

For EACH entry in the table, extract:
1. Date - the date and time of the entry (e.g., "3 Jan 2026, 21:00")
2. Type - POSITIVE or NEGATIVE (look for badges/labels)
3. Comment - the full text description
4. Score - the score value (+1 for positive, -1 for negative)

Also look for the GP Name (Game Presenter name) in the page header, title, or breadcrumb.

Respond with a JSON object containing an array of ALL entries found:
{
"gpName": "string or null - the Game Presenter name from header/title",
"entries": [
  {
    "date": "3 Jan 2026, 21:00",
    "type": "NEGATIVE",
    "comment": "Was late to the studio...",
    "score": -1
  }
],
"totalEntries": number,
"totalNegative": number,
"totalPositive": number
}`;

      const llmResponse = await invokeLLM({
        messages: [
          { role: 'system', content: 'You are an expert at analyzing casino game presenter attitude evaluations. Extract ALL entries from screenshots accurately. Return data as a JSON array.' },
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
            name: 'attitude_analysis',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                gpName: { type: ['string', 'null'], description: 'Game Presenter name from header/title' },
                entries: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string', description: 'Date and time of entry' },
                      type: { type: 'string', enum: ['POSITIVE', 'NEGATIVE'], description: 'Entry type' },
                      comment: { type: 'string', description: 'Full comment text' },
                      score: { type: 'integer', description: '+1 or -1' }
                    },
                    required: ['date', 'type', 'comment', 'score'],
                    additionalProperties: false
                  }
                },
                totalEntries: { type: 'integer' },
                totalNegative: { type: 'integer' },
                totalPositive: { type: 'integer' }
              },
              required: ['gpName', 'entries', 'totalEntries', 'totalNegative', 'totalPositive'],
              additionalProperties: false
            }
          }
        }
      });

      let extractedData: any = { gpName: null, entries: [], totalEntries: 0, totalNegative: 0, totalPositive: 0 };
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
      } else {
        // Fallback to name matching
        gpNameToUse = input.gpName || extractedData.gpName;
        if (gpNameToUse) {
          const matchedGp = userGps.find(gp => 
            gp.name.toLowerCase() === gpNameToUse!.toLowerCase() ||
            gp.name.toLowerCase().includes(gpNameToUse!.toLowerCase()) ||
            gpNameToUse!.toLowerCase().includes(gp.name.toLowerCase())
          );
          if (matchedGp) {
            gamePresenterId = matchedGp.id;
          }
        }
      }

      // Save each attitude entry to database. Each row gets its
      // own month/year derived from the parsed `entry.date` so an
      // April-uploaded screenshot containing March entries is filed
      // under March, not April. Falls back to the upload moment only
      // when the OCR returned no parseable date.
      const savedEntries: any[] = [];
      const entries = extractedData.entries || [];

      for (const entry of entries) {
        const parsedDate = parseAttitudeEntryDate(entry.date);
        const entryMonth = parsedDate ? parsedDate.getMonth() + 1 : month;
        const entryYear = parsedDate ? parsedDate.getFullYear() : year;
        const attitudeScreenshot = await db.createAttitudeScreenshot({
          gamePresenterId,
          evaluationId: null,
          gpName: gpNameToUse || 'Unknown',
          evaluationDate: parsedDate,
          attitudeType: entry.type?.toLowerCase() === 'positive' ? 'positive' : 'negative',
          attitudeScore: entry.score || (entry.type === 'POSITIVE' ? 1 : -1),
          attitudeCategory: entry.type?.toLowerCase() === 'positive' ? 'positive' : 'negative',
          comment: entry.comment || '',
          description: entry.comment || '',
          evaluatorName: null,
          screenshotUrl,
          screenshotKey: fileKey,
          rawExtractedData: entry,
          month: entryMonth,
          year: entryYear,
          uploadedById: ctx.user.id,
          processedAt: new Date(),
        });
        savedEntries.push(attitudeScreenshot);
      }

      // Update monthly stats if GP was matched - cumulative +1/-1 system
      if (gamePresenterId && entries.length > 0) {
        // Sum all attitude scores from entries (+1 for positive, -1 for negative)
        const totalScore = entries.reduce((sum: number, e: any) => sum + (e.score || 0), 0);
        // Add cumulative score to GP's monthly attitude
        await db.updateGPAttitude(gamePresenterId, month, year, totalScore);
      }

      return {
        screenshotUrl,
        screenshotKey: fileKey,
        extractedData,
        gpName: gpNameToUse,
        gpMatched: !!gamePresenterId,
        gamePresenterId,
        entriesCount: entries.length,
        savedEntries,
      };
    }),

  // List attitude screenshots for a month
  list: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2030),
      gamePresenterId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // User-based data isolation
      if (ctx.user.role !== 'admin') {
        return await db.getAttitudeScreenshotsByUser(input.month, input.year, ctx.user.id, input.gamePresenterId);
      }
      return await db.getAttitudeScreenshots(input.month, input.year, input.gamePresenterId);
    }),

  // List all attitude screenshots with optional filters
  listAll: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12).optional(),
      year: z.number().min(2020).max(2030).optional(),
      gamePresenterId: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const month = input?.month;
      const year = input?.year;
      const gpId = input?.gamePresenterId;
      
      // User-based data isolation
      let allEntries;
      let gps;
      if (ctx.user.role !== 'admin') {
        allEntries = await db.getAllAttitudeScreenshotsByUser(ctx.user.id, month, year, gpId);
        gps = await db.getAllGamePresentersByUser(ctx.user.id);
      } else {
        allEntries = await db.getAllAttitudeScreenshots(month, year, gpId);
        gps = await db.getAllGamePresenters();
      }
      
      const gpMap = new Map(gps.map(gp => [gp.id, gp]));
      
      return allEntries.map(entry => ({
        ...entry,
        gamePresenter: entry.gamePresenterId ? gpMap.get(entry.gamePresenterId) || null : null,
      }));
    }),

  // Delete attitude screenshot
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // User-based data isolation
      if (ctx.user.role !== 'admin') {
        await db.deleteAttitudeScreenshotByUser(input.id, ctx.user.id);
      } else {
        await db.deleteAttitudeScreenshot(input.id);
      }
      return { success: true };
    }),
});
