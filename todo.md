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


## GP Access System (v4) - COMPLETED

### Database Schema
- [x] Create gpAccessTokens table (id, gamePresenterId, token, createdAt, isActive, lastAccessedAt)
- [x] Link GP tokens to evaluations by gamePresenterId

### Backend API
- [x] Generate unique access token/link for each GP (gpAccess.generateToken)
- [x] Public endpoint to view GP evaluations by token (gpAccess.getEvaluationsByToken - no auth required)
- [x] Validate token and return only that GP's evaluations
- [x] Endpoint to list all GP access links for FM (gpAccess.list)
- [x] Deactivate token endpoint (gpAccess.deactivate)

### Frontend - GP Portal
- [x] Public page /gp/:token for GP to view their evaluations
- [x] Display all evaluations for that GP (read-only)
- [x] Show evaluation details: date, scores, comments with progress bars
- [x] Mobile-friendly design with responsive layout
- [x] Summary stats: total evaluations, avg appearance, avg game perf

### Frontend - FM Management
- [x] New "GP Access Links" tab in Admin panel
- [x] Generate new link button for each GP
- [x] Copy link to clipboard functionality
- [x] Deactivate/regenerate link option
- [x] Show link status (Active/No Link)
- [x] Show last accessed timestamp
- [x] Open link in new tab button


## Team Data Import (v5) - COMPLETED

- [x] Add Team Omicron with Team Leader Andri Saaret (13 GPs)
- [x] Add Team Zeta with Team Leader Alissa Gujevskaja (10 GPs)
- [x] Add Team Alpha with Team Leader Kristina Bobrovskaja (13 GPs)
- [x] Verify all 36 Game Presenters are in the database (35 added + 1 updated)


## GP Management Improvements (v6) - COMPLETED

- [x] Add API endpoint to delete Game Presenter (gamePresenter.delete)
- [x] Add delete button in Admin GP Access Links table
- [x] Add confirmation dialog before deletion
- [x] Handle cascade deletion of related data (evaluations, tokens)


## GP Attitude/Mistakes & FM Team Access (v7) - COMPLETED

### Attitude & Mistakes
- [x] Add monthly_gp_stats table (gpId, month, year, attitude, mistakes)
- [x] Create API to update attitude/mistakes for GP (gamePresenter.updateStats)
- [x] Add UI to edit attitude/mistakes in Admin panel (new GP Stats tab)

### FM Team Access Control
- [x] Link users to teams (add teamId to users table)
- [x] Filter GP list by FM's team (gamePresenter.list checks ctx.user.teamId)
- [x] Add user.assignToTeam API for admin to assign FM to teams
- [x] Add gamePresenter.listWithStats API for filtered stats view


## UI Improvements & Integration (v8) - COMPLETED

### Visual Indicators
- [x] Add color-coded badges for attitude (red 1-2, yellow 3, green 4-5)
- [x] Add visual star display for attitude (★★★☆☆)

### Auto-fill Mistakes from Error Files
- [x] When error file is uploaded, automatically update mistakes count in monthly_gp_stats
- [x] Show mistakes count in GP Stats tab after error file upload

### User Management Page
- [x] Create Users tab in Admin panel
- [x] List all users with their assigned teams
- [x] Add dropdown to assign/change team for each user
- [x] Show role badge (admin/user)
- [x] Show last sign in timestamp

### Excel Report Integration
- [x] Include attitude score in Monthly Report remarks column
- [x] Include mistakes count from monthly_gp_stats in report
- [x] Auto-populate from monthly_gp_stats when generating report


## Bug Fixes (v9) - COMPLETED

- [x] Fix: Mistakes not loading for presenters after error file upload
  - Root cause: listWithStats returned stats: null for all GPs when no teamId specified
  - Solution: Added getMonthlyGpStats function and updated listWithStats to fetch stats for each GP


## Google Sheets Live Sync (v10) - COMPLETED

### Setup
- [x] Access Google Sheets via rclone (downloads xlsx from Google Drive)
- [x] Read "Error Count" tab structure (column B = GP name, column D = error count)

### Backend
- [x] Create googleSheets.sync endpoint
- [x] Parse Google Sheets data and update monthly_gp_stats
- [x] googleSheets.listFiles endpoint to list available xlsx files

### Frontend
- [x] Add "Sync from Google Sheets" button in Admin Error Files tab
- [x] Show last sync timestamp and results
- [x] Display count of updated GPs and not found names
- [x] File selector dropdown for Google Drive files


## Bug Fixes (v11) - COMPLETED

- [x] Fix: Duplicate keys in Google Drive file selector (files with same name cause React key error)
  - Solution: Filter out duplicate filenames and use index in key


## Team-based Access Control Improvement (v13)

- [ ] Remove Google Sheets sync feature (keep file upload only)
- [ ] Enforce team filtering in all modules:
  - [ ] Evaluations - FM sees only their team's evaluations
  - [ ] GP Stats - FM sees only their team's GP stats
  - [ ] GP Access Links - FM sees only their team's GPs
  - [ ] Reports - FM generates reports only for their team
  - [ ] Error Files - FM uploads errors only for their team
- [ ] Add FM users to database with team assignments:
  - [ ] Andri Saaret → Team Omnicron
  - [ ] Alissa Gujevskaja → Team Zeta
  - [ ] Kristina Bobrovskaja → Team Alpha
- [ ] Admin sees all teams, FM sees only their team


## Team-based Access Control (v13) - COMPLETED

### Remove Google Sheets Sync
- [x] Remove Google Sheets sync UI from Admin
- [x] Remove googleSheets router from backend
- [x] Keep only manual file upload

### Team-based Filtering
- [x] Filter evaluations by FM's team (evaluation.list)
- [x] Filter reports by FM's team (report.list)
- [x] Filter GP Access Links by FM's team (gpAccess.list)
- [x] Filter GP list by FM's team (gamePresenter.list)
- [x] Ensure all modules respect teamId

### FM User Setup
- [x] Teams configured: Omnicron (id=1), Alpha (id=2), Zeta (id=3)
- [x] FM users created when they log in, admin assigns teams via User Management tab


## UI Improvements & Dashboard Team Filter (v14)

- [x] Add team-based filtering to Dashboard API (stats.getDashboardStats)
- [x] Fix tab alignment in Admin panel (icons and text misaligned)
- [x] General UI improvements (color-coded chart, improved table with visual indicators)


## Monthly Team Overview Improvement (v15)

- [x] Автоматический сбор всех оценок GP за выбранный месяц из БД
- [x] Автоматический сбор данных об ошибках из monthly_gp_stats
- [x] Генерация отчёта в формате FM Team Report (Data + Monthly листы)
- [x] Проверка корректности формул AVERAGE и SUM
- [x] Тестирование генерации с реальными данными
- [x] Auto-fetch fresh data from database when exporting Excel
- [x] Include ALL GPs from team in report (not just those with attendance records)
- [x] Merge attendance and monthly stats data for complete GP information
- [x] All 50 tests passing


## Excel Report Content Improvements (v16)

- [x] Fix FM Performance text not appearing in Excel (from form input) - already working
- [x] Fix Goals this month text not appearing in Excel (from form input) - already working
- [x] Fix Team Overview text not appearing in Excel (from form input) - already working
- [x] Add automatic analysis of GP evaluations based on scores (Performance Analysis section)
- [x] Add performance chart/graph data to Excel report (Monthly Performance Data table with colors)
- [x] Additional Notes text from form input - already working
- [x] Top 3 Performers and Needs Improvement sections
- [x] Team Statistics (Total Evaluations, Avg Appearance, Avg Game Performance)
- [x] Color-coded performance indicators (green >=18, yellow >=15, red <15)


## System Functionality Improvements (v17)

### Quick Actions (save time on daily tasks)
- [x] Quick Attitude buttons (1-5) in GP Stats for fast input (one-click setting)
- [x] Color-coded attitude buttons (red 1-2, yellow 3, green 4-5)
- [ ] Bulk attitude update for multiple GPs at once
- [ ] One-click "Mark all as reviewed" for evaluations
- [ ] Quick notes/comments for GP performance

### Automation Features
- [ ] Auto-calculate monthly averages when month ends
- [ ] Auto-generate report draft when all data is collected
- [ ] Smart suggestions based on GP performance trends
- [x] Auto-fill Team Overview based on evaluation data (Sparkles button)

### Dashboard Improvements
- [x] Quick Actions bar with navigation buttons
- [x] Progress tracker for monthly report completion (progress bar)
- [ ] Recent activity feed (who uploaded what, when)
- [ ] Alerts for GPs with declining performance

### Search & Filter
- [x] Search evaluations by GP name, evaluator, or game
- [x] Filter evaluations by month/year
- [x] Sort evaluations by date, score, or name
- [x] Clear filters button
- [x] Results count display

### Export & Sharing
- [ ] Export GP Stats to Excel
- [ ] Share report preview link with team
- [ ] Download all team data as backup

### Mobile-Friendly
- [ ] Responsive design improvements for tablet/phone use


## GP Interface Improvements (v18)

### Privacy & Access Control
- [x] Hide evaluator name from GP view (privacy protection) - removed from both frontend and backend
- [x] GP should only see their own data (token-based access)

### GP Stats Display
- [x] Show mistakes count to GP in their dashboard (Monthly Performance section)
- [x] Show attitude score to GP in their dashboard (with color-coded badges)
- [x] Monthly stats summary for GP (current and previous month)

### Bonus Calculation & Status
- [x] Add totalGames field to monthly_gp_stats table
- [x] Calculate Good Games (GGs) = totalGames / mistakes (first mistake is free)
- [x] Determine bonus level based on GGs:
  - Level 1: minimum 2,500 GGs → €1.50/hour
  - Level 2: minimum 5,000 GGs → €2.50/hour
- [x] Display bonus status to GP (eligible/not eligible, level, rate)
- [x] Show progress bar toward bonus threshold
- [x] Add Total Games and GGs columns to Admin GP Stats table
- [x] FM can edit Total Games for each GP


## Excel Chart & System Completion (v19)

### Excel Chart for GP Evaluations
- [x] Add evaluation statistics chart to Monthly sheet in Excel (visual bar chart using cells)
- [x] Chart shows each GP's Appearance and Game Performance scores with color bars
- [x] Include average scores per GP with color-coded totals
- [x] Visual bar chart format with legend and score color indicators

### System Completion
- [x] Export GP Stats to CSV button added
- [x] Low performance alerts on Dashboard (GPs scoring below 15)
- [x] All 50 tests passing
- [x] All features work together seamlessly


## Excel Native Chart (v20)

- [x] Add native Excel bar chart using xlsx-chart library
- [x] Chart displays GP names on X-axis, scores on Y-axis
- [x] Includes Appearance and Game Performance as separate series (column chart)
- [x] Chart exported as separate Excel file with embedded chart
- [x] Both main report and chart file download automatically on export


## Screenshot Auto-Analysis System (v21)

### AI-Powered Screenshot Analysis
- [ ] Create LLM vision endpoint to analyze evaluation screenshots
- [ ] Extract data: Presenter name, Evaluator, Date, Game, Total Score
- [ ] Extract ratings: Hair, Makeup, Outfit, Posture, Dealing Style, Game Performance
- [ ] Extract comments for each rating category

### Auto-Create Evaluations
- [ ] Match extracted GP name with existing GP in database
- [ ] Auto-create evaluation record with extracted scores
- [x] Handle fuzzy name matching (e.g., "Sofja Barchan" → "Sofia Barchan") - COMPLETED
- [ ] Show preview of extracted data before saving
- [ ] Batch upload: process multiple screenshots at once

### UI for Screenshot Upload
- [ ] Create new page/tab for screenshot analysis
- [ ] Drag-and-drop upload area
- [ ] Preview extracted data with edit capability
- [ ] Confirm and save button
- [ ] Show success/error status for each screenshot


## Bug Fixes (v22)

- [ ] Fix: Monthly Performance Overview chart shows only 1 GP instead of all GPs with evaluations

## Bug Fixes (v23)

- [x] Fix: Excel chart - replaced canvas-based chart with Excel-native Chart Data sheet
- [x] Add: Chart Data sheet with formatted data for Excel's built-in chart feature
- [x] Color-coded total scores (green >=18, yellow >=15, red <15)
- [x] Instructions for creating chart in Excel included


## Excel Chart Image (v24)

- [x] Generate chart image using QuickChart API (no canvas dependency)
- [x] Insert chart image directly into Excel report
- [x] Chart shows GP names, Total Score, Appearance, Performance (same as Dashboard)


## Auto-fill Text Fields (v25)

- [x] Generate FM Performance text based on team evaluation data
- [x] Generate Goals text based on team performance analysis
- [x] Generate Team Overview text summarizing GP performance
- [x] Add auto-fill button on Reports page to generate text fields ("Auto-fill All Fields with AI" button)
- [x] Integrate auto-generated text into Excel export
- [x] Added 7 new tests for auto-fill functionality (76 total tests passing)


## Move Chart to Month Sheet (v26)

- [x] Move chart from "Chart Data" sheet to the month sheet (e.g., "December 2025")
- [x] Position chart on the right side of the month sheet (column I, row 1)
