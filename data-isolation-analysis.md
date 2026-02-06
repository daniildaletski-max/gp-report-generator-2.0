# Data Isolation Analysis

## Current State

The database schema already has `userId` columns on key tables:
- `gamePresenters.userId` - Owner of GP record
- `evaluations.userId` - Owner of evaluation
- `reports.userId` - Owner of report
- `monthlyGpStats.userId` - Owner of stats record

The db.ts already has `*ByUser` variants for many functions:
- `getAllGamePresentersByUser(userId)`
- `getAllEvaluationsByUser(userId)`
- `getEvaluationsWithGPByUser(userId)`
- `getAllReportsByUser(userId)`
- `getReportsWithTeamsByUser(userId)`
- `getDashboardStatsByUser(month, year, userId)`
- `getGpAccessTokensByUser(userId)`
- `deleteReportWithCheckByUser(reportId, userId, isAdmin)`
- `verifyGpOwnershipByUser(gpIds, userId)`

## What Needs to Be Done in routers.ts

Need to check routers.ts to ensure ALL procedures use userId-filtered queries for non-admin users. The key principle:
- Admin users can see ALL data
- Regular users should ONLY see their own data (filtered by userId)

## Tables That Need userId Filtering

1. `gamePresenters` - DONE (has userId column)
2. `evaluations` - DONE (has userId column)
3. `reports` - DONE (has userId column)
4. `monthlyGpStats` - DONE (has userId column)
5. `fmTeams` - Shared resource, no userId needed (teams are pre-configured)
6. `gpAccessTokens` - Filtered via GP ownership
7. `errorScreenshots` - Needs userId filtering via uploadedById
8. `attitudeScreenshots` - Needs userId filtering via uploadedById
9. `errorFiles` - Needs userId filtering via uploadedById
10. `uploadBatches` - Already filtered by uploadedById

## Missing userId Columns

- `errorScreenshots` - no userId column, only uploadedById
- `attitudeScreenshots` - no userId column, only uploadedById
- `errorFiles` - no userId column, only uploadedById
- `gpErrors` - no userId column
- `gpMonthlyAttendance` - no userId column

## Action Plan

1. Add `userId` column to missing tables (errorScreenshots, attitudeScreenshots, errorFiles)
2. Verify routers.ts uses userId-filtered queries for all non-admin procedures
3. Ensure upload procedures set userId on all created records
4. Ensure GP creation sets userId
5. Ensure report creation sets userId
