import { z } from "zod";
import { EvaluationSchema, AttendanceSchema, ErrorReportSchema } from "@shared/validation";

interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
}

export function validateEvaluation(data: unknown): ValidationResult<z.infer<typeof EvaluationSchema>> {
  const result: ValidationResult<z.infer<typeof EvaluationSchema>> = {
    valid: false,
    errors: [],
    warnings: [],
  };

  try {
    const parsed = EvaluationSchema.parse(data);
    result.valid = true;
    result.data = parsed;

    if (parsed.performance < 4) {
      result.warnings.push({
        field: "performance",
        message: "Low performance score - consider follow-up",
      });
    }

    if (parsed.errorCount > 5) {
      result.warnings.push({
        field: "errorCount",
        message: "High error count - may affect bonus eligibility",
      });
    }
  } catch (error: unknown) {
    const err = error as any;
    if (err?.errors && Array.isArray(err.errors)) {
      result.errors = err.errors.map((e: any) => ({
        field: e.path?.join(".") || "unknown",
        message: e.message || String(e),
      }));
    } else if (error instanceof Error) {
      result.errors.push({
        field: "unknown",
        message: error.message,
      });
    }
  }

  return result;
}

export function validateAttendance(data: unknown): ValidationResult<z.infer<typeof AttendanceSchema>> {
  const result: ValidationResult<z.infer<typeof AttendanceSchema>> = {
    valid: false,
    errors: [],
    warnings: [],
  };

  try {
    const parsed = AttendanceSchema.parse(data);
    result.valid = true;
    result.data = parsed;

    if (parsed.status === "late") {
      result.warnings.push({
        field: "status",
        message: "Late attendance recorded - may affect bonus eligibility",
      });
    }

    if (parsed.status === "sick_leave" && parsed.hoursWorked > 0) {
      result.warnings.push({
        field: "hoursWorked",
        message: "Hours recorded on sick leave day",
      });
    }
  } catch (error: unknown) {
    const err = error as any;
    if (err?.errors && Array.isArray(err.errors)) {
      result.errors = err.errors.map((e: any) => ({
        field: e.path?.join(".") || "unknown",
        message: e.message || String(e),
      }));
    } else if (error instanceof Error) {
      result.errors.push({
        field: "unknown",
        message: error.message,
      });
    }
  }

  return result;
}

export function validateErrorReport(data: unknown): ValidationResult<z.infer<typeof ErrorReportSchema>> {
  const result: ValidationResult<z.infer<typeof ErrorReportSchema>> = {
    valid: false,
    errors: [],
    warnings: [],
  };

  try {
    const parsed = ErrorReportSchema.parse(data);
    result.valid = true;
    result.data = parsed;

    if (parsed.severity === "critical" && !parsed.resolved) {
      result.warnings.push({
        field: "resolved",
        message: "Critical error not yet resolved",
      });
    }
  } catch (error: unknown) {
    const err = error as any;
    if (err?.errors && Array.isArray(err.errors)) {
      result.errors = err.errors.map((e: any) => ({
        field: e.path?.join(".") || "unknown",
        message: e.message || String(e),
      }));
    } else if (error instanceof Error) {
      result.errors.push({
        field: "unknown",
        message: error.message,
      });
    }
  }

  return result;
}

export function normalizeGPName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeDateRange(startDate: string | Date, endDate: string | Date) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function detectDuplicates<T extends Record<string, unknown>>(
  items: T[],
  compareFields: (keyof T)[]
): { duplicates: T[][]; unique: T[] } {
  const seen = new Map<string, T[]>();
  const duplicates: T[][] = [];

  for (const item of items) {
    const key = compareFields.map((field) => item[field]).join("|");

    if (seen.has(key)) {
      const existing = seen.get(key)!;
      if (existing.length === 1) {
        duplicates.push([existing[0], item]);
      } else {
        duplicates[duplicates.length - 1]!.push(item);
      }
      existing.push(item);
    } else {
      seen.set(key, [item]);
    }
  }

  const unique = Array.from(seen.values())
    .filter((items) => items.length === 1)
    .map((items) => items[0]);

  return { duplicates, unique };
}

export function fuzzyMatchGPName(
  searchTerm: string,
  candidates: string[]
): { match: string; score: number }[] {
  const normalizedSearch = normalizeGPName(searchTerm).toLowerCase();

  return candidates
    .map((candidate) => {
      const normalizedCandidate = normalizeGPName(candidate).toLowerCase();

      let score = 0;

      if (normalizedCandidate === normalizedSearch) {
        score = 100;
      } else if (normalizedCandidate.includes(normalizedSearch)) {
        score = 75;
      } else {
        const searchWords = normalizedSearch.split(" ");
        const candidateWords = normalizedCandidate.split(" ");
        const matches = searchWords.filter((word) =>
          candidateWords.some((candWord) => candWord.startsWith(word))
        );
        score = (matches.length / searchWords.length) * 50;
      }

      return { match: candidate, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function validateDataConsistency(
  evaluations: z.infer<typeof EvaluationSchema>[],
  errorReports: z.infer<typeof ErrorReportSchema>[],
  attendance: z.infer<typeof AttendanceSchema>[]
): { issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];

  const gpNamesFromEvals = new Set(evaluations.map((e) => normalizeGPName(e.gpName)));
  const gpNamesFromErrors = new Set(errorReports.map((e) => normalizeGPName(e.gpName)));
  const gpNamesFromAttendance = new Set(attendance.map((a) => normalizeGPName(a.gpName)));

  for (const gpName of gpNamesFromErrors) {
    if (!gpNamesFromEvals.has(gpName)) {
      warnings.push(`GP "${gpName}" has errors but no evaluations`);
    }
  }

  for (const gpName of gpNamesFromAttendance) {
    if (!gpNamesFromEvals.has(gpName)) {
      warnings.push(`GP "${gpName}" has attendance records but no evaluations`);
    }
  }

  const dateDuplicates = new Map<string, z.infer<typeof EvaluationSchema>[]>();
  for (const eval_ of evaluations) {
    const key = `${eval_.gpName}|${eval_.date}`;
    if (!dateDuplicates.has(key)) {
      dateDuplicates.set(key, []);
    }
    dateDuplicates.get(key)!.push(eval_);
  }

  for (const [key, evals] of dateDuplicates.entries()) {
    if (evals.length > 1) {
      issues.push(`Duplicate evaluations for "${key}"`);
    }
  }

  return { issues, warnings };
}
