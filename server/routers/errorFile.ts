import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import ExcelJS from "exceljs";
import { createLogger } from "../services/logger";
const log = createLogger("Router");

export const errorFileRouter = router({
  upload: protectedProcedure
    .input(z.object({
      fileBase64: z.string(),
      filename: z.string(),
      month: z.number().min(1).max(12),
      year: z.number(),
      errorType: z.enum(["playgon", "mg"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if an error file already exists for this month/year/type
      const existingFile = await db.getErrorFileByMonthYearType(input.month, input.year, input.errorType, ctx.user.id);
      let replacedFileId: number | null = null;
      
      if (existingFile) {
        // Delete existing file and its error records before uploading new one
        // Pass errorFileId to only delete errors from this specific file type
        await db.deleteGpErrorsByMonthYear(input.month, input.year, ctx.user.id, existingFile.id);
        if (ctx.user.role !== 'admin') {
          await db.deleteErrorFileByUser(existingFile.id, ctx.user.id);
        } else {
          await db.deleteErrorFile(existingFile.id);
        }
        replacedFileId = existingFile.id;
        log.info(` Replacing existing file #${existingFile.id} for ${input.errorType} ${input.month}/${input.year}`);
      }

      // Upload file to S3
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `error-files/${input.year}/${input.month}/${input.errorType}-${nanoid()}.xlsx`;
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      // Parse Excel file to extract GP errors from "Error Count" sheet
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer as any);
      
      const gpErrorCounts: Record<string, number> = {};
      const gpErrorDetails: Record<string, Array<{ date?: Date; description?: string; errorCode?: string; gameType?: string; tableId?: string }>> = {};
      let totalErrorsCount = 0;

      // Helper to extract cell value
      const getCellValue = (cell: any): string | null => {
        if (!cell.value) return null;
        if (typeof cell.value === 'string') return cell.value.trim();
        if (typeof cell.value === 'object' && 'text' in cell.value) return (cell.value as any).text?.trim();
        if (typeof cell.value === 'object' && 'result' in cell.value) {
          const result = (cell.value as any).result;
          return typeof result === 'string' ? result.trim() : String(result);
        }
        return String(cell.value).trim();
      };

      const getNumericValue = (cell: any): number => {
        if (cell.value === null || cell.value === undefined) return 0;
        if (typeof cell.value === 'number') return Math.round(cell.value);
        if (typeof cell.value === 'object' && 'result' in cell.value) {
          const result = (cell.value as any).result;
          return typeof result === 'number' ? Math.round(result) : 0;
        }
        const parsed = parseInt(String(cell.value), 10);
        return isNaN(parsed) ? 0 : parsed;
      };

      const isValidGpName = (name: string | null): boolean => {
        if (!name || name.length === 0 || name.startsWith('=')) return false;
        if (['GP Name', 'Name', 'Total', 'Grand Total'].includes(name)) return false;
        return /^[A-Za-z\u00C0-\u024F\s'-]+$/.test(name) && name.length < 100;
      };

      // PRIMARY SOURCE: "Error Count Analysis" sheet - column E has error counts EXCLUDING technical errors
      // This is the authoritative source for error counts
      const errorCountAnalysisSheet = workbook.getWorksheet('Error Count Analysis');
      if (errorCountAnalysisSheet) {
        log.info(' Using "Error Count Analysis" sheet (column C=name, column E=errors) as primary error count source (excludes technical errors)');
        errorCountAnalysisSheet.eachRow((row, rowNumber) => {
          if (rowNumber < 2) return; // Skip header
          
          const gpName = getCellValue(row.getCell(3)); // Column C - Employee Name (NOT column B which is Work load)
          const errorCount = getNumericValue(row.getCell(5)); // Column E - Error count excluding technical errors
          
          if (!isValidGpName(gpName)) return;
          
          gpErrorCounts[gpName!] = errorCount;
          totalErrorsCount += errorCount;
        });
      } else {
        // Fallback: try "Error Count" sheet (column D) if "Error Count Analysis" doesn't exist
        const errorCountSheet = workbook.getWorksheet('Error Count');
        if (errorCountSheet) {
          log.info(' Fallback: Using "Error Count" sheet (column D) - "Error Count Analysis" sheet not found');
          errorCountSheet.eachRow((row, rowNumber) => {
            if (rowNumber < 2) return; // Skip header
            
            const gpName = getCellValue(row.getCell(2)); // Column B
            const errorCount = getNumericValue(row.getCell(4)); // Column D
            
            if (!isValidGpName(gpName)) return;
            
            gpErrorCounts[gpName!] = errorCount;
            totalErrorsCount += errorCount;
          });
        }
      }

      // SECONDARY: Parse "Errors" sheet for error DETAILS only (descriptions, codes, dates)
      // These details are stored for reference but do NOT affect the error count
      const errorsSheet = workbook.getWorksheet('Errors');
      if (errorsSheet) {
        let headerRow = 2;
        let gpNameCol = 2;
        let dateCol = 4;
        let descCol = 11;
        let codeCol = 9;
        let gameTypeCol = 10;
        let tableIdCol = 6;
        
        // Auto-detect column positions from headers
        for (let r = 1; r <= 3; r++) {
          const row = errorsSheet.getRow(r);
          row.eachCell((cell, colNumber) => {
            const val = getCellValue(cell)?.toLowerCase() || '';
            if (val === 'gp name' || (val.includes('gp') && val.includes('name'))) { gpNameCol = colNumber; headerRow = r; }
            else if (val === 'date') { dateCol = colNumber; }
            else if (val === 'error description' || val.includes('error description')) { descCol = colNumber; }
            else if (val === 'error code' || val.includes('error code')) { codeCol = colNumber; }
            else if (val === 'game type' || (val.includes('game') && val.includes('type'))) { gameTypeCol = colNumber; }
            else if (val === 'table id' || val.includes('table id')) { tableIdCol = colNumber; }
          });
        }
        
        log.debug(` Detected columns - Header row: ${headerRow}, GP Name: ${gpNameCol}, Date: ${dateCol}, Description: ${descCol}, Code: ${codeCol}, Game Type: ${gameTypeCol}, Table ID: ${tableIdCol}`);
        
        // Parse error records for DETAILS only (not for counting)
        errorsSheet.eachRow((row, rowNumber) => {
          if (rowNumber <= headerRow) return;
          
          const gpName = getCellValue(row.getCell(gpNameCol));
          if (!isValidGpName(gpName)) return;
          
          const errorDetail: { date?: Date; description?: string; errorCode?: string; gameType?: string; tableId?: string } = {};
          
          const dateCell = row.getCell(dateCol);
          if (dateCell.value instanceof Date) {
            errorDetail.date = dateCell.value;
          } else if (typeof dateCell.value === 'number') {
            errorDetail.date = new Date((dateCell.value - 25569) * 86400 * 1000);
          } else if (typeof dateCell.value === 'string') {
            const dateStr = dateCell.value.trim();
            if (dateStr.includes('.')) {
              const parts = dateStr.split('.');
              if (parts.length === 3) {
                const [day, month, year] = parts.map(p => parseInt(p, 10));
                errorDetail.date = new Date(year, month - 1, day);
              }
            } else if (dateStr.includes('-')) {
              errorDetail.date = new Date(dateStr);
            }
          }
          
          errorDetail.description = getCellValue(row.getCell(descCol)) || undefined;
          errorDetail.errorCode = getCellValue(row.getCell(codeCol)) || undefined;
          errorDetail.gameType = getCellValue(row.getCell(gameTypeCol)) || undefined;
          errorDetail.tableId = getCellValue(row.getCell(tableIdCol)) || undefined;
          
          // Store details only - do NOT increment gpErrorCounts here
          if (!gpErrorDetails[gpName!]) gpErrorDetails[gpName!] = [];
          gpErrorDetails[gpName!].push(errorDetail);
        });
      }

      // Save error file to database
      const errorFile = await db.createErrorFile({
        fileName: input.filename,
        fileUrl,
        fileKey,
        month: input.month,
        year: input.year,
        fileType: input.errorType,
        uploadedById: ctx.user.id,
        userId: ctx.user.id, // Data isolation
      });

      // Note: We only delete errors when replacing an existing file (handled above with errorFileId filter).
      // We do NOT delete all errors for this month/year when uploading a new file type,
      // as that would wipe out errors from the other error type (playgon vs MG).
      
      // Update GP mistakes directly from parsed error counts
      const notFoundGPs: string[] = [];
      const updatedGPs: string[] = [];
      const createdErrorRecords: number[] = [];
      
      for (const [gpName, count] of Object.entries(gpErrorCounts)) {
        // Find GP by name and update their mistakes count
        const updated = await db.updateGPMistakesDirectly(gpName, count, input.month, input.year, ctx.user.id);
        if (updated) {
          updatedGPs.push(gpName);
        } else {
          notFoundGPs.push(gpName);
        }
        
        // Create individual error records with descriptions if available
        const details = gpErrorDetails[gpName] || [];
        if (details.length > 0) {
          // Create individual error records with full details
          for (const detail of details) {
            const errorRecord = await db.createGpError({
              gpName,
              errorFileId: errorFile.id,
              errorDate: detail.date || new Date(input.year, input.month - 1, 15),
              errorDescription: detail.description,
              errorCode: detail.errorCode,
              gameType: detail.gameType,
              tableId: detail.tableId,
              userId: ctx.user.id, // Data isolation
            });
            createdErrorRecords.push(errorRecord.id);
          }
        } else if (count > 0) {
          // Fallback: create summary record without details
          const errorRecord = await db.createGpError({
            gpName,
            errorFileId: errorFile.id,
            errorDate: new Date(input.year, input.month - 1, 15),
            errorDescription: `${count} error(s) recorded`,
            userId: ctx.user.id, // Data isolation
          });
          createdErrorRecords.push(errorRecord.id);
        }
      }

      return { 
        ...errorFile, 
        parsedErrors: totalErrorsCount, 
        gpErrorCounts,
        gpErrorDetails,
        updatedGPs,
        notFoundGPs,
        createdErrorRecords: createdErrorRecords.length,
        replacedFileId,
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    // User-based data isolation: each user sees only their own error files
    if (ctx.user.role !== 'admin') {
      return await db.getErrorFilesByUser(ctx.user.id);
    }
    return await db.getAllErrorFiles();
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // User-based data isolation
      if (ctx.user.role !== 'admin') {
        await db.deleteErrorFileByUser(input.id, ctx.user.id);
      } else {
        await db.deleteErrorFile(input.id);
      }
      return { success: true };
    }),

  // Recalculate error counts from stored Excel files
  // Re-downloads and re-parses "Error Count Analysis" sheet column E
  recalculate: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ExcelJS = await import('exceljs');
      
      // Get all error files for this month/year belonging to the user
      const allFiles = ctx.user.role === 'admin' 
        ? await db.getAllErrorFiles()
        : await db.getErrorFilesByUser(ctx.user.id);
      
      const monthFiles = allFiles.filter(f => f.month === input.month && f.year === input.year);
      
      if (monthFiles.length === 0) {
        return { success: false, message: 'No error files found for this month/year', recalculated: 0 };
      }

      const gpErrorCounts: Record<string, number> = {};
      let filesProcessed = 0;

      const getCellValue = (cell: any): string | null => {
        if (!cell || cell.value === null || cell.value === undefined) return null;
        if (typeof cell.value === 'object' && 'result' in cell.value) return String(cell.value.result);
        return String(cell.value).trim();
      };
      const getNumericValue = (cell: any): number => {
        if (!cell || cell.value === null || cell.value === undefined) return 0;
        const val = typeof cell.value === 'object' && 'result' in cell.value ? cell.value.result : cell.value;
        const num = Number(val);
        return isNaN(num) ? 0 : num;
      };
      const isValidGpName = (name: string | null): boolean => {
        if (!name || name.length < 2 || name.length > 100) return false;
        return /^[A-Za-z\u00C0-\u024F\s'-]+$/.test(name);
      };

      for (const file of monthFiles) {
        if (!file.fileUrl) continue;
        
        try {
          // Download file from S3
          const response = await fetch(file.fileUrl);
          if (!response.ok) {
            log.warn(`Failed to download error file ${file.id}: ${response.status}`);
            continue;
          }
          const buffer = Buffer.from(await response.arrayBuffer());

          const workbook = new ExcelJS.default.Workbook();
          // Cast: Node 22+ types Buffer.from(arrayBuffer) as Buffer<ArrayBuffer>,
          // but ExcelJS's xlsx.load() declares the legacy Buffer type. Structurally
          // compatible at runtime; same cast pattern used at line 1973.
          await workbook.xlsx.load(buffer as any);
          
          // PRIMARY: "Error Count Analysis" sheet column E
          const errorCountAnalysisSheet = workbook.getWorksheet('Error Count Analysis');
          if (errorCountAnalysisSheet) {
            errorCountAnalysisSheet.eachRow((row: any, rowNumber: number) => {
              if (rowNumber < 2) return;
              const gpName = getCellValue(row.getCell(3)); // Column C - Employee Name
              const errorCount = getNumericValue(row.getCell(5));
              if (!isValidGpName(gpName)) return;
              // Accumulate (don't overwrite) in case multiple files have same GP
              gpErrorCounts[gpName!] = (gpErrorCounts[gpName!] || 0) + errorCount;
            });
            filesProcessed++;
          } else {
            // Fallback: "Error Count" sheet column D
            const errorCountSheet = workbook.getWorksheet('Error Count');
            if (errorCountSheet) {
              errorCountSheet.eachRow((row: any, rowNumber: number) => {
                if (rowNumber < 2) return;
                const gpName = getCellValue(row.getCell(2));
                const errorCount = getNumericValue(row.getCell(4));
                if (!isValidGpName(gpName)) return;
                gpErrorCounts[gpName!] = (gpErrorCounts[gpName!] || 0) + errorCount;
              });
              filesProcessed++;
            }
          }
        } catch (err) {
          log.error(`Error re-parsing file ${file.id}`, err instanceof Error ? err : new Error(String(err)));
        }
      }

      // Update monthlyGpStats.mistakes with recalculated counts
      const updatedGPs: string[] = [];
      const notFoundGPs: string[] = [];
      
      for (const [gpName, count] of Object.entries(gpErrorCounts)) {
        const updated = await db.updateGPMistakesDirectly(gpName, count, input.month, input.year, ctx.user.id);
        if (updated) {
          updatedGPs.push(gpName);
        } else {
          notFoundGPs.push(gpName);
        }
      }

      log.info(`Recalculated error counts for ${input.month}/${input.year}: ${updatedGPs.length} GPs updated, ${notFoundGPs.length} not found`);

      return {
        success: true,
        filesProcessed,
        totalFiles: monthFiles.length,
        gpErrorCounts,
        updatedGPs,
        notFoundGPs,
        recalculated: updatedGPs.length,
      };
    }),

  /**
   * Drop every `gpErrors` row whose `errorFileId` no longer points to
   * an existing `errorFiles` row. Earlier versions of `deleteErrorFile`
   * didn't cascade, so deleting an old monthly upload left its
   * gpErrors as orphans that kept counting in GP portal mistake
   * totals. This procedure cleans them up; admins see all orphans,
   * non-admin FMs see only their own.
   */
  pruneOrphans: protectedProcedure.mutation(async ({ ctx }) => {
    const removed = await db.pruneOrphanGpErrors(ctx.user.role === "admin" ? undefined : ctx.user.id);
    return { removed };
  }),

  /**
   * Re-import an existing errorFile from S3.
   *
   * Use case: data drift. An earlier deploy bug deleted the
   * `gpErrors` rows for a month, but the source `.xlsx` is still in
   * S3 (the FM doesn't have to re-upload). This procedure downloads
   * that file, re-parses both the `Error Count Analysis` and `Errors`
   * sheets, drops every gpErrors row tied to this errorFile, and
   * re-creates them — so the GP Portal repopulates with correct
   * mistake counts in one click.
   */
  reprocess: protectedProcedure
    .input(z.object({ errorFileId: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const ExcelJS = await import('exceljs');

      const allFiles = ctx.user.role === "admin"
        ? await db.getAllErrorFiles()
        : await db.getErrorFilesByUser(ctx.user.id);
      const file = allFiles.find(f => f.id === input.errorFileId);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Error file not found or access denied" });
      if (!file.fileUrl) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Error file has no source URL" });

      // Download from S3
      const response = await fetch(file.fileUrl);
      if (!response.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to download error file: HTTP ${response.status}` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      const workbook = new ExcelJS.default.Workbook();
      await workbook.xlsx.load(buffer as any);

      // Same helper functions as `upload`
      const getCellValue = (cell: any): string | null => {
        if (!cell || cell.value === null || cell.value === undefined) return null;
        if (typeof cell.value === 'object' && 'result' in cell.value) return String(cell.value.result);
        return String(cell.value).trim();
      };
      const getNumericValue = (cell: any): number => {
        if (!cell || cell.value === null || cell.value === undefined) return 0;
        const val = typeof cell.value === 'object' && 'result' in cell.value ? cell.value.result : cell.value;
        const num = Number(val);
        return isNaN(num) ? 0 : num;
      };
      const isValidGpName = (name: string | null): boolean => {
        if (!name || name.length < 2 || name.length > 100) return false;
        return /^[A-Za-zÀ-ɏ\s'-]+$/.test(name);
      };

      const gpErrorCounts: Record<string, number> = {};
      const gpErrorDetails: Record<string, Array<{ date?: Date; description?: string; errorCode?: string; gameType?: string; tableId?: string }>> = {};

      const errorCountAnalysisSheet = workbook.getWorksheet("Error Count Analysis");
      if (errorCountAnalysisSheet) {
        errorCountAnalysisSheet.eachRow((row: any, rowNumber: number) => {
          if (rowNumber < 2) return;
          const gpName = getCellValue(row.getCell(3));
          const errorCount = getNumericValue(row.getCell(5));
          if (!isValidGpName(gpName)) return;
          gpErrorCounts[gpName!] = errorCount;
        });
      }

      const errorsSheet = workbook.getWorksheet("Errors");
      if (errorsSheet) {
        let headerRow = 2;
        let gpNameCol = 2;
        let dateCol = 4;
        let descCol = 11;
        let codeCol = 9;
        let gameTypeCol = 10;
        let tableIdCol = 6;
        for (let r = 1; r <= 3; r++) {
          const row = errorsSheet.getRow(r);
          row.eachCell((cell: any, colNumber: number) => {
            const val = getCellValue(cell)?.toLowerCase() || "";
            if (val === "gp name" || (val.includes("gp") && val.includes("name"))) { gpNameCol = colNumber; headerRow = r; }
            else if (val === "date") { dateCol = colNumber; }
            else if (val === "error description" || val.includes("error description")) { descCol = colNumber; }
            else if (val === "error code" || val.includes("error code")) { codeCol = colNumber; }
            else if (val === "game type" || (val.includes("game") && val.includes("type"))) { gameTypeCol = colNumber; }
            else if (val === "table id" || val.includes("table id")) { tableIdCol = colNumber; }
          });
        }
        errorsSheet.eachRow((row: any, rowNumber: number) => {
          if (rowNumber <= headerRow) return;
          const gpName = getCellValue(row.getCell(gpNameCol));
          if (!isValidGpName(gpName)) return;
          const errorDetail: { date?: Date; description?: string; errorCode?: string; gameType?: string; tableId?: string } = {};
          const dateCell = row.getCell(dateCol);
          if (dateCell.value instanceof Date) errorDetail.date = dateCell.value;
          else if (typeof dateCell.value === "number") errorDetail.date = new Date((dateCell.value - 25569) * 86400 * 1000);
          else if (typeof dateCell.value === "string") {
            const dateStr = dateCell.value.trim();
            if (dateStr.includes(".")) {
              const parts = dateStr.split(".");
              if (parts.length === 3) {
                const [day, month, year] = parts.map((p: string) => parseInt(p, 10));
                errorDetail.date = new Date(year, month - 1, day);
              }
            } else if (dateStr.includes("-")) errorDetail.date = new Date(dateStr);
          }
          errorDetail.description = getCellValue(row.getCell(descCol)) || undefined;
          errorDetail.errorCode = getCellValue(row.getCell(codeCol)) || undefined;
          errorDetail.gameType = getCellValue(row.getCell(gameTypeCol)) || undefined;
          errorDetail.tableId = getCellValue(row.getCell(tableIdCol)) || undefined;
          if (!gpErrorDetails[gpName!]) gpErrorDetails[gpName!] = [];
          gpErrorDetails[gpName!].push(errorDetail);
        });
      }

      // Wipe existing gpErrors tied to this errorFile, then re-create.
      await db.deleteGpErrorsByMonthYear(file.month, file.year, ctx.user.id, file.id);

      const updatedGPs: string[] = [];
      const notFoundGPs: string[] = [];
      let recordsCreated = 0;
      for (const [gpName, count] of Object.entries(gpErrorCounts)) {
        const updated = await db.updateGPMistakesDirectly(gpName, count, file.month, file.year, ctx.user.id);
        if (updated) updatedGPs.push(gpName); else notFoundGPs.push(gpName);

        const details = gpErrorDetails[gpName] || [];
        if (details.length > 0) {
          for (const detail of details) {
            await db.createGpError({
              gpName,
              errorFileId: file.id,
              errorDate: detail.date || new Date(file.year, file.month - 1, 15),
              errorDescription: detail.description,
              errorCode: detail.errorCode,
              gameType: detail.gameType,
              tableId: detail.tableId,
              userId: ctx.user.id,
            });
            recordsCreated++;
          }
        } else if (count > 0) {
          await db.createGpError({
            gpName,
            errorFileId: file.id,
            errorDate: new Date(file.year, file.month - 1, 15),
            errorDescription: `${count} error(s) recorded`,
            userId: ctx.user.id,
          });
          recordsCreated++;
        }
      }

      log.info(`Reprocessed errorFile ${file.id}: ${recordsCreated} gpErrors recreated, ${updatedGPs.length} GPs matched, ${notFoundGPs.length} unmatched`);
      return {
        success: true,
        fileId: file.id,
        recordsCreated,
        updatedGPs,
        notFoundGPs,
        totalErrorsCounted: Object.values(gpErrorCounts).reduce((s, n) => s + n, 0),
      };
    }),
});
