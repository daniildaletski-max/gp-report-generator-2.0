import { sql } from "drizzle-orm";

export interface QueryOptimizationTips {
  addIndex: string[];
  useSelect: boolean;
  usePagination: boolean;
  cacheCandidate: boolean;
  estimatedRows: number;
}

export function getQueryOptimizationTips(
  entityType: string,
  filterCount: number,
  estimatedRows: number
): QueryOptimizationTips {
  const tips: QueryOptimizationTips = {
    addIndex: [],
    useSelect: true,
    usePagination: estimatedRows > 10000,
    cacheCandidate: estimatedRows < 1000,
    estimatedRows,
  };

  if (filterCount > 3) {
    tips.addIndex.push(
      "Consider adding composite indexes for commonly filtered fields"
    );
  }

  if (estimatedRows > 100000) {
    tips.addIndex.push("Consider partitioning this table for large datasets");
  }

  return tips;
}

export const RECOMMENDED_INDEXES = {
  evaluations: [
    "CREATE INDEX IF NOT EXISTS idx_evaluations_gp_date ON evaluations(gp_id, date DESC)",
    "CREATE INDEX IF NOT EXISTS idx_evaluations_fm_date ON evaluations(fm_id, date DESC)",
    "CREATE INDEX IF NOT EXISTS idx_evaluations_team_date ON evaluations(team_id, date DESC)",
  ],
  errors: [
    "CREATE INDEX IF NOT EXISTS idx_errors_gp_date ON errors(gp_id, date DESC)",
    "CREATE INDEX IF NOT EXISTS idx_errors_severity ON errors(severity, resolved)",
    "CREATE INDEX IF NOT EXISTS idx_errors_team_date ON errors(team_id, date DESC)",
  ],
  attendance: [
    "CREATE INDEX IF NOT EXISTS idx_attendance_gp_date ON attendance(gp_id, date DESC)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status, date DESC)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_team_date ON attendance(team_id, date DESC)",
  ],
  gamePresenters: [
    "CREATE INDEX IF NOT EXISTS idx_gp_name ON game_presenters(name)",
    "CREATE INDEX IF NOT EXISTS idx_gp_email ON game_presenters(email)",
    "CREATE INDEX IF NOT EXISTS idx_gp_team ON game_presenters(team_id)",
  ],
} as const;

export function createSelectStatement<T extends Record<string, unknown>>(
  allFields: (keyof T)[],
  neededFields?: (keyof T)[]
): (keyof T)[] {
  if (!neededFields || neededFields.length === 0) {
    return allFields;
  }

  return neededFields.filter((field) => allFields.includes(field));
}

export function createBatchFetchQuery<T extends { id: string | number }>(
  ids: (string | number)[],
  batchSize: number = 1000
): (string | number)[][] {
  const batches: (string | number)[][] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }

  return batches;
}

export function createDateRangeQuery(
  startDate: Date,
  endDate: Date
): { startDate: Date; endDate: Date } {
  const start = new Date(startDate);
  const end = new Date(endDate);

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { startDate: start, endDate: end };
}

export function buildDynamicWhereClause<T extends Record<string, unknown>>(
  filters: Partial<T>,
  allowedFields: (keyof T)[]
): Record<string, unknown> {
  const clause: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && allowedFields.includes(key as keyof T)) {
      clause[key] = value;
    }
  }

  return clause;
}

export interface DatabaseStats {
  tableSize: string;
  rowCount: number;
  indexCount: number;
  lastVacuum: Date | null;
}

export function createConnectionPoolConfig(maxConnections: number = 20) {
  return {
    max: maxConnections,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    maxUses: 7500,
  };
}

export function getConnectionPoolStats() {
  return {
    active: 0,
    idle: 0,
    waiting: 0,
    totalCreated: 0,
  };
}

export const QUERY_TEMPLATES = {
  getRecentEvaluations: `
    SELECT * FROM evaluations
    WHERE team_id = $1
    AND date >= NOW() - INTERVAL '30 days'
    ORDER BY date DESC
    LIMIT $2 OFFSET $3
  `,
  getGPPerformanceStats: `
    SELECT
      gp_id,
      COUNT(*) as eval_count,
      AVG(performance) as avg_performance,
      AVG(attitude) as avg_attitude
    FROM evaluations
    WHERE team_id = $1
    AND date >= $2
    GROUP BY gp_id
  `,
  getDailyTeamMetrics: `
    SELECT
      DATE(date) as date,
      COUNT(DISTINCT gp_id) as gps_evaluated,
      AVG(performance) as avg_performance,
      COUNT(*) as total_evals
    FROM evaluations
    WHERE team_id = $1
    AND date BETWEEN $2 AND $3
    GROUP BY DATE(date)
    ORDER BY date DESC
  `,
  getMonthlyBonusEligibility: `
    SELECT
      gp_id,
      SUM(hours_worked) as total_hours,
      COUNT(error_id) as error_count,
      SUM(games_played) as total_games
    FROM attendance
    WHERE team_id = $1
    AND date_part('year', date) = $2
    AND date_part('month', date) = $3
    GROUP BY gp_id
  `,
} as const;
