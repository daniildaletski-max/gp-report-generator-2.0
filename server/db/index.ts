/**
 * Database Module - Barrel Export
 * 
 * Re-exports all domain-specific database operations from modular files.
 * Import from here for backward compatibility: import * as db from "./db"
 * 
 * Domain Modules:
 *   connection.ts   - DB connection with retry logic
 *   users.ts        - User CRUD & authentication
 *   teams.ts        - FM Teams & GP assignment
 *   gamePresenters.ts - Game Presenter CRUD & fuzzy matching
 *   evaluations.ts  - Evaluation CRUD & aggregation
 *   attendance.ts   - GP monthly attendance
 *   monthlyStats.ts - Monthly stats, bulk ops, GP history
 *   errors.ts       - Error files, GP errors, error screenshots
 *   screenshots.ts  - Attitude screenshots
 *   reports.ts      - Report CRUD & ownership checks
 *   dashboard.ts    - Dashboard stats, trends, comparisons
 *   tokens.ts       - GP access tokens & invitations
 *   uploads.ts      - Upload batches & sanitization
 */

export { getDb } from "./connection";

// Users
export {
  upsertUser, getUserByOpenId, getAllUsers, getUserById,
  getUserWithTeam, updateUserTeam, updateUserEmail,
  updateUserRole, deleteUser, updateUserFromInvitation,
} from "./users";

// FM Teams
export {
  getAllFmTeams, getFmTeamById, createFmTeam, initializeDefaultTeams,
  updateFmTeam, deleteFmTeam, getTeamById, getTeamWithUsers,
  getAllTeamsWithStats, getFmTeamsByUser,
  getGPsByTeam, assignGPsToTeam, removeGPsFromTeam, getUnassignedGPs,
  getTeamWithGPs, updateTeamWithGPs, getAllTeamsWithGPs,
  getTeamsWithGPsByUser, getUnassignedGPsByUser,
} from "./teams";

// Game Presenters
export {
  findBestMatchingGP, findAllMatchingGPs,
  findAllMatchingGPsByUser, findBestMatchingGPByUser,
  findOrCreateGamePresenter,
  getAllGamePresenters, getAllGamePresentersByUser,
  getGamePresentersByTeam, getGamePresenterById,
  updateGamePresenterTeam, deleteGamePresenter,
  verifyGpOwnership, verifyGpOwnershipByUser, verifyGpOwnershipByTeam,
} from "./gamePresenters";
export type { FuzzyMatchResult } from "./gamePresenters";

// Evaluations
export {
  createEvaluation, updateEvaluation, deleteEvaluation,
  deleteEvaluationsByDateRange, deleteEvaluationsByMonth,
  deleteEvaluationsByDateRangeAndUser, deleteEvaluationsByMonthAndUser,
  getEvaluationById, getEvaluationsByGP, getEvaluationsByGPAndMonth,
  getEvaluationsByMonth, getEvaluationsByMonthAndUser,
  getAllEvaluations, getAllEvaluationsByUser,
  getEvaluationWithGP, getEvaluationsWithGP, getEvaluationsWithGPByUser,
  getEvaluationsByTeam,
  getGPMonthlyStats, getGPEvaluationsForDataSheet, getGpEvaluationsForPortal,
} from "./evaluations";

// Attendance
export {
  getOrCreateAttendance, updateAttendance, getAttendanceByTeamMonth,
} from "./attendance";

// Monthly Stats
export {
  getOrCreateMonthlyGpStats, updateMonthlyGpStats,
  getMonthlyGpStatsByTeam, getAllMonthlyGpStats, getMonthlyGpStats,
  getGamePresentersByTeamWithStats,
  bulkUpdateMonthlyGpStats, bulkSetAttitude, bulkResetMistakes,
  incrementGPMistakes, updateGPAttitude,
  getGpMonthlyHistory, syncErrorsFromGoogleSheets,
} from "./monthlyStats";
export type { BulkGpStatsUpdate, GoogleSheetsErrorData } from "./monthlyStats";

// Errors
export {
  createErrorFile, getErrorFileByMonthYearType, getAllErrorFiles,
  deleteErrorFile, getErrorFilesByUser, deleteErrorFileByUser,
  createGpError, deleteGpErrorsByMonthYear, getErrorCountByGP,
  updateGPMistakesFromErrors, updateGPMistakesDirectly, getGpErrorsForPortal,
  createErrorScreenshot, getErrorScreenshots, getErrorScreenshotsByGpId,
  deleteErrorScreenshot, getErrorScreenshotStats, getErrorScreenshotsForGP,
  getErrorScreenshotsByUser, getErrorScreenshotStatsByUser, deleteErrorScreenshotByUser,
} from "./errors";

// Attitude Screenshots
export {
  createAttitudeScreenshot, getAttitudeScreenshots, getAttitudeScreenshotsByGpId,
  deleteAttitudeScreenshot, getAttitudeScreenshotsForGP,
  getAllAttitudeScreenshots, getAttitudeScreenshotsByUser,
  getAllAttitudeScreenshotsByUser, deleteAttitudeScreenshotByUser,
} from "./screenshots";

// Reports
export {
  createReport, updateReport, getReportById, getReportWithTeam,
  getAllReports, getAllReportsByUser, getReportsWithTeams,
  getReportsWithTeamsByUser, getReportsByTeam, getReportByTeamMonthYear,
  getAllReportsWithTeam, deleteReport,
  deleteReportWithCheck, deleteReportWithCheckByUser, deleteReportWithCheckByTeam,
} from "./reports";

// Dashboard & Analytics
export {
  getDashboardStats, getDashboardStatsByTeam, getDashboardStatsByUser,
  getAdminDashboardStats, getMonthlyTrendData, getTeamComparisonData,
} from "./dashboard";

// Tokens & Invitations
export {
  createGpAccessToken, getGpAccessTokenByToken, getGpAccessTokenByGpId,
  getGpAccessTokenById, getAllGpAccessTokens, getGpAccessTokensByTeam,
  getGpAccessTokensByUser, deactivateGpAccessToken, updateGpAccessTokenLastAccess,
  createInvitation, getInvitationByToken, getInvitationByEmail,
  getAllInvitations, updateInvitationStatus, getInvitationStats,
  expireOldInvitations, deleteInvitation,
} from "./tokens";

// Uploads & Sanitization
export {
  createUploadBatch, updateUploadBatch,
  sanitizeString, sanitizeNumber, validateEmail, validateDateRange,
} from "./uploads";
