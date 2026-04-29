import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { createLogger } from "../services/logger";
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

This is from a casino game presenter evaluation system. Screenshots can be one of two types:

1. **ATTITUDE** - Shows attitude/behavior entries with columns like:
 - Date, Type (POSITIVE/NEGATIVE), Comment, Score
 - Contains behavioral feedback like "late to studio", "wearing headphones", "good attitude"
 - Usually has +1 or -1 scores
 - May have GP name in header

2. **ERROR** - Shows game errors/incidents with:
 - Error codes like SC_BAC, SC_RO, SC_BJ
 - Technical descriptions like "Interface error", "Ball falls out", "Card misread"
 - Game-related incidents (voided rounds, technical issues)
 - System error reports

KEY INDICATORS:
- If you see error codes (SC_XXX), technical terms, "System Void", "Interface error" → ERROR
- If you see behavioral comments, attitude feedback, personal conduct issues → ATTITUDE

Respond with JSON:
{
"screenshotType": "ATTITUDE" or "ERROR",
"confidence": 0.0-1.0,
"reason": "Brief explanation of why this type was detected"
}`;

      const detectionResponse = await invokeLLM({
        messages: [
          { role: 'system', content: 'You are an expert at classifying casino evaluation screenshots. Distinguish between attitude/behavior feedback and game error reports.' },
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
                screenshotType: { type: 'string', enum: ['ATTITUDE', 'ERROR'] },
                confidence: { type: 'number' },
                reason: { type: 'string' }
              },
              required: ['screenshotType', 'confidence', 'reason'],
              additionalProperties: false
            }
          }
        }
      });

      let detectedType = 'ATTITUDE';
      let detectionConfidence = 0.5;
      let detectionReason = 'Default';
      
      try {
        const message = detectionResponse?.choices?.[0]?.message;
        const content = message?.content;
        if (content) {
          const detection = JSON.parse(typeof content === 'string' ? content : '{}');
          detectedType = detection.screenshotType || 'ATTITUDE';
          detectionConfidence = detection.confidence || 0.5;
          detectionReason = detection.reason || '';
        }
      } catch (e) {
        log.error('Failed to parse detection response', e instanceof Error ? e : new Error(String(e)));
      }

      // Now process based on detected type
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

        const errorScreenshot = await db.createErrorScreenshot({
          gamePresenterId,
          gpName: gpNameToUse || extractedData.gpName || 'Unknown',
          errorDate: extractedData.errorDate ? new Date(extractedData.errorDate) : null,
          errorType: extractedData.errorType || 'other',
          errorCategory: extractedData.errorCategory || '',
          errorDescription: extractedData.errorDescription || '',
          severity: extractedData.severity || 'medium',
          gameType: extractedData.gameType || null,
          tableId: extractedData.tableId || null,
          screenshotUrl,
          screenshotKey: fileKey,
          rawExtractedData: extractedData,
          month,
          year,
          uploadedById: ctx.user.id,
          processedAt: new Date(),
        });

        if (gamePresenterId) {
          await db.incrementGPMistakes(gamePresenterId, month, year);
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
      } else {
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
        
        for (const entry of entries) {
          const attitudeScreenshot = await db.createAttitudeScreenshot({
            gamePresenterId,
            evaluationId: null,
            gpName: gpNameToUse || 'Unknown',
            evaluationDate: entry.date ? new Date(entry.date.replace(/^(\d+)\s+(\w+)\s+(\d+),?\s*(\d+:\d+)?$/, (_: string, d: string, m: string, y: string, t: string) => {
              const months: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
              return `${y}-${months[m] || '01'}-${d.padStart(2, '0')}${t ? 'T' + t : ''}`;
            })) : null,
            attitudeType: entry.type?.toLowerCase() === 'positive' ? 'positive' : 'negative',
            attitudeScore: entry.score || (entry.type === 'POSITIVE' ? 1 : -1),
            attitudeCategory: entry.type?.toLowerCase() === 'positive' ? 'positive' : 'negative',
            comment: entry.comment || '',
            description: entry.comment || '',
            evaluatorName: null,
            screenshotUrl,
            screenshotKey: fileKey,
            rawExtractedData: entry,
            month,
            year,
            uploadedById: ctx.user.id,
            processedAt: new Date(),
          });
          savedEntries.push(attitudeScreenshot);
        }

        if (gamePresenterId && entries.length > 0) {
          // Use cumulative +1/-1 system consistent with attitudeScreenshot.upload
          const totalScore = entries.reduce((sum: number, e: any) => sum + (e.score || (e.type === 'POSITIVE' ? 1 : -1)), 0);
          await db.updateGPAttitude(gamePresenterId, month, year, totalScore);
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
