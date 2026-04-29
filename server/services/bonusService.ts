/**
 * Bonus Orchestrator
 *
 * Pulls the inputs needed by `calculateBonusEligibility` from the existing
 * domain tables (monthly stats, attendance) and runs the calculator. The
 * calculator itself is pure; this module owns the data plumbing and the
 * heuristics for deriving inputs that aren't directly stored:
 *
 *   - totalGamesPlayed → monthlyGpStats.totalGames
 *   - errorCount       → monthlyGpStats.mistakes
 *   - hoursWorked      → DEFAULT_MONTHLY_HOURS (configurable per GP via
 *                        attendance: extraShifts add hours, missedDays /
 *                        sickLeaves subtract them)
 *   - sickleaveLateViolations → attendance.lateToWork or sickLeaves over
 *                               the company-wide threshold (3 incidents)
 *
 * All derived fields are surfaced in the result so the UI can show *why*
 * a GP qualified or not.
 */
import * as db from "../db";
import {
  calculateBonusEligibility,
  calculateGGsGapToLevel,
} from "./bonusCalculator";
import { createLogger } from "./logger";

const log = createLogger("BonusService");

// Operational defaults — kept as constants until/unless the company asks for
// per-team tuning. Picked to match a typical 40h/week × 4 = 160h month
// with 8h shifts, with a 3-incident threshold for late/sick violations.
const DEFAULT_MONTHLY_HOURS = 160;
const HOURS_PER_SHIFT = 8;
const LATE_VIOLATION_THRESHOLD = 3;
const SICK_VIOLATION_THRESHOLD = 3;

export interface GpBonusReport {
  gpId: number;
  gpName: string;
  teamId: number | null;
  // Inputs (so the UI can show the derivation, not just the answer)
  totalGames: number;
  errorCount: number;
  hoursWorked: number;
  hoursBreakdown: {
    base: number;
    extraShifts: number;
    missedDays: number;
    sickLeaves: number;
  };
  // Calculated
  bonusLevel: "level1" | "level2" | "ineligible";
  bonusRate: number;
  bonusAmount: number;
  achievedGGs: number;
  minimumGGsRequired: number;
  isEligible: boolean;
  disqualifyingFactors: string[];
  // Coaching: "you need N more GGs / max M errors / E more games"
  gapToNextLevel: {
    targetLevel: "level1" | "level2";
    gapGGs: number;
    estimatedGamesNeeded: number;
  } | null;
}

function deriveHoursWorked(att: {
  extraShifts?: number | null;
  missedDays?: number | null;
  sickLeaves?: number | null;
}): { hours: number; breakdown: GpBonusReport["hoursBreakdown"] } {
  const extraShifts = att.extraShifts ?? 0;
  const missedDays = att.missedDays ?? 0;
  const sickLeaves = att.sickLeaves ?? 0;
  const hours = Math.max(
    0,
    DEFAULT_MONTHLY_HOURS +
      extraShifts * HOURS_PER_SHIFT -
      missedDays * HOURS_PER_SHIFT -
      sickLeaves * HOURS_PER_SHIFT,
  );
  return {
    hours,
    breakdown: {
      base: DEFAULT_MONTHLY_HOURS,
      extraShifts: extraShifts * HOURS_PER_SHIFT,
      missedDays: missedDays * HOURS_PER_SHIFT,
      sickLeaves: sickLeaves * HOURS_PER_SHIFT,
    },
  };
}

function hasViolations(att: { lateToWork?: number | null; sickLeaves?: number | null }): boolean {
  return (
    (att.lateToWork ?? 0) >= LATE_VIOLATION_THRESHOLD ||
    (att.sickLeaves ?? 0) >= SICK_VIOLATION_THRESHOLD
  );
}

export async function getBonusForGp(
  gpId: number,
  month: number,
  year: number,
): Promise<GpBonusReport | null> {
  const gp = await db.getGamePresenterById(gpId);
  if (!gp) return null;
  return computeReport(gp, month, year);
}

export async function getBonusesForTeam(
  teamId: number,
  month: number,
  year: number,
): Promise<GpBonusReport[]> {
  const gps = await db.getGamePresentersByTeam(teamId);
  const reports = await Promise.all(gps.map(gp => computeReport(gp, month, year)));
  return reports.filter((r): r is GpBonusReport => r !== null);
}

export async function getBonusesForUser(
  userId: number,
  month: number,
  year: number,
): Promise<GpBonusReport[]> {
  const gps = await db.getAllGamePresentersByUser(userId);
  const reports = await Promise.all(gps.map(gp => computeReport(gp, month, year)));
  return reports.filter((r): r is GpBonusReport => r !== null);
}

export async function getBonusesAll(month: number, year: number): Promise<GpBonusReport[]> {
  const gps = await db.getAllGamePresenters();
  const reports = await Promise.all(gps.map(gp => computeReport(gp, month, year)));
  return reports.filter((r): r is GpBonusReport => r !== null);
}

async function computeReport(
  gp: { id: number; name: string; teamId: number | null },
  month: number,
  year: number,
): Promise<GpBonusReport | null> {
  try {
    const [stats, attendance] = await Promise.all([
      db.getMonthlyGpStats(gp.id, month, year),
      db.getOrCreateAttendance(gp.id, month, year),
    ]);

    const totalGames = stats?.totalGames ?? 0;
    const errorCount = stats?.mistakes ?? 0;
    const { hours, breakdown } = deriveHoursWorked(attendance);

    const result = calculateBonusEligibility({
      gpId: String(gp.id),
      totalGamesPlayed: totalGames,
      errorCount,
      hoursWorked: hours,
      month,
      year,
      hasDisqualifyingFactors: false,
      sickleaveLateViolations: hasViolations(attendance),
    });

    let gap: GpBonusReport["gapToNextLevel"] = null;
    if (result.bonusLevel === "ineligible") {
      const toL1 = calculateGGsGapToLevel(result.achievedGGs, "level1");
      gap = toL1.gapGGs > 0
        ? { targetLevel: "level1", gapGGs: toL1.gapGGs, estimatedGamesNeeded: toL1.estimatedGamesNeeded }
        : null;
    } else if (result.bonusLevel === "level1") {
      const toL2 = calculateGGsGapToLevel(result.achievedGGs, "level2");
      gap = toL2.gapGGs > 0
        ? { targetLevel: "level2", gapGGs: toL2.gapGGs, estimatedGamesNeeded: toL2.estimatedGamesNeeded }
        : null;
    }

    return {
      gpId: gp.id,
      gpName: gp.name,
      teamId: gp.teamId ?? null,
      totalGames,
      errorCount,
      hoursWorked: hours,
      hoursBreakdown: breakdown,
      bonusLevel: result.bonusLevel,
      bonusRate: result.bonusRate,
      bonusAmount: Math.round(result.bonusAmount * 100) / 100,
      achievedGGs: result.achievedGGs,
      minimumGGsRequired: result.minimumGGsRequired,
      isEligible: result.isEligible,
      disqualifyingFactors: result.disqualifyingFactors,
      gapToNextLevel: gap,
    };
  } catch (error) {
    log.error(`Failed to compute bonus for GP ${gp.id}`, error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}
