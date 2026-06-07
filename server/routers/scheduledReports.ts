import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { runMonthlyReportGeneration, runWeeklyCoachingDigest } from "../scheduledReports";
import { createLogger } from "../services/logger";
const log = createLogger("Router");

export const scheduledReportsRouter = router({
  triggerMonthlyGeneration: adminProcedure.mutation(async () => {
    // Run the monthly report generation in the background
    runMonthlyReportGeneration().catch(err => {
      log.error('Manual monthly report trigger failed', err instanceof Error ? err : new Error(String(err)));
    });
    return { message: 'Monthly report generation started. You will be notified when complete.' };
  }),

  triggerWeeklyDigest: adminProcedure.mutation(async () => {
    // Run the weekly coaching digest in the background.
    runWeeklyCoachingDigest().catch(err => {
      log.error('Manual weekly digest trigger failed', err instanceof Error ? err : new Error(String(err)));
    });
    return { message: 'Weekly coaching digest started. Admins with an email on file will receive it shortly (if anything is urgent).' };
  }),
});
