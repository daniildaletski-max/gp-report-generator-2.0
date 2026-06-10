/**
 * tRPC App Router — composes per-domain routers from `./routers/`.
 *
 * Historical note: this file used to be a 3,800-line monolith. Each
 * `<domain>: router({ ... })` block has been moved into its own module
 * under `server/routers/<domain>.ts`. Shared helpers
 * (`generateExcelAndEmail`, `extractEvaluationFromImage`, etc.) live in
 * `server/routers/_shared.ts` to avoid circular imports.
 */
import { router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";

import { authRouter } from "./routers/auth";
import { evaluationRouter } from "./routers/evaluation";
import { gamePresenterRouter } from "./routers/gamePresenter";
import { userRouter } from "./routers/user";
import { dashboardRouter } from "./routers/dashboard";
import { scheduledReportsRouter } from "./routers/scheduledReports";
import { reportRouter } from "./routers/report";
import { errorFileRouter } from "./routers/errorFile";
import { gpAccessRouter } from "./routers/gpAccess";
import { invitationRouter } from "./routers/invitation";
import { errorScreenshotRouter } from "./routers/errorScreenshot";
import { attitudeScreenshotRouter } from "./routers/attitudeScreenshot";
import { attendanceRouter } from "./routers/attendance";
import { studioworksSyncRouter } from "./routers/studioworksSync";
import { actionItemsRouter } from "./routers/actionItems";
import { searchRouter } from "./routers/search";
import { rubricRouter } from "./routers/rubric";
import { assistantRouter } from "./routers/assistant";
import { leaderboardRouter } from "./routers/leaderboard";
import { commandCenterRouter } from "./routers/commandCenter";
import { analyticsRouter } from "./routers/analytics";
import { goalsRouter } from "./routers/goals";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  evaluation: evaluationRouter,
  gamePresenter: gamePresenterRouter,
  user: userRouter,
  dashboard: dashboardRouter,
  scheduledReports: scheduledReportsRouter,
  report: reportRouter,
  errorFile: errorFileRouter,
  gpAccess: gpAccessRouter,
  invitation: invitationRouter,
  errorScreenshot: errorScreenshotRouter,
  attitudeScreenshot: attitudeScreenshotRouter,
  attendance: attendanceRouter,
  studioworksSync: studioworksSyncRouter,
  actionItems: actionItemsRouter,
  search: searchRouter,
  rubric: rubricRouter,
  assistant: assistantRouter,
  leaderboard: leaderboardRouter,
  commandCenter: commandCenterRouter,
  analytics: analyticsRouter,
  goals: goalsRouter,
});

export type AppRouter = typeof appRouter;
