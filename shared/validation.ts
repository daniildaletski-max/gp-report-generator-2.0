import { z } from "zod";

export const EvaluationSchema = z.object({
  gpName: z.string().min(1, "GP name is required").trim(),
  date: z.date().or(z.string().datetime()),
  fmName: z.string().min(1, "FM name is required").trim(),
  performance: z.number().int().min(0, "Performance must be at least 0").max(10, "Performance must be at most 10"),
  attitude: z.number().int().min(0, "Attitude must be at least 0").max(10, "Attitude must be at most 10"),
  errorCount: z.number().int().min(0, "Error count cannot be negative"),
  comments: z.string().optional().default(""),
  teamId: z.string().min(1, "Team ID is required"),
});

export const AttendanceSchema = z.object({
  gpName: z.string().min(1, "GP name is required").trim(),
  date: z.date().or(z.string().date()),
  status: z.enum(["present", "absent", "sick_leave", "vacation", "late"]),
  hoursWorked: z.number().min(0).max(24, "Hours must be between 0 and 24"),
  teamId: z.string().min(1, "Team ID is required"),
  notes: z.string().optional().default(""),
});

export const ErrorReportSchema = z.object({
  gpName: z.string().min(1, "GP name is required").trim(),
  errorType: z.enum(["game_error", "procedure_violation", "system_error", "other"]),
  description: z.string().min(5, "Description must be at least 5 characters"),
  severity: z.enum(["low", "medium", "high", "critical"]),
  date: z.date().or(z.string().datetime()),
  teamId: z.string().min(1, "Team ID is required"),
  resolved: z.boolean().default(false),
  resolutionNotes: z.string().optional().default(""),
});

export const BonusCalculationSchema = z.object({
  gpId: z.string().min(1, "GP ID is required"),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000),
  totalGamesPlayed: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  hoursWorked: z.number().min(0),
  bonusLevel: z.enum(["level1", "level2", "ineligible"]),
  minimumGGsRequired: z.number().int().min(0),
  achievedGGs: z.number().int().min(0),
  bonusRate: z.number().min(0),
  bonusAmount: z.number().min(0),
  isEligible: z.boolean(),
  disqualifyingFactors: z.array(z.string()).default([]),
});

export const GPPortalAccessSchema = z.object({
  gpId: z.string().min(1, "GP ID is required"),
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  teamId: z.string().min(1, "Team ID is required"),
  role: z.enum(["gp", "fm", "admin"]).default("gp"),
});

export const BulkUploadSchema = z.object({
  file: z.instanceof(File).refine((file) => file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.type === "application/vnd.ms-excel", "File must be an Excel file"),
  uploadType: z.enum(["evaluations", "errors", "attendance"]),
  teamId: z.string().min(1, "Team ID is required"),
});

export const ReportFilterSchema = z.object({
  startDate: z.date().or(z.string().date()),
  endDate: z.date().or(z.string().date()),
  teamId: z.string().optional(),
  gpName: z.string().optional().transform((v) => v?.trim()),
  fmName: z.string().optional().transform((v) => v?.trim()),
  minPerformance: z.number().int().min(0).max(10).optional(),
  maxPerformance: z.number().int().min(0).max(10).optional(),
  includeInactive: z.boolean().default(false),
}).refine((data) => data.endDate >= data.startDate, {
  message: "End date must be after or equal to start date",
  path: ["endDate"],
});

export const PagedQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const CommentSchema = z.object({
  text: z.string().min(1, "Comment cannot be empty").max(500, "Comment must be less than 500 characters").trim(),
  entityType: z.enum(["evaluation", "error", "gp", "report"]),
  entityId: z.string().min(1, "Entity ID is required"),
  isPrivate: z.boolean().default(false),
});

export const TeamSchema = z.object({
  name: z.string().min(1, "Team name is required").trim(),
  description: z.string().optional().default(""),
  floorManagerId: z.string().min(1, "Floor Manager ID is required"),
  gpCount: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const SettingsSchema = z.object({
  preferredReportFormat: z.enum(["excel", "pdf", "both"]).default("excel"),
  monthlyReportDay: z.number().int().min(1).max(28).default(1),
  automatedReportsEnabled: z.boolean().default(true),
  emailNotificationsEnabled: z.boolean().default(true),
  darkModeEnabled: z.boolean().default(false),
  timezone: z.string().default("UTC"),
  language: z.enum(["en", "pt", "de", "fr"]).default("en"),
});

export type Evaluation = z.infer<typeof EvaluationSchema>;
export type Attendance = z.infer<typeof AttendanceSchema>;
export type ErrorReport = z.infer<typeof ErrorReportSchema>;
export type BonusCalculation = z.infer<typeof BonusCalculationSchema>;
export type GPPortalAccess = z.infer<typeof GPPortalAccessSchema>;
export type BulkUpload = z.infer<typeof BulkUploadSchema>;
export type ReportFilter = z.infer<typeof ReportFilterSchema>;
export type PagedQuery = z.infer<typeof PagedQuerySchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
