import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { runMonthlyReportGeneration } from "../scheduledReports";
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
});
