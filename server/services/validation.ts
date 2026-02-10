/**
 * Shared Zod validation schemas
 * Centralized input validation to reduce duplication across routes
 */
import { z } from "zod";
import { SCORE_CONFIG } from "@shared/const";

// ============================
// Common field validators
// ============================

export const positiveId = z.number().positive().int();

export const monthSchema = z.number().min(1).max(12).int();
export const yearSchema = z.number().min(2020).max(2100).int();

export const monthYearInput = z.object({
  month: monthSchema,
  year: yearSchema,
});

export const paginationInput = z.object({
  page: z.number().min(1).int().default(1),
  limit: z.number().min(1).max(100).int().default(50),
});

// ============================
// Image upload validators
// ============================

export const imageBase64Schema = z.string().max(10 * 1024 * 1024); // Max 10MB base64
export const safeFilenameSchema = z.string().max(255).regex(/^[\w\-. ]+$/);
export const imageMimeTypeSchema = z.string().refine(
  m => ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(m),
  { message: 'Invalid image type. Allowed: PNG, JPEG, WebP' }
);

export const imageUploadInput = z.object({
  imageBase64: imageBase64Schema,
  filename: safeFilenameSchema,
  mimeType: imageMimeTypeSchema,
});

// ============================
// Evaluation score validators
// ============================

export const hairScoreSchema = z.number().min(0).max(SCORE_CONFIG.hair.max);
export const makeupScoreSchema = z.number().min(0).max(SCORE_CONFIG.makeup.max);
export const outfitScoreSchema = z.number().min(0).max(SCORE_CONFIG.outfit.max);
export const postureScoreSchema = z.number().min(0).max(SCORE_CONFIG.posture.max);
export const dealingStyleScoreSchema = z.number().min(0).max(SCORE_CONFIG.dealingStyle.max);
export const gamePerformanceScoreSchema = z.number().min(0).max(SCORE_CONFIG.gamePerformance.max);

export const commentSchema = z.string().max(1000);

export const evaluationUpdateInput = z.object({
  id: positiveId,
  evaluatorName: z.string().max(255).optional(),
  evaluationDate: z.date().optional(),
  game: z.string().max(100).optional(),
  totalScore: z.number().min(0).max(100).optional(),
  hairScore: hairScoreSchema.optional(),
  makeupScore: makeupScoreSchema.optional(),
  outfitScore: outfitScoreSchema.optional(),
  postureScore: postureScoreSchema.optional(),
  dealingStyleScore: dealingStyleScoreSchema.optional(),
  gamePerformanceScore: gamePerformanceScoreSchema.optional(),
  hairComment: commentSchema.optional(),
  makeupComment: commentSchema.optional(),
  outfitComment: commentSchema.optional(),
  postureComment: commentSchema.optional(),
  dealingStyleComment: commentSchema.optional(),
  gamePerformanceComment: commentSchema.optional(),
});

// ============================
// Team validators
// ============================

export const teamCreateInput = z.object({
  teamName: z.string().min(1).max(100).trim(),
  floorManagerName: z.string().min(1).max(100).trim(),
});

export const teamUpdateInput = z.object({
  teamId: positiveId,
  teamName: z.string().min(1).max(100).trim().optional(),
  floorManagerName: z.string().min(1).max(100).trim().optional(),
  gpIds: z.array(positiveId).optional(),
});

// ============================
// Attendance validators
// ============================

export const attendanceUpdateInput = z.object({
  gpId: positiveId,
  month: monthSchema,
  year: yearSchema,
  extraShifts: z.number().min(0).optional(),
  lateToWork: z.number().min(0).optional(),
  missedDays: z.number().min(0).optional(),
  sickLeaves: z.number().min(0).optional(),
  remarks: z.string().max(2000).optional(),
});

export const attendanceBulkUpdateInput = z.object({
  teamId: positiveId,
  month: monthSchema,
  year: yearSchema,
  updates: z.array(z.object({
    gpId: positiveId,
    extraShifts: z.number().min(0).optional(),
    lateToWork: z.number().min(0).optional(),
    missedDays: z.number().min(0).optional(),
    sickLeaves: z.number().min(0).optional(),
    remarks: z.string().max(2000).optional(),
  })),
});

// ============================
// Report validators
// ============================

export const reportGenerateInput = z.object({
  teamId: positiveId,
  reportMonth: monthSchema,
  reportYear: yearSchema,
  fmPerformance: z.string().max(5000).optional(),
  goalsThisMonth: z.string().max(5000).optional(),
  teamOverview: z.string().max(5000).optional(),
  additionalComments: z.string().max(5000).optional(),
});

// ============================
// GP Stats validators
// ============================

export const gpStatsUpdateInput = z.object({
  gpId: positiveId,
  month: monthSchema,
  year: yearSchema,
  attitude: z.number().nullable().optional(),
  mistakes: z.number().min(0).optional(),
  totalGames: z.number().min(0).optional(),
  notes: z.string().nullable().optional(),
});

export const gpBulkStatsUpdateInput = z.object({
  updates: z.array(z.object({
    gpId: positiveId,
    attitude: z.number().nullable().optional(),
    mistakes: z.number().min(0).optional(),
    notes: z.string().nullable().optional(),
  })),
  month: monthSchema,
  year: yearSchema,
});

// ============================
// Invitation validators
// ============================

export const invitationCreateInput = z.object({
  email: z.string().trim().email().max(255),
  teamId: positiveId.optional().nullable(),
  role: z.enum(['user', 'admin']).default('user'),
});

export const invitationBulkCreateInput = z.object({
  emails: z.array(z.string().trim().email().max(255)).min(1).max(50),
  teamId: positiveId.optional().nullable(),
  role: z.enum(['user', 'admin']).default('user'),
});

// ============================
// Error file validators
// ============================

export const errorFileUploadInput = z.object({
  fileBase64: z.string(),
  filename: z.string().max(255),
  month: monthSchema,
  year: yearSchema,
  errorType: z.enum(["playgon", "mg"]),
});
