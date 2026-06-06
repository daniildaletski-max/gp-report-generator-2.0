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
  /**
   * Direct email address for the team's Floor Manager. When set, the
   * Team Monthly Overview email is delivered straight to this address
   * — admins can route reports to FMs without first creating a `users`
   * row for them. Falls back to the user link below when null.
   */
  managerEmail: varchar("managerEmail", { length: 320 }),
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
  /**
   * Rubric version this evaluation was scored under. Null on legacy rows
   * until the boot-time backfill tags them as v1 (rubric_versions.id = 1).
   * Lets historical scores stay comparable when the rubric changes.
   */
  rubricVersionId: int("rubricVersionId"),
  /**
   * Per-criterion scores keyed by criterion key (e.g. { hair: 3, ... }).
   * The forward-looking source of truth that replaces the fixed
   * `<criterion>Score` columns. Dual-written alongside the legacy columns
   * during the transition; backfilled from them for historical rows.
   */
  scores: json("scores").$type<Record<string, number>>(),
  /**
   * 1 when the evaluation looks suspect (out-of-range score, or an
   * AI-provided total that disagrees with the sum of sub-scores) and a
   * human should re-check it. Drives the "needs review" queue.
   */
  needsReview: int("needsReview").default(0),
  reviewReason: varchar("reviewReason", { length: 512 }),
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
 * Rubrics — a named scoring scheme. Today there is exactly one ("Default
 * GP Evaluation"), but the table exists so the rubric can be edited and
 * re-versioned from the admin UI instead of being hardcoded across the
 * schema, const.ts, the exporters and the portal.
 */
export const rubrics = mysqlTable("rubrics", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: int("isActive").default(1).notNull(), // 1 = active, 0 = retired
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Rubric = typeof rubrics.$inferSelect;
export type InsertRubric = typeof rubrics.$inferInsert;

/**
 * Rubric versions — an immutable snapshot of a rubric's criteria. Editing
 * a rubric creates a new version rather than mutating the current one, so
 * an evaluation scored under v1 stays comparable forever. `version` 1 is
 * the seeded original (Hair/Makeup/Outfit/Posture = 12, Dealing/Game = 10).
 */
export const rubricVersions = mysqlTable("rubric_versions", {
  id: int("id").autoincrement().primaryKey(),
  rubricId: int("rubricId").notNull(),
  version: int("version").notNull(), // 1, 2, 3, …
  label: varchar("label", { length: 255 }).notNull(),
  /** First date this version applies to. New evaluations pick the active
   *  version effective on their evaluation date. */
  effectiveFrom: timestamp("effectiveFrom"),
  /** Sum of all criteria maxes — denormalised for quick "/22"-style display. */
  totalMax: int("totalMax").default(0).notNull(),
  /** Once locked, the version's criteria must not change (enforced in app). */
  isLocked: int("isLocked").default(0).notNull(),
  /** 1 = this is the version new evaluations are scored under for its rubric. */
  isActive: int("isActive").default(0).notNull(),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RubricVersion = typeof rubricVersions.$inferSelect;
export type InsertRubricVersion = typeof rubricVersions.$inferInsert;

/**
 * Rubric criteria — one row per scored criterion within a version. Column
 * names avoid the MySQL reserved words `key` and `group`.
 */
export const rubricCriteria = mysqlTable("rubric_criteria", {
  id: int("id").autoincrement().primaryKey(),
  versionId: int("versionId").notNull(),
  /** Stable identifier, e.g. "hair". Matches the JSON key in evaluations.scores. */
  key: varchar("criterionKey", { length: 64 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  maxScore: int("maxScore").notNull(),
  /** Roll-up bucket: "appearance" or "game". */
  group: mysqlEnum("criterionGroup", ["appearance", "game"]).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
});

export type RubricCriterion = typeof rubricCriteria.$inferSelect;
export type InsertRubricCriterion = typeof rubricCriteria.$inferInsert;

/**
 * Evaluation revisions — an append-only audit trail of edits to an
 * evaluation. Every `updateEvaluation` that actually changes a field
 * writes one row here BEFORE applying the change, capturing who edited
 * it, an optional reason, the changed fields (old -> new) and a full
 * snapshot of the row as it was. Makes score edits explainable instead
 * of silently destructive ("I was given 14, then it became 12").
 */
export const evaluationRevisions = mysqlTable("evaluation_revisions", {
  id: int("id").autoincrement().primaryKey(),
  evaluationId: int("evaluationId").notNull(),
  editedById: int("editedById"),
  reason: text("reason"),
  /** Map of field -> { old, new } for the fields that changed. */
  changedFields: json("changedFields").$type<Record<string, { old: unknown; new: unknown }>>(),
  /** Full evaluation row as it stood before this edit. */
  snapshotBefore: json("snapshotBefore"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EvaluationRevision = typeof evaluationRevisions.$inferSelect;
export type InsertEvaluationRevision = typeof evaluationRevisions.$inferInsert;

/**
 * GP Monthly Attendance - tracks attendance metrics per GP per month
 */
export const gpMonthlyAttendance = mysqlTable("gp_monthly_attendance", {
  id: int("id").autoincrement().primaryKey(),
  gamePresenterId: int("gamePresenterId").notNull(),
  month: int("month").notNull(), // 1-12
  year: int("year").notNull(),
  /** @deprecated Source of truth is monthly_gp_stats.mistakes. Kept for
   *  back-compat; ensureMistakesConsolidated() backfills stats from here. */
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
  attitude: int("attitude"), // Net attitude: sum of +1/-1 screenshot events, or a manual override
  /**
   * 1 = `attitude` was set manually by an FM and must NOT be recomputed
   * from screenshots. 0/null = derived: attitude is kept in sync with the
   * sum of attitudeScreenshots scores for this GP/month.
   */
  attitudeIsManual: int("attitudeIsManual").default(0),
  mistakes: int("mistakes").default(0), // Count of mistakes
  totalGames: int("totalGames").default(0), // Total games played for bonus calculation
  /**
   * Worked hours in the month — the multiplier in the performance bonus
   * (bonus = rate × worked hours). NULL = not recorded; the bonus engine
   * then derives an estimate from attendance (base month ± shift deltas).
   */
  workedHours: int("workedHours"),
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

