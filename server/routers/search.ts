/**
 * Search router — backs the global Cmd+K command palette.
 *
 * Returns a small, batched payload of the things a user typically
 * jumps to: their GPs, teams, recent reports, open action items.
 * Everything is filtered by the user's tenant scope.
 *
 * Kept deliberately light — the palette client does substring
 * matching locally, so we just feed it the working set.
 */
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";

export const searchRouter = router({
  /**
   * Aggregate the user's jump-targets for the palette in one round-trip.
   * Result is small enough to re-fetch on every palette open.
   */
  paletteIndex: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = ctx.user.role === "admin";

    const [gps, reportsRaw, openActionItems] = await Promise.all([
      isAdmin ? db.getAllGamePresenters() : db.getAllGamePresentersByUser(ctx.user.id),
      isAdmin ? db.getAllReportsWithTeam() : db.getReportsWithTeamsByUser(ctx.user.id),
      db.listActionItems({
        userId: isAdmin ? undefined : ctx.user.id,
        includeAllStatuses: false,
      }),
    ]);

    // Limit reports to the 20 most-recent — nothing past that is jumped-to often.
    const reports = reportsRaw.slice(0, 20).map(r => ({
      id: r.report.id,
      teamName: r.team?.teamName ?? "Unknown",
      month: r.report.reportMonth,
      year: r.report.reportYear,
      status: r.report.status,
    }));

    return {
      gps: gps.map(g => ({ id: g.id, name: g.name, teamId: g.teamId })),
      reports,
      actionItems: openActionItems.slice(0, 20).map(a => ({
        id: a.id,
        title: a.title,
        gpName: a.gamePresenter.name,
        gpId: a.gamePresenterId,
        priority: a.priority,
        status: a.status,
      })),
    };
  }),
});
