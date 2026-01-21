import XLSXChart from 'xlsx-chart';
import ExcelJS from 'exceljs';
import fs from 'fs';

async function test() {
  // Step 1: Generate chart with xlsx-chart
  const xlsxChart = new XLSXChart();
  
  const chartOpts = {
    chart: 'column',
    titles: ['January 2026', 'Previous Month'],
    fields: ['Agnes Suvorov', 'Viktoriia Marchenko', 'Elina Suhak', 'Yusuf Toplu', 'Maria Kozhanova'],
    data: {
      'January 2026': {
        'Agnes Suvorov': 21,
        'Viktoriia Marchenko': 18,
        'Elina Suhak': 15,
        'Yusuf Toplu': 12,
        'Maria Kozhanova': 19
      },
      'Previous Month': {
        'Agnes Suvorov': 19,
        'Viktoriia Marchenko': 17,
        'Elina Suhak': 16,
        'Yusuf Toplu': 14,
        'Maria Kozhanova': 18
      }
    },
    chartTitle: 'Team Omnicron - GP Performance'
  };
  
  // Generate chart buffer
  const chartBuffer = await new Promise((resolve, reject) => {
    xlsxChart.generate(chartOpts, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
  
  console.log('Chart generated, buffer size:', chartBuffer.length);
  
  // Step 2: Load the chart workbook and add more sheets
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(chartBuffer);
  
  console.log('Workbook loaded, sheets:', workbook.worksheets.map(s => s.name));
  
  // Rename the chart sheet to TEMPLATE
  const chartSheet = workbook.worksheets[0];
  chartSheet.name = 'TEMPLATE';
  
  // Add Data sheet
  const dataSheet = workbook.addWorksheet('Data');
  dataSheet.getRow(1).values = ['GP Name', 'GAME PERF.', 'APPEARANCE', 'TOTAL'];
  dataSheet.getRow(1).font = { bold: true };
  
  const testData = [
    ['Agnes Suvorov', 10, 11, 21],
    ['Viktoriia Marchenko', 9, 9, 18],
    ['Elina Suhak', 8, 7, 15],
    ['Yusuf Toplu', 6, 6, 12],
    ['Maria Kozhanova', 10, 9, 19]
  ];
  
  testData.forEach((row, i) => {
    dataSheet.getRow(i + 2).values = row;
  });
  
  // Add Monthly Report sheet
  const reportSheet = workbook.addWorksheet('Monthly Report');
  reportSheet.getCell('A1').value = 'Team Omnicron - January 2026 Monthly Report';
  reportSheet.getCell('A1').font = { bold: true, size: 16 };
  
  reportSheet.getCell('A3').value = 'FM Performance:';
  reportSheet.getCell('A3').font = { bold: true };
  reportSheet.mergeCells('A4:H10');
  reportSheet.getCell('A4').value = 'This is the FM performance text area...';
  reportSheet.getCell('A4').alignment = { wrapText: true, vertical: 'top' };
  
  // Save combined workbook
  const buffer = await workbook.xlsx.writeBuffer();
  fs.writeFileSync('/tmp/combined_chart.xlsx', buffer);
  
  console.log('Combined workbook saved to /tmp/combined_chart.xlsx');
  console.log('Final sheets:', workbook.worksheets.map(s => s.name));
}

test().catch(console.error);
