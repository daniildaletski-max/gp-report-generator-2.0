# ExcelJS Chart Support Notes

## Current Status (Jan 2026)
- ExcelJS does NOT natively support creating charts
- Issue #141 opened in 2016 is still open
- xlsx-chart library can create charts but in separate files

## Workarounds
1. **xlsx-chart** - creates charts but cannot merge with ExcelJS workbooks
2. **xlsx-template** - uses template files with existing charts
3. **Generate chart as image** - use Chart.js to generate PNG, embed as image

## Best Solution for Our Case
Use a template Excel file that already has a chart, then populate the data cells.
The chart will automatically update based on the data.

## Alternative: Chart.js + Image
1. Generate chart using Chart.js (server-side with canvas)
2. Save as PNG
3. Embed image into Excel using ExcelJS addImage()
