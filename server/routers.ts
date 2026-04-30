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
import { fmTeamRouter } from "./routers/fmTeam";
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
import { smartUploadRouter } from "./routers/smartUpload";
import { personaSyncRouter } from "./routers/personaSync";
import { bonusRouter } from "./routers/bonus";
import { actionItemsRouter } from "./routers/actionItems";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  fmTeam: fmTeamRouter,
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
  smartUpload: smartUploadRouter,
  personaSync: personaSyncRouter,
  bonus: bonusRouter,
  actionItems: actionItemsRouter,
});

export type AppRouter = typeof appRouter;
