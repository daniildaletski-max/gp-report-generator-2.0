import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json } from "drizzle-orm/mysql-core";

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
 * Game Presenters table - stores unique GP profiles
 */
export const gamePresenters = mysqlTable("game_presenters", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  teamName: varchar("teamName", { length: 255 }),
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
  dealingStyleScore: int("dealingStyleScore"),
  dealingStyleMaxScore: int("dealingStyleMaxScore").default(5),
  dealingStyleComment: text("dealingStyleComment"),
  gamePerformanceScore: int("gamePerformanceScore"),
  gamePerformanceMaxScore: int("gamePerformanceMaxScore").default(5),
  gamePerformanceComment: text("gamePerformanceComment"),
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
 * Reports table - stores generated monthly reports
 */
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  teamName: varchar("teamName", { length: 255 }).notNull(),
  floorManagerName: varchar("floorManagerName", { length: 255 }),
  reportMonth: varchar("reportMonth", { length: 20 }).notNull(),
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
