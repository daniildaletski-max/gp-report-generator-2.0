# Debug Notes - Mistakes Not Loading

## Problem
All GP show Mistakes = 0 in GP Stats tab, even though:
1. gp_errors table has data (20+ records)
2. monthly_gp_stats table has 10+ records with mistakes > 0

## Root Cause Analysis
The GP Stats tab shows January 2026, but error files were uploaded for a different month/year.

Need to check:
1. What month/year the error files were uploaded for
2. Whether the monthly_gp_stats records match the selected month/year filter

## SQL Queries to Check
- SELECT * FROM monthly_gp_stats WHERE month = 1 AND year = 2026;
- SELECT * FROM gp_errors WHERE errorDate BETWEEN '2026-01-01' AND '2026-01-31';
