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
  teamId: int("teamId"), // Link FM to their team
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
  teamName: varchar("teamName", { length: 255 }).notNull(),
  floorManagerName: varchar("floorManagerName", { length: 255 }).notNull(),
  userId: int("userId"), // Owner of this team - for user data isolation
  personaProjectId: int("personaProjectId"), // Persona schedule project ID for auto-sync
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
  /**
   * The GP's real-life legal name as it appears in HR systems like
   * Persona / payroll / shift schedules. The `name` column above is
   * the dealer pseudonym used on the casino floor (e.g. "Clover"),
   * which usually doesn't match what HR has on file ("Aleksandra
   * Borovkova"). When set, Persona sync prefers this column for name
   * matching, then falls back to fuzzy match on `name`.
   */
  realName: varchar("realName", { length: 255 }),
  teamId: int("teamId"),
  userId: int("userId"), // Owner of this GP record - for user data isolation
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
  userId: int("userId"), // Owner of this evaluation - for user data isolation
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
  userId: int("userId"), // Owner of this error file - for user data isolation
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
  userId: int("userId"), // Owner of this error record - for user data isolation
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
  userId: int("userId"), // Owner of this report - for user data isolation
  reportMonth: int("reportMonth").notNull(),
  reportYear: int("reportYear").notNull(),
  fmPerformance: text("fmPerformance"),
  goalsThisMonth: text("goalsThisMonth"),
  teamOverview: text("teamOverview"),
  additionalComments: text("additionalComments"),
  /**
   * Executive summary — 1-paragraph board-ready narrative covering:
   * the headline, the most important metric movement vs prior month,
   * the team-level theme, and the recommended next-month focus. The
   * field that lets the recipient read the report WITHOUT opening
   * Excel. Kept as a separate text column (not inside reportData) so
   * we can render it directly in the email body and in the report
   * preview UI.
   */
  executiveSummary: text("executiveSummary"),
  /**
   * Top wins (3-5) and top concerns (3-5) for the month, both as
   * markdown-bullet strings. Written by the LLM and editable by the
   * FM in the Reports preview UI.
   */
  topWins: text("topWins"),
  topConcerns: text("topConcerns"),
  /**
   * Per-GP narrative reviews — array of `{ gpId, gpName, narrative,
   * focusForNextMonth }` rendered as-is into a Per-GP Reviews sheet
   * + the email body. JSON because the array length is variable and
   * the order is meaningful (sorted by riskScore so concerning GPs
   * come first).
   */
  perGpReviews: json("perGpReviews"),
  reportData: json("reportData"),
  excelFileUrl: text("excelFileUrl"),
  excelFileKey: varchar("excelFileKey", { length: 512 }),
  googleSheetsUrl: text("googleSheetsUrl"),
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


/**
 * GP Access Tokens - unique access links for Game Presenters to view their evaluations
 */
export const gpAccessTokens = mysqlTable("gp_access_tokens", {
  id: int("id").autoincrement().primaryKey(),
  gamePresenterId: int("gamePresenterId").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  isActive: int("isActive").default(1).notNull(), // 1 = active, 0 = inactive
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastAccessedAt: timestamp("lastAccessedAt"),
});

export type GpAccessToken = typeof gpAccessTokens.$inferSelect;
export type InsertGpAccessToken = typeof gpAccessTokens.$inferInsert;

/**
 * Monthly GP Stats - stores attitude and mistakes per GP per month
 */
export const monthlyGpStats = mysqlTable("monthly_gp_stats", {
  id: int("id").autoincrement().primaryKey(),
  gamePresenterId: int("gamePresenterId").notNull(),
  month: int("month").notNull(), // 1-12
  year: int("year").notNull(),
  attitude: int("attitude"), // Score 1-5 or similar
  mistakes: int("mistakes").default(0), // Count of mistakes
  totalGames: int("totalGames").default(0), // Total games played for bonus calculation
  notes: text("notes"), // Optional notes
  updatedById: int("updatedById"),
  userId: int("userId"), // Owner of this stats record - for user data isolation
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MonthlyGpStats = typeof monthlyGpStats.$inferSelect;
export type InsertMonthlyGpStats = typeof monthlyGpStats.$inferInsert;

/**
 * Invitations - invite-only registration for Floor Managers
 */
export const invitations = mysqlTable("invitations", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  teamId: int("teamId"), // Pre-assign team on invitation
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "expired", "revoked"]).default("pending").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdById: int("createdById").notNull(), // Admin who created the invitation
  usedById: int("usedById"), // User who accepted the invitation
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;

/**
 * Error Screenshots - individual error screenshots uploaded by Floor Managers
 */
export const errorScreenshots = mysqlTable("error_screenshots", {
  id: int("id").autoincrement().primaryKey(),
  gamePresenterId: int("gamePresenterId"),
  evaluationId: int("evaluationId"), // Link to evaluation if matched
  gpName: varchar("gpName", { length: 255 }), // Name extracted from screenshot
  errorDate: timestamp("errorDate"),
  errorType: varchar("errorType", { length: 100 }), // Classification: dealing_error, procedure_error, etc.
  errorCategory: varchar("errorCategory", { length: 100 }), // Sub-category
  errorDescription: text("errorDescription"), // Detailed description from screenshot
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium"),
  gameType: varchar("gameType", { length: 100 }),
  tableId: varchar("tableId", { length: 100 }),
  screenshotUrl: text("screenshotUrl"),
  screenshotKey: varchar("screenshotKey", { length: 512 }),
  rawExtractedData: json("rawExtractedData"), // Full AI extraction result
  month: int("month").notNull(),
  year: int("year").notNull(),
  uploadedById: int("uploadedById"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ErrorScreenshot = typeof errorScreenshots.$inferSelect;
export type InsertErrorScreenshot = typeof errorScreenshots.$inferInsert;

/**
 * Attitude Screenshots - attitude evaluation screenshots uploaded by Floor Managers
 */
export const attitudeScreenshots = mysqlTable("attitude_screenshots", {
  id: int("id").autoincrement().primaryKey(),
  gamePresenterId: int("gamePresenterId"),
  evaluationId: int("evaluationId"), // Link to evaluation if matched
  gpName: varchar("gpName", { length: 255 }), // Name extracted from screenshot
  evaluationDate: timestamp("evaluationDate"),
  attitudeType: mysqlEnum("attitudeType", ["positive", "negative", "neutral"]).default("neutral"), // POSITIVE/NEGATIVE from screenshot
  attitudeScore: int("attitudeScore"), // +1 or -1 score
  attitudeCategory: varchar("attitudeCategory", { length: 100 }), // positive, neutral, negative
  comment: text("comment"), // Comment from screenshot
  description: text("description"), // Detailed description from screenshot
  evaluatorName: varchar("evaluatorName", { length: 255 }),
  screenshotUrl: text("screenshotUrl"),
  screenshotKey: varchar("screenshotKey", { length: 512 }),
  rawExtractedData: json("rawExtractedData"), // Full AI extraction result
  month: int("month").notNull(),
  year: int("year").notNull(),
  uploadedById: int("uploadedById"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AttitudeScreenshot = typeof attitudeScreenshots.$inferSelect;
export type InsertAttitudeScreenshot = typeof attitudeScreenshots.$inferInsert;

/**
 * Action Items / Coaching Plans
 *
 * FM-authored development tasks tied to a GP. Drives the coaching
 * workflow: open → in_progress → done (or cancelled). `source` records
 * whether an item was typed manually or generated by the AI insights
 * service so we can measure suggestion quality.
 *
 * Read by FMs/admin (full CRUD scoped by userId) and by GPs through the
 * public portal (read-only) so the GP knows what they're being asked
 * to work on.
 */
export const actionItems = mysqlTable("action_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // tenant ownership
  gamePresenterId: int("gamePresenterId").notNull(),
  createdById: int("createdById"), // FM/admin who created the item
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", [
    "appearance", "performance", "attitude", "attendance", "errors", "general",
  ]).default("general").notNull(),
  status: mysqlEnum("status", [
    "open", "in_progress", "done", "cancelled",
  ]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  source: mysqlEnum("source", ["manual", "ai_insight"]).default("manual").notNull(),
  dueDate: timestamp("dueDate"),
  completedAt: timestamp("completedAt"),
  completionNote: text("completionNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ActionItem = typeof actionItems.$inferSelect;
export type InsertActionItem = typeof actionItems.$inferInsert;

/**
 * Persona Sync Log
 *
 * Records every Persona scrape attempt — manual or scheduled — so
 * admins can see when each team last got fresh attendance data and
 * why a sync failed if it did.
 */
export const personaSyncLogs = mysqlTable("persona_sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  teamId: int("teamId").notNull(),
  triggeredById: int("triggeredById"), // null when triggered by cron
  source: mysqlEnum("source", ["manual", "scheduled"]).default("manual").notNull(),
  month: int("month").notNull(),
  year: int("year").notNull(),
  status: mysqlEnum("status", ["success", "partial", "failed"]).notNull(),
  totalWorkers: int("totalWorkers").default(0).notNull(),
  matched: int("matched").default(0).notNull(),
  unmatched: int("unmatched").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type PersonaSyncLog = typeof personaSyncLogs.$inferSelect;
export type InsertPersonaSyncLog = typeof personaSyncLogs.$inferInsert;

/**
 * Persona Name Aliases
 *
 * Persistent map from a Persona-side worker name to a GP id. When sync
 * encounters a name in this table for the team, the alias wins and we
 * skip the fuzzy matcher entirely — solves the "every month, the same
 * 12 names fail to fuzzy-match" pain point. FMs add aliases via the
 * Reconcile panel after a sync surfaces unmatched names.
 *
 * Scoped to (teamId, personaName) — same Persona name can map to
 * different GPs in different teams (rare but possible).
 */
export const personaNameAliases = mysqlTable("persona_name_aliases", {
  id: int("id").autoincrement().primaryKey(),
  teamId: int("teamId").notNull(),
  personaName: varchar("personaName", { length: 255 }).notNull(),
  /** GP this Persona name resolves to. */
  gamePresenterId: int("gamePresenterId").notNull(),
  /** User who created the alias — usually the FM resolving the
   *  mismatch. Used for an audit trail when admin reviews stale
   *  mappings. */
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PersonaNameAlias = typeof personaNameAliases.$inferSelect;
export type InsertPersonaNameAlias = typeof personaNameAliases.$inferInsert;

