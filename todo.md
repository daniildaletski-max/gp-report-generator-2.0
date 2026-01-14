# GP Report Generator - TODO

- [x] Database schema for evaluations, game presenters, and reports
- [x] Backend API for image upload to S3
- [x] AI-powered OCR to extract data from evaluation screenshots
- [x] Frontend upload interface with drag-and-drop support
- [x] Batch upload support for multiple screenshots
- [x] Dashboard to view uploaded screenshots and extracted data
- [x] Automatic aggregation of evaluations per GP for monthly averages
- [x] Generate Team Monthly Overview reports
- [x] Export reports to Excel format
- [x] Data persistence for evaluations and reports
- [x] Notifications when reports are generated
- [x] Clean functional design for internal team tool


## Improvements - Match FM Team Report Template

- [x] Add attendance tracking fields (Mistakes, Extra shifts, Late to work, Missed days, Sick leaves)
- [x] Add GP remarks/attitude field
- [x] Add FM self-evaluation text field
- [x] Add Goals this month text field
- [x] Add Team Overview text field
- [x] Add Additional Notes text field
- [x] Generate Excel with exact template format (2 sheets: Data + Monthly)
- [x] Data sheet: GP names with GAME PERF. and APPEARANCE scores
- [x] Monthly sheet: Full layout with FM info, attendance table, text areas
- [x] Calculate GAME PERF. = Dealing Style + Game Performance
- [x] Calculate APPEARANCE = Hair + Makeup + Outfit + Posture
- [x] Auto-populate GP attendance table from database
- [x] Add AVERAGE formulas for scores
- [x] Add SUM formulas for attendance totals

- [x] Admin interface to upload Playgon and MG error files
- [x] Parse error files to extract GP error counts
- [x] Store error data in database linked to GP names
- [x] Auto-match GP names from error files with evaluation data
- [x] Pre-configure FM teams: Andri Saaret - Team Omnicron, Kristina Bobrovskaja - Team Alpha, Alissa Gujevskaja - Team Zeta


## Admin & Dashboard Improvements

- [x] Add delete button for uploaded error files in Admin
- [x] Backend API for deleting error files
- [x] Restore Dashboard with statistics cards (total GPs, evaluations, reports)
- [x] Add monthly evaluation chart to Dashboard
- [x] Add recent evaluations list to Dashboard


## Dashboard Redesign (matching screenshot)

- [x] Update stats cards: Game Presenters, Evaluations, This Month (GPs evaluated), Reports
- [x] Add Monthly Performance Overview chart with Total Score, Appearance, Performance per GP
- [x] Add Monthly Statistics table with detailed breakdown (Evaluations, Avg Total, Hair, Makeup, Outfit, Posture, Dealing, Game Perf)
- [x] Add month selector for filtering data


## Bug Fixes

- [x] Fix report generation error - Failed query insert into reports (synced DB schema with drizzle)


## Full FM Functionality (v2)

### CRUD for Evaluations
- [x] Edit evaluation - update scores and comments
- [x] Delete single evaluation
- [x] Bulk delete evaluations by date range
- [x] Clear all evaluations for a month

### Excel Report Matching Template
- [x] Monthly Report sheet with FM Performance, Goals, Team Overview sections
- [x] Attendance table with Mistakes, Extra shifts, Late, Missed days, Sick leaves, Remarks
- [x] Data sheet with GAME PERF. and APPEARANCE scores per GP
- [x] Proper formatting matching template (colors, fonts, borders)

### UI Improvements
- [x] Evaluation edit modal with all fields
- [x] Delete confirmation dialog
- [x] Bulk actions toolbar in Evaluations page
- [x] Month/year filter for clearing old data


## Excel Report Improvement (v3) - COMPLETED

### Excel Generation Matching Template
- [x] Create Monthly Report sheet with exact template layout
- [x] Add FM Performance text area (rows 6-19)
- [x] Add Goals this month text area (rows 24-36)
- [x] Add Team Overview text area (rows 24-36)
- [x] Create GP Attendance table (Name, Mistakes, Extra shifts, Late, Missed days, Sick leaves, Remarks)
- [x] Add Additional Notes section (rows 38-53)
- [x] Create Data sheet with GAME PERF. and APPEARANCE columns
- [x] Individual evaluation scores per GP (up to 4 evaluations)
- [x] Add AVERAGE formulas for scores
- [x] Apply proper formatting (colors, fonts, borders matching template)

### Error Files Parsing - COMPLETED
- [x] Parse Playgon error files to extract GP names and error counts (from Errors sheet, column B)
- [x] Parse MG error files to extract GP names and error counts (from Errors sheet, column B)
- [x] Match GP names from error files with database records
- [x] Auto-populate Mistakes column in attendance table
- [x] Store parsed error data for report generation
