/**
 * Reports Database Operations
 */
import { eq, and, desc } from "drizzle-orm";
import { reports, InsertReport, Report, fmTeams } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createReport(data: InsertReport): Promise<Report> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reports).values(data);
  const newReport = await db.select().from(reports).where(eq(reports.id, Number(result[0].insertId))).limit(1);
  return newReport[0];
}

export async function updateReport(id: number, data: Partial<InsertReport>): Promise<Report | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(reports).set(data).where(eq(reports.id, id));
  const updated = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return updated.length > 0 ? updated[0] : null;
}

export async function getReportById(id: number): Promise<Report | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getReportWithTeam(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ report: reports, team: fmTeams })
    .from(reports)
    .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
    .where(eq(reports.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllReports(): Promise<Report[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(reports).orderBy(desc(reports.createdAt));
}

export async function getAllReportsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ report: reports, team: fmTeams })
    .from(reports)
    .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.createdAt));
}

export async function getReportsWithTeams() {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ report: reports, team: fmTeams })
    .from(reports)
    .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
    .orderBy(desc(reports.createdAt));
}

export async function getReportsWithTeamsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ report: reports, team: fmTeams })
    .from(reports)
    .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.createdAt));
}

export async function getReportsByTeam(teamId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ report: reports, team: fmTeams })
    .from(reports)
    .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
    .where(eq(reports.teamId, teamId))
    .orderBy(desc(reports.createdAt));
}

export async function getReportByTeamMonthYear(teamId: number, month: number, year: number): Promise<Report | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(reports)
    .where(and(eq(reports.teamId, teamId), eq(reports.reportMonth, month), eq(reports.reportYear, year)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllReportsWithTeam() {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ report: reports, team: fmTeams })
    .from(reports)
    .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
    .orderBy(desc(reports.createdAt));
}

export async function deleteReport(reportId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(reports).where(eq(reports.id, reportId));
}

export async function deleteReportWithCheck(reportId: number, teamId: number | null, isAdmin: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const report = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (report.length === 0) return false;
  if (!isAdmin && report[0].teamId !== teamId) throw new Error("Access denied: You can only delete your team's reports");
  await db.delete(reports).where(eq(reports.id, reportId));
  return true;
}

export async function deleteReportWithCheckByUser(reportId: number, userId: number, isAdmin: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const report = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (report.length === 0) return false;
  if (!isAdmin && report[0].userId !== userId) throw new Error("Access denied: You can only delete your own reports");
  await db.delete(reports).where(eq(reports.id, reportId));
  return true;
}

export async function deleteReportWithCheckByTeam(reportId: number, teamId: number | null, isAdmin: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const report = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (report.length === 0) return false;
  if (!isAdmin && report[0].teamId !== teamId) throw new Error("Access denied: You can only delete your team's reports");
  await db.delete(reports).where(eq(reports.id, reportId));
  return true;
}
