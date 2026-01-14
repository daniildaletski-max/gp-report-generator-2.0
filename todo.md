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
- [ ] Generate Excel with exact template format (2 sheets: Data + Monthly)
- [ ] Data sheet: GP names with GAME PERF. and APPEARANCE scores
- [ ] Monthly sheet: Full layout with FM info, attendance table, text areas
- [ ] Calculate GAME PERF. = Dealing Style + Game Performance
- [ ] Calculate APPEARANCE = Hair + Makeup + Outfit + Posture
- [ ] Auto-populate GP attendance table from database
- [ ] Add AVERAGE formulas for scores
- [ ] Add SUM formulas for attendance totals

- [x] Admin interface to upload Playgon and MG error files
- [x] Parse error files to extract GP error counts
- [x] Store error data in database linked to GP names
- [ ] Auto-match GP names from error files with evaluation data
- [x] Pre-configure FM teams: Andri Saaret - Team Omnicron, Kristina Bobrovskaja - Team Alpha, Alissa Gujevskaja - Team Zeta
