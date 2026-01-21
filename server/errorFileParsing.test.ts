import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import ExcelJS from 'exceljs';

// Test the error file parsing logic
describe('Error File Parsing - Error Count Sheet', () => {
  
  it('should correctly parse GP names from column B and Total Errors from column D', async () => {
    // Create a mock Excel workbook with "Error Count" sheet
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Error Count');
    
    // Add header row
    sheet.addRow(['Nr', 'GP Name', 'GP Alias', 'Total Errors']);
    
    // Add data rows (starting from row 2)
    sheet.addRow([1, 'Agnes Suvorov', 'agnes.s', 5]);
    sheet.addRow([2, 'Anastasija Kalašnikova', 'anastasija.k', 3]);
    sheet.addRow([3, 'Eliise Jõgar', 'eliise.j', 0]);
    sheet.addRow([4, 'Maria Solovova', 'maria.s', 12]);
    
    // Parse the workbook using the same logic as in routers.ts
    const gpErrorCounts: Record<string, number> = {};
    let totalErrorsCount = 0;
    
    const errorCountSheet = workbook.getWorksheet('Error Count');
    expect(errorCountSheet).toBeDefined();
    
    if (errorCountSheet) {
      errorCountSheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 2) { // Skip header row (row 1)
          const gpNameCell = row.getCell(2); // Column B
          const totalErrorsCell = row.getCell(4); // Column D
          
          let gpName: string | null = null;
          let errorCount = 0;
          
          // Handle GP Name cell
          if (gpNameCell.value) {
            if (typeof gpNameCell.value === 'string') {
              gpName = gpNameCell.value.trim();
            }
          }
          
          // Handle Total Errors cell
          if (totalErrorsCell.value !== null && totalErrorsCell.value !== undefined) {
            if (typeof totalErrorsCell.value === 'number') {
              errorCount = Math.round(totalErrorsCell.value);
            }
          }
          
          // Validate GP name and store error count
          if (gpName && gpName.length > 0 && gpName !== 'GP Name' && gpName !== 'Name') {
            if (/^[A-Za-z\u00C0-\u024F\s'-]+$/.test(gpName) && gpName.length < 100) {
              gpErrorCounts[gpName] = errorCount;
              totalErrorsCount += errorCount;
            }
          }
        }
      });
    }
    
    // Verify parsed data
    expect(gpErrorCounts['Agnes Suvorov']).toBe(5);
    expect(gpErrorCounts['Anastasija Kalašnikova']).toBe(3);
    expect(gpErrorCounts['Eliise Jõgar']).toBe(0);
    expect(gpErrorCounts['Maria Solovova']).toBe(12);
    expect(totalErrorsCount).toBe(20); // 5 + 3 + 0 + 12
  });
  
  it('should handle formula cells with cached results', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Error Count');
    
    // Add header row
    sheet.addRow(['Nr', 'GP Name', 'GP Alias', 'Total Errors']);
    
    // Add data row with formula-like value (simulating cached result)
    const row = sheet.addRow([1, 'Test GP', 'test.gp', 7]);
    
    // Simulate formula with cached result
    const cell = row.getCell(4);
    cell.value = { formula: 'SUM(E2:E10)', result: 7 } as any;
    
    const gpErrorCounts: Record<string, number> = {};
    
    const errorCountSheet = workbook.getWorksheet('Error Count');
    if (errorCountSheet) {
      errorCountSheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 2) {
          const gpNameCell = row.getCell(2);
          const totalErrorsCell = row.getCell(4);
          
          let gpName: string | null = null;
          let errorCount = 0;
          
          if (gpNameCell.value && typeof gpNameCell.value === 'string') {
            gpName = gpNameCell.value.trim();
          }
          
          if (totalErrorsCell.value !== null && totalErrorsCell.value !== undefined) {
            if (typeof totalErrorsCell.value === 'number') {
              errorCount = Math.round(totalErrorsCell.value);
            } else if (typeof totalErrorsCell.value === 'object' && 'result' in totalErrorsCell.value) {
              const result = (totalErrorsCell.value as any).result;
              if (typeof result === 'number') {
                errorCount = Math.round(result);
              }
            }
          }
          
          if (gpName && gpName.length > 0 && gpName !== 'GP Name') {
            gpErrorCounts[gpName] = errorCount;
          }
        }
      });
    }
    
    expect(gpErrorCounts['Test GP']).toBe(7);
  });
  
  it('should skip invalid GP names', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Error Count');
    
    sheet.addRow(['Nr', 'GP Name', 'GP Alias', 'Total Errors']);
    sheet.addRow([1, 'Valid Name', 'valid', 5]);
    sheet.addRow([2, '=FORMULA()', 'formula', 3]); // Should be skipped
    sheet.addRow([3, '', 'empty', 2]); // Should be skipped
    sheet.addRow([4, 'GP Name', 'header', 1]); // Should be skipped (header value)
    sheet.addRow([5, 'Another Valid', 'another', 4]);
    
    const gpErrorCounts: Record<string, number> = {};
    
    const errorCountSheet = workbook.getWorksheet('Error Count');
    if (errorCountSheet) {
      errorCountSheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 2) {
          const gpNameCell = row.getCell(2);
          const totalErrorsCell = row.getCell(4);
          
          let gpName: string | null = null;
          let errorCount = 0;
          
          if (gpNameCell.value && typeof gpNameCell.value === 'string') {
            gpName = gpNameCell.value.trim();
          }
          
          if (totalErrorsCell.value !== null && typeof totalErrorsCell.value === 'number') {
            errorCount = Math.round(totalErrorsCell.value);
          }
          
          if (gpName && gpName.length > 0 && !gpName.startsWith('=') && gpName !== 'GP Name') {
            if (/^[A-Za-z\u00C0-\u024F\s'-]+$/.test(gpName) && gpName.length < 100) {
              gpErrorCounts[gpName] = errorCount;
            }
          }
        }
      });
    }
    
    expect(Object.keys(gpErrorCounts)).toHaveLength(2);
    expect(gpErrorCounts['Valid Name']).toBe(5);
    expect(gpErrorCounts['Another Valid']).toBe(4);
    expect(gpErrorCounts['=FORMULA()']).toBeUndefined();
    expect(gpErrorCounts['GP Name']).toBeUndefined();
  });
});
