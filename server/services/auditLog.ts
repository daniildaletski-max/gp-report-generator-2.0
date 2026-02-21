import { db } from "../db";
import { eq, and } from "drizzle-orm";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VIEW"
  | "EXPORT"
  | "IMPORT"
  | "APPROVE"
  | "REJECT"
  | "LOGIN"
  | "LOGOUT"
  | "PERMISSION_CHANGE";

export type AuditEntity =
  | "EVALUATION"
  | "ERROR"
  | "ATTENDANCE"
  | "GP"
  | "TEAM"
  | "USER"
  | "REPORT"
  | "SETTINGS"
  | "BONUS";

interface AuditLogEntry {
  userId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  status: "success" | "failure";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

const auditLogs: AuditLogEntry[] = [];

export function logAuditEvent(entry: AuditLogEntry): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    ...entry,
    timestamp,
  };

  auditLogs.push(entry);

  if (process.env.NODE_ENV === "development") {
    console.log(`[AUDIT] ${entry.action} on ${entry.entity}:${entry.entityId} by ${entry.userId}`);
  }
}

export function getAuditLog(
  filters?: Partial<{
    userId: string;
    action: AuditAction;
    entity: AuditEntity;
    entityId: string;
    startDate: Date;
    endDate: Date;
  }>,
  limit: number = 100,
  offset: number = 0
): AuditLogEntry[] {
  let results = [...auditLogs];

  if (filters?.userId) {
    results = results.filter((log) => log.userId === filters.userId);
  }
  if (filters?.action) {
    results = results.filter((log) => log.action === filters.action);
  }
  if (filters?.entity) {
    results = results.filter((log) => log.entity === filters.entity);
  }
  if (filters?.entityId) {
    results = results.filter((log) => log.entityId === filters.entityId);
  }

  return results.slice(offset, offset + limit);
}

export function getEntityAuditTrail(entity: AuditEntity, entityId: string): AuditLogEntry[] {
  return auditLogs.filter((log) => log.entity === entity && log.entityId === entityId);
}

export function logEvaluationChange(
  userId: string,
  evaluationId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent({
    userId,
    action: "UPDATE",
    entity: "EVALUATION",
    entityId: evaluationId,
    oldValues,
    newValues,
    status: "success",
    ipAddress,
    userAgent,
  });
}

export function logBonusCalculation(
  userId: string,
  gpId: string,
  calculationResult: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent({
    userId,
    action: "CREATE",
    entity: "BONUS",
    entityId: gpId,
    newValues: calculationResult,
    status: "success",
    ipAddress,
    userAgent,
    metadata: {
      calculatedAt: new Date().toISOString(),
    },
  });
}

export function logDataExport(
  userId: string,
  entityType: AuditEntity,
  recordCount: number,
  format: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent({
    userId,
    action: "EXPORT",
    entity: entityType,
    entityId: `bulk_export_${Date.now()}`,
    status: "success",
    ipAddress,
    userAgent,
    metadata: {
      recordCount,
      format,
      exportedAt: new Date().toISOString(),
    },
  });
}

export function logDataImport(
  userId: string,
  entityType: AuditEntity,
  recordCount: number,
  fileName: string,
  successCount: number,
  failureCount: number,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent({
    userId,
    action: "IMPORT",
    entity: entityType,
    entityId: `bulk_import_${Date.now()}`,
    status: failureCount === 0 ? "success" : "failure",
    ipAddress,
    userAgent,
    metadata: {
      recordCount,
      fileName,
      successCount,
      failureCount,
      importedAt: new Date().toISOString(),
    },
  });
}

export function logAuthEvent(
  userId: string,
  action: "LOGIN" | "LOGOUT",
  ipAddress?: string,
  userAgent?: string,
  status: "success" | "failure" = "success",
  errorMessage?: string
): void {
  logAuditEvent({
    userId,
    action,
    entity: "USER",
    entityId: userId,
    status,
    errorMessage,
    ipAddress,
    userAgent,
  });
}

export function logPermissionChange(
  userId: string,
  targetUserId: string,
  oldRole: string,
  newRole: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAuditEvent({
    userId,
    action: "PERMISSION_CHANGE",
    entity: "USER",
    entityId: targetUserId,
    oldValues: { role: oldRole },
    newValues: { role: newRole },
    status: "success",
    ipAddress,
    userAgent,
  });
}
