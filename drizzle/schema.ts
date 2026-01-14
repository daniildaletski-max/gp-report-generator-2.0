import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Floor Manager Teams - pre-configured teams
 */
export const fmTeams = mysqlTable("fm_teams", {
  id: int("id").autoincrement().primaryKey(),
  teamName: varchar("teamName", { length: 255 }).notNull().unique(),
  floorManagerName: varchar("floorManagerName", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FmTeam = typeof fmTeams.$inferSelect;
export type InsertFmTeam = typeof fmTeams.$inferInsert;

/**
 * Game Presenters table - stores unique GP profiles
 */
export const gamePresenters = mysqlTable("game_presenters", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  teamId: int("teamId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GamePresenter = typeof gamePresenters.$inferSelect;
export type InsertGamePresenter = typeof gamePresenters.$inferInsert;

/**
 * Evaluations table - stores individual evaluation records extracted from screenshots
 */
export const evaluations = mysqlTable("evaluations", {
  id: int("id").autoincrement().primaryKey(),
  gamePresenterId: int("gamePresenterId").notNull(),
  evaluatorName: varchar("evaluatorName", { length: 255 }),
  evaluationDate: timestamp("evaluationDate"),
  game: varchar("game", { length: 100 }),
  totalScore: int("totalScore"),
  // Appearance scores (max 12 total)
  hairScore: int("hairScore"),
  hairMaxScore: int("hairMaxScore").default(3),
  hairComment: text("hairComment"),
  makeupScore: int("makeupScore"),
  makeupMaxScore: int("makeupMaxScore").default(3),
  makeupComment: text("makeupComment"),
  outfitScore: int("outfitScore"),
  outfitMaxScore: int("outfitMaxScore").default(3),
  outfitComment: text("outfitComment"),
  postureScore: int("postureScore"),
  postureMaxScore: int("postureMaxScore").default(3),
  postureComment: text("postureComment"),
  // Game Performance scores (max 10 total)
  dealingStyleScore: int("dealingStyleScore"),
  dealingStyleMaxScore: int("dealingStyleMaxScore").default(5),
  dealingStyleComment: text("dealingStyleComment"),
  gamePerformanceScore: int("gamePerformanceScore"),
  gamePerformanceMaxScore: int("gamePerformanceMaxScore").default(5),
  gamePerformanceComment: text("gamePerformanceComment"),
  // Calculated scores for template
  appearanceScore: int("appearanceScore"), // Hair + Makeup + Outfit + Posture
  gamePerformanceTotalScore: int("gamePerformanceTotalScore"), // Dealing + GamePerf
  screenshotUrl: text("screenshotUrl"),
  screenshotKey: varchar("screenshotKey", { length: 512 }),
  rawExtractedData: json("rawExtractedData"),
  uploadedById: int("uploadedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Evaluation = typeof evaluations.$inferSelect;
export type InsertEvaluation = typeof evaluations.$inferInsert;

/**
 * GP Monthly Attendance - tracks attendance metrics per GP per month
 */
export const gpMonthlyAttendance = mysqlTable("gp_monthly_attendance", {
  id: int("id").autoincrement().primaryKey(),
  gamePresenterId: int("gamePresenterId").notNull(),
  month: int("month").notNull(), // 1-12
  year: int("year").notNull(),
  mistakes: int("mistakes").default(0),
  extraShifts: int("extraShifts").default(0),
  lateToWork: int("lateToWork").default(0),
  missedDays: int("missedDays").default(0),
  sickLeaves: int("sickLeaves").default(0),
  remarks: text("remarks"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GpMonthlyAttendance = typeof gpMonthlyAttendance.$inferSelect;
export type InsertGpMonthlyAttendance = typeof gpMonthlyAttendance.$inferInsert;

/**
 * Error Files - stores uploaded error files (Playgon/MG)
 */
export const errorFiles = mysqlTable("error_files", {
  id: int("id").autoincrement().primaryKey(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  fileType: mysqlEnum("fileType", ["playgon", "mg"]).notNull(),
  month: int("month").notNull(),
  year: int("year").notNull(),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  processedAt: timestamp("processedAt"),
  uploadedById: int("uploadedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ErrorFile = typeof errorFiles.$inferSelect;
export type InsertErrorFile = typeof errorFiles.$inferInsert;

/**
 * GP Errors - individual error records extracted from error files
 */
export const gpErrors = mysqlTable("gp_errors", {
  id: int("id").autoincrement().primaryKey(),
  errorFileId: int("errorFileId").notNull(),
  gamePresenterId: int("gamePresenterId"),
  gpName: varchar("gpName", { length: 255 }).notNull(),
  gpAlias: varchar("gpAlias", { length: 255 }),
  errorDate: timestamp("errorDate"),
  errorCode: varchar("errorCode", { length: 50 }),
  gameType: varchar("gameType", { length: 50 }),
  tableId: varchar("tableId", { length: 100 }),
  errorDescription: text("errorDescription"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GpError = typeof gpErrors.$inferSelect;
export type InsertGpError = typeof gpErrors.$inferInsert;

/**
 * Reports table - stores generated monthly reports
 */
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  teamId: int("teamId").notNull(),
  reportMonth: int("reportMonth").notNull(),
  reportYear: int("reportYear").notNull(),
  fmPerformance: text("fmPerformance"),
  goalsThisMonth: text("goalsThisMonth"),
  teamOverview: text("teamOverview"),
  additionalComments: text("additionalComments"),
  reportData: json("reportData"),
  excelFileUrl: text("excelFileUrl"),
  excelFileKey: varchar("excelFileKey", { length: 512 }),
  status: mysqlEnum("status", ["draft", "generated", "finalized"]).default("draft").notNull(),
  generatedById: int("generatedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

/**
 * Upload batches - tracks batch uploads of screenshots
 */
export const uploadBatches = mysqlTable("upload_batches", {
  id: int("id").autoincrement().primaryKey(),
  uploadedById: int("uploadedById").notNull(),
  totalFiles: int("totalFiles").default(0),
  processedFiles: int("processedFiles").default(0),
  failedFiles: int("failedFiles").default(0),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UploadBatch = typeof uploadBatches.$inferSelect;
export type InsertUploadBatch = typeof uploadBatches.$inferInsert;
