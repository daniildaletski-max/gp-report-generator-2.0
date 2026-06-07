/**
 * Action Items / Coaching Plans — DB operations.
 *
 * All queries are scoped by either gpId, teamId (joined through
 * gamePresenters.teamId), or the owning userId so multi-tenant
 * isolation is enforced at the data layer.
 */
import { eq, and, inArray, desc, asc, isNull, or } from "drizzle-orm";
import {
  actionItems, InsertActionItem, ActionItem,
  gamePresenters, GamePresenter,
} from "../../drizzle/schema";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";

const log = createLogger("DB:ActionItems");

export type ActionItemWithGp = ActionItem & { gamePresenter: GamePresenter };

export async function createActionItem(data: InsertActionItem): Promise<ActionItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(actionItems).values(data);
  const row = await db.select().from(actionItems).where(eq(actionItems.id, Number(result[0].insertId))).limit(1);
  return row[0];
}

export async function getActionItemById(id: number): Promise<ActionItem | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(actionItems).where(eq(actionItems.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateActionItem(
  id: number,
  patch: Partial<Omit<ActionItem, "id" | "createdAt">>,
): Promise<ActionItem | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(actionItems).set(patch).where(eq(actionItems.id, id));
  return getActionItemById(id);
}

export async function deleteActionItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(actionItems).where(eq(actionItems.id, id));
}

/**
 * Recently-created action items for a given GP filtered by source —
 * used by auto-coaching/Persona-anomaly de-duplication so the same
 * insight doesn't generate the same item every cron tick.
 *
 * `withinDays` defaults to 14; we look at items created within that
 * window from now.
 */
export async function getRecentActionItemsByGpAndSource(
  gpId: number,
  source: "manual" | "ai_insight",
  withinDays: number = 14,
): Promise<ActionItem[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const { gte } = await import("drizzle-orm");
  const rows = await db.select()
    .from(actionItems)
    .where(and(
      eq(actionItems.gamePresenterId, gpId),
      eq(actionItems.source, source),
      gte(actionItems.createdAt, cutoff),
    ))
    .orderBy(desc(actionItems.createdAt));
  return rows;
}

/**
 * Mark an item done. Stores when it was completed and an optional note
 * (e.g. "trained on grooming, +2 score next eval").
 */
export async function completeActionItem(id: number, note?: string): Promise<ActionItem | null> {
  return updateActionItem(id, {
    status: "done",
    completedAt: new Date(),
    completionNote: note ?? null,
  });
}

interface ListFilter {
  gpId?: number;
  teamId?: number | null;
  userId?: number;          // tenant scope for non-admin
  statuses?: ActionItem["status"][];
  includeAllStatuses?: boolean;
}

/**
 * Default behaviour: returns open + in_progress items so the dashboard
 * widget shows what's actually on the FM's plate. Pass
 * `includeAllStatuses: true` to also see done/cancelled.
 */
export async function listActionItems(filter: ListFilter = {}): Promise<ActionItemWithGp[]> {
  const db = await getDb();
  if (!db) return [];

  const statuses = filter.includeAllStatuses
    ? undefined
    : (filter.statuses ?? (["open", "in_progress"] as ActionItem["status"][]));

  const conditions: any[] = [];
  if (filter.gpId) conditions.push(eq(actionItems.gamePresenterId, filter.gpId));
  if (filter.userId) conditions.push(eq(actionItems.userId, filter.userId));
  if (statuses && statuses.length > 0) conditions.push(inArray(actionItems.status, statuses));

  let query: any = db.select({ item: actionItems, gp: gamePresenters })
    .from(actionItems)
    .innerJoin(gamePresenters, eq(actionItems.gamePresenterId, gamePresenters.id));

  if (filter.teamId) {
    conditions.push(eq(gamePresenters.teamId, filter.teamId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  // Newest first; within a status, due-soon-first would be better but the
  // dashboard already groups them so chronological is fine.
  const rows = await query.orderBy(desc(actionItems.createdAt));
  return rows.map((r: any) => ({ ...r.item, gamePresenter: r.gp }));
}

/**
 * Aggregate counts by status for one scope — drives the dashboard badge
 * "X open, Y due this week".
 */
export async function getActionItemStats(filter: { gpId?: number; teamId?: number; userId?: number }) {
  const items = await listActionItems({ ...filter, includeAllStatuses: true });
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const stats = {
    open: 0,
    inProgress: 0,
    done: 0,
    cancelled: 0,
    overdue: 0,
    dueThisWeek: 0,
    total: items.length,
  };
  for (const it of items) {
    if (it.status === "open") stats.open++;
    else if (it.status === "in_progress") stats.inProgress++;
    else if (it.status === "done") stats.done++;
    else if (it.status === "cancelled") stats.cancelled++;
    if (it.dueDate && (it.status === "open" || it.status === "in_progress")) {
      const due = new Date(it.dueDate);
      if (due < now) stats.overdue++;
      else if (due <= weekFromNow) stats.dueThisWeek++;
    }
  }
  return stats;
}

/**
 * Verify ownership before destructive operations. An item belongs to a
 * user if either:
 *   - actionItems.userId matches, or
 *   - the underlying GP belongs to the user (back-compat for items
 *     created before userId was set)
 */
export async function verifyActionItemOwnership(itemId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ item: actionItems, gp: gamePresenters })
    .from(actionItems)
    .innerJoin(gamePresenters, eq(actionItems.gamePresenterId, gamePresenters.id))
    .where(eq(actionItems.id, itemId))
    .limit(1);
  if (rows.length === 0) return false;
  const { item, gp } = rows[0];
  return item.userId === userId || gp.userId === userId;
}
