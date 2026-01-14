# Template Analysis - FM Team Report

## Sheet 1: Data
Contains GP evaluation scores in a grid format:
- Column B: GP Name 1, Column F: GP Name 2 (two GPs per row block)
- Column C/G: GAME PERF. scores
- Column D/H: APPEARANCE scores
- Each GP block has 4 rows for individual evaluations
- Row with "Total average:" contains AVERAGE formulas

Structure pattern (repeats every 7 rows):
- Row N: GP Name header + column headers (GAME PERF., APPEARANCE)
- Rows N+1 to N+4: Individual evaluation scores
- Row N+5: Total average with formulas

## Sheet 2: January 2024 (Monthly Report)
Main report layout:

### Left Section (A-L):
- A2:H3: "<FloorManager Name> - Team <Name>"
- A4:H5: "FM Performance (self evaluation)"
- A6:H19: Text area for FM self-evaluation
- A21:H22: "Team Management"
- A23: "Goals this month:" | E23: "Team Overview:"
- A24:D36: Goals text area
- E24:H36: Team overview text area
- A38: "Additional Notes"
- A40:H53: Additional notes text area

### Right Section (N-AE) - GP Attendance Table:
- N2:AE3: "Team <Name> Overview <Month> 2024"
- Headers (Row 4):
  - N4: Name
  - Q4: Mistakes
  - S4: Extra shifts/Staying longer
  - U4: Late to work
  - W4: Missed days
  - Y4: Sick leaves
  - AA4: Attitude/Concerns/Remarks

- Rows 6-35: GP data rows (each GP takes 2 rows, merged cells)
- Row 36: TOTAL row with SUM formulas

- N39: "Paste the table here (delete old): (from Data)"

## Key Observations:
1. Two separate data areas: GP performance scores (Data sheet) and attendance/remarks (January sheet)
2. The evaluation screenshots I have contain GAME PERF. and APPEARANCE scores
3. The monthly report also tracks: Mistakes, Extra shifts, Late to work, Missed days, Sick leaves, Remarks
4. FM needs to fill: Self-evaluation, Goals, Team Overview, Additional Notes

## Data Mapping from Screenshots:
From evaluation screenshots, I can extract:
- Presenter Name → GP Name
- Total Score → Can be split into GAME PERF. (Dealing Style + Game Performance) and APPEARANCE (Hair + Makeup + Outfit + Posture)
- Date → For monthly grouping
- Comments → Can go to Attitude/Concerns/Remarks

GAME PERF. = Dealing Style (5) + Game Performance (5) = max 10
APPEARANCE = Hair (3) + Makeup (3) + Outfit (3) + Posture (3) = max 12
