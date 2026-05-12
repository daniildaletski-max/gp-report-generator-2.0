import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';

const workbook = new ExcelJS.Workbook();
const buffer = readFileSync('/home/ubuntu/may_errors.xlsx');
await workbook.xlsx.load(buffer);

console.log("=== WORKSHEETS ===");
workbook.eachSheet((ws, id) => {
  console.log(`  Sheet ${id}: "${ws.name}" (${ws.rowCount} rows, ${ws.columnCount} cols)`);
});

// Check "Error Count Analysis" sheet
const ecaSheet = workbook.getWorksheet('Error Count Analysis');
if (ecaSheet) {
  console.log("\n=== ERROR COUNT ANALYSIS SHEET ===");
  // Print first 3 rows to see headers
  for (let r = 1; r <= 3; r++) {
    const row = ecaSheet.getRow(r);
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= 25) {
        const val = cell.value;
        if (val !== null && val !== undefined) {
          cells.push(`Col${colNumber}=${typeof val === 'object' ? JSON.stringify(val) : val}`);
        }
      }
    });
    console.log(`  Row ${r}: ${cells.join(' | ')}`);
  }
  
  // Look for legend area - scan rightward for error code descriptions
  console.log("\n  --- Scanning for legend (right side) ---");
  for (let r = 1; r <= 20; r++) {
    const row = ecaSheet.getRow(r);
    // Check columns beyond the data area (col 20+)
    for (let c = 18; c <= 40; c++) {
      const cell = row.getCell(c);
      if (cell.value && typeof cell.value === 'string' && cell.value.trim().length > 0) {
        console.log(`  Row ${r}, Col ${c}: "${cell.value}"`);
      } else if (cell.value && typeof cell.value === 'object') {
        const v = cell.value;
        if ('text' in v) console.log(`  Row ${r}, Col ${c}: "${v.text}"`);
        else if ('result' in v) console.log(`  Row ${r}, Col ${c}: result="${v.result}"`);
      }
    }
  }
  
  // Print a GP with errors to see the structure
  console.log("\n  --- Sample rows with errors ---");
  let count = 0;
  ecaSheet.eachRow((row, rowNumber) => {
    if (rowNumber < 2 || count > 5) return;
    const nameCell = row.getCell(1); // Try col A
    const name = nameCell.value ? String(nameCell.value).trim() : '';
    // Check if any error columns have values > 0
    let hasErrors = false;
    for (let c = 4; c <= 22; c++) {
      const v = row.getCell(c).value;
      if (v && typeof v === 'number' && v > 0) { hasErrors = true; break; }
      if (v && typeof v === 'object' && 'result' in v && v.result > 0) { hasErrors = true; break; }
    }
    if (hasErrors && name.length > 2) {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= 22) {
          const val = cell.value;
          if (val !== null && val !== undefined) {
            const display = typeof val === 'object' && 'result' in val ? val.result : val;
            cells.push(`C${colNumber}=${display}`);
          }
        }
      });
      console.log(`  Row ${rowNumber}: ${cells.join(' | ')}`);
      count++;
    }
  });
} else {
  console.log("ERROR COUNT ANALYSIS sheet not found!");
}

// Check "Errors" sheet
const errorsSheet = workbook.getWorksheet('Errors');
if (errorsSheet) {
  console.log("\n=== ERRORS SHEET ===");
  for (let r = 1; r <= 3; r++) {
    const row = errorsSheet.getRow(r);
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= 15) {
        const val = cell.value;
        if (val !== null && val !== undefined) {
          cells.push(`Col${colNumber}=${typeof val === 'object' ? JSON.stringify(val) : val}`);
        }
      }
    });
    console.log(`  Row ${r}: ${cells.join(' | ')}`);
  }
  console.log(`  Total rows: ${errorsSheet.rowCount}`);
} else {
  console.log("\nERRORS sheet not found!");
}
