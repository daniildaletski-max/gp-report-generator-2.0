export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    version: string;
    requestId?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
    hasMore: boolean;
  };
}

export function successResponse<T>(
  data: T,
  meta?: { requestId?: string }
): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: "1.0",
      requestId: meta?.requestId,
    },
  };
}

export function errorResponse(
  code: string,
  message: string,
  details?: unknown,
  meta?: { requestId?: string }
): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: "1.0",
      requestId: meta?.requestId,
    },
  };
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  const pages = Math.ceil(total / limit);
  return {
    items,
    pagination: {
      total,
      page,
      limit,
      pages,
      hasMore: page < pages,
    },
  };
}

export function validatePaginationParams(
  page?: number,
  limit?: number
): { page: number; limit: number } {
  const validPage = Math.max(1, page || 1);
  const validLimit = Math.max(1, Math.min(limit || 20, 100));

  return { page: validPage, limit: validLimit };
}

export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function createBulkOperationResponse<T>(
  successful: T[],
  failed: Array<{ item: T; error: string }>,
  requestId?: string
) {
  return {
    success: failed.length === 0,
    data: {
      successful,
      failed,
      summary: {
        total: successful.length + failed.length,
        succeeded: successful.length,
        failed: failed.length,
        successRate: ((successful.length / (successful.length + failed.length)) * 100).toFixed(2) + "%",
      },
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: "1.0",
      requestId,
    },
  };
}

export function createStreamResponse<T>(
  chunk: T,
  isLast: boolean = false
): string {
  return JSON.stringify({
    chunk,
    isLast,
    timestamp: new Date().toISOString(),
  }) + "\n";
}

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  DUPLICATE_ENTRY: "DUPLICATE_ENTRY",
  DATA_INCONSISTENCY: "DATA_INCONSISTENCY",
  FILE_PROCESSING_ERROR: "FILE_PROCESSING_ERROR",
  IMPORT_ERROR: "IMPORT_ERROR",
  EXPORT_ERROR: "EXPORT_ERROR",
} as const;

export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_ERROR: 500,
} as const;
