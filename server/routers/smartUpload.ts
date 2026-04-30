import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { createLogger } from "../services/logger";
import { extractEvaluationFromImage, parseEvaluationDate } from "./_shared";
import { parseAttitudeEntryDate } from "./attitudeScreenshot";
import { parseIsoDateLocal } from "../db/_dateRange";
import { nanoid } from "nanoid";
const log = createLogger("Router");

export const smartUploadRouter = router({
  // Analyze and upload screenshot with auto-detection
  upload: protectedProcedure
    .input(z.object({
      imageBase64: z.string(),
      filename: z.string(),
      mimeType: z.string().optional(),
      gpId: z.number().optional(),
      gpName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const contentType = input.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      
      // First, detect the screenshot type using AI
      const detectionPrompt = `Analyze this screenshot and determine its type.

This is from a casino game presenter evaluation system. Screenshots can be one of three types:

1. **EVALUATION** - A scored evaluation form for a Game Presenter with:
 - Category scores like Hair, Makeup, Outfit, Posture (each /3 max)
 - Dealing Style and Game Performance scores (each /5 max)
 - Numeric values in "X/Y" format (e.g. "2/3", "4/5")
 - Often a total score (e.g. "18/22")
 - Comments under each category
 - GP name + evaluator name + date in the header
 - Looks like a structured rubric / scorecard, not a chronological list

2. **ATTITUDE** - Shows attitude/behavior entries with columns like:
 - Date, Type (POSITIVE/NEGATIVE), Comment, Score
 - Contains behavioral feedback like "late to studio", "wearing headphones", "good attitude"
 - Usually has +1 or -1 scores
 - May have GP name in header
 - Looks like a chronological list/table of feedback events

3. **ERROR** - Shows game errors/incidents with:
 - Error codes like SC_BAC, SC_RO, SC_BJ
 - Technical descriptions like "Interface error", "Ball falls out", "Card misread"
 - Game-related incidents (voided rounds, technical issues)
 - System error reports

KEY INDICATORS:
- If you see a structured scorecard with categories like Hair/Makeup/Outfit/Dealing Style → EVALUATION
- If you see error codes (SC_XXX), technical terms, "System Void", "Interface error" → ERROR
- If you see chronological behavioral comments with +1/-1 scores → ATTITUDE

Respond with JSON:
{
"screenshotType": "EVALUATION" or "ATTITUDE" or "ERROR",
"confidence": 0.0-1.0,
"reason": "Brief explanation of why this type was detected"
}`;

      const detectionResponse = await invokeLLM({
        messages: [
          { role: 'system', content: 'You are an expert at classifying casino evaluation screenshots. Distinguish between scored evaluations, attitude/behavior feedback, and game error reports.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: detectionPrompt },
              { type: 'image_url', image_url: { url: `data:${contentType};base64,${input.imageBase64}` } }
            ]
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'screenshot_detection',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                screenshotType: { type: 'string', enum: ['EVALUATION', 'ATTITUDE', 'ERROR'] },
                confidence: { type: 'number' },
                reason: { type: 'string' }
              },
              required: ['screenshotType', 'confidence', 'reason'],
              additionalProperties: false
            }
          }
        }
      });

      let detectedType = 'EVALUATION';
      let detectionConfidence = 0.5;
      let detectionReason = 'Default';
      
      try {
        const message = detectionResponse?.choices?.[0]?.message;
        const content = message?.content;
        if (content) {
          const detection = JSON.parse(typeof content === 'string' ? content : '{}');
          detectedType = detection.screenshotType || 'EVALUATION';
          detectionConfidence = detection.confidence || 0.5;
          detectionReason = detection.reason || '';
        }
      } catch (e) {
        log.error('Failed to parse detection response', e instanceof Error ? e : new Error(String(e)));
      }

      // Now process based on detected type
      if (detectedType === 'EVALUATION') {
        // Mirror evaluation.uploadAndExtract — extract the rubric, find or
        // create the GP, persist a full Evaluation row.
        const fileKey = `evaluations/${ctx.user.id}/${nanoid()}-${db.sanitizeString(input.filename, 100)}`;
        const buffer = Buffer.from(input.imageBase64, 'base64');
        const { url: imageUrl } = await storagePut(fileKey, buffer, contentType);

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
          userId: ctx.user.id,
        });

        return {
          type: 'EVALUATION' as const,
          detectedType,
          detectionConfidence,
          detectionReason,
          screenshotUrl: imageUrl,
          screenshotKey: fileKey,
          extractedData,
          gpName: gp.name,
          gpMatched: true,
          gamePresenterId: gp.id,
          entriesCount: 1,
          savedEntries: [evaluation],
        };
      }

      if (detectedType === 'ERROR') {
        // Process as error screenshot
        const imageBuffer = Buffer.from(input.imageBase64, 'base64');
        const fileKey = `error-screenshots/${year}/${month}/${Date.now()}-${input.filename}`;
        const { url: screenshotUrl } = await storagePut(fileKey, imageBuffer, contentType);

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
        }

        let gamePresenterId: number | null = input.gpId || null;
        let gpNameToUse: string | null = null;

        // User-scoped GP matching for data isolation
        const userGps = ctx.user.role !== 'admin' 
          ? await db.getAllGamePresentersByUser(ctx.user.id) 
          : await db.getAllGamePresenters();

        if (input.gpId) {
          const gp = userGps.find(g => g.id === input.gpId);
          gpNameToUse = gp?.name || null;
        } else if (extractedData.gpName) {
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
        // March. Falls back to upload moment when no errorDate.
        // `parseIsoDateLocal` keeps the day in local time so a 1-Mar-2026
        // OCR string isn't shifted to Feb 28 on negative-offset servers.
        const parsedErrorDate = parseIsoDateLocal(extractedData.errorDate);
        const errorMonth = parsedErrorDate ? parsedErrorDate.getMonth() + 1 : month;
        const errorYear = parsedErrorDate ? parsedErrorDate.getFullYear() : year;

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

        if (gamePresenterId) {
          await db.incrementGPMistakes(gamePresenterId, errorMonth, errorYear);
        }

        return {
          type: 'ERROR' as const,
          detectedType,
          detectionConfidence,
          detectionReason,
          screenshotUrl,
          screenshotKey: fileKey,
          extractedData,
          gpName: gpNameToUse,
          gpMatched: !!gamePresenterId,
          gamePresenterId,
          entriesCount: 1,
          savedEntries: [errorScreenshot],
        };
      }

      // Default: ATTITUDE
      {
        // Process as attitude screenshot
        const imageBuffer = Buffer.from(input.imageBase64, 'base64');
        const fileKey = `attitude-screenshots/${year}/${month}/${Date.now()}-${input.filename}`;
        const { url: screenshotUrl } = await storagePut(fileKey, imageBuffer, contentType);

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
        }

        let gamePresenterId: number | null = input.gpId || null;
        let gpNameToUse: string | null = null;

        // User-scoped GP matching for data isolation
        const userGps = ctx.user.role !== 'admin' 
          ? await db.getAllGamePresentersByUser(ctx.user.id) 
          : await db.getAllGamePresenters();

        if (input.gpId) {
          const gp = userGps.find(g => g.id === input.gpId);
          gpNameToUse = gp?.name || null;
        } else {
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

        const savedEntries: any[] = [];
        const entries = extractedData.entries || [];
        // Bucket scores by (entryYear, entryMonth) so the monthly
        // aggregate moves with the row rather than the upload moment —
        // matches attitudeScreenshot.upload behaviour exactly.
        const scoreByMonth = new Map<string, { month: number; year: number; total: number }>();

        for (const entry of entries) {
          // Use the parsed entry date for both `evaluationDate` AND
          // `month`/`year`, so an April-uploaded screenshot containing
          // March entries is filed under March. Falls back to the
          // upload moment when OCR returned nothing parseable.
          const parsedDate = parseAttitudeEntryDate(entry.date);
          const entryMonth = parsedDate ? parsedDate.getMonth() + 1 : month;
          const entryYear = parsedDate ? parsedDate.getFullYear() : year;
          const score = entry.score || (entry.type === 'POSITIVE' ? 1 : -1);
          const attitudeScreenshot = await db.createAttitudeScreenshot({
            gamePresenterId,
            evaluationId: null,
            gpName: gpNameToUse || 'Unknown',
            evaluationDate: parsedDate,
            attitudeType: entry.type?.toLowerCase() === 'positive' ? 'positive' : 'negative',
            attitudeScore: score,
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
          const key = `${entryYear}-${entryMonth}`;
          const bucket = scoreByMonth.get(key);
          if (bucket) bucket.total += score;
          else scoreByMonth.set(key, { month: entryMonth, year: entryYear, total: score });
        }

        if (gamePresenterId) {
          for (const { month: bm, year: by, total } of Array.from(scoreByMonth.values())) {
            if (total !== 0) await db.updateGPAttitude(gamePresenterId, bm, by, total);
          }
        }

        return {
          type: 'ATTITUDE' as const,
          detectedType,
          detectionConfidence,
          detectionReason,
          screenshotUrl,
          screenshotKey: fileKey,
          extractedData,
          gpName: gpNameToUse,
          gpMatched: !!gamePresenterId,
          gamePresenterId,
          entriesCount: entries.length,
          savedEntries,
        };
      }
    }),
});
