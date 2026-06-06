/**
 * Bonus orchestrator.
 *
 * The bonus math is pure (`shared/bonus.ts`). This module owns the data
 * plumbing: it pulls the inputs from the existing domain tables and
 * derives the ones that aren't directly stored, then runs the calculator
 * and returns a report that surfaces *why* a GP qualified (so the UI can
 * show the derivation, not just the number).
 *
 *   totalGames  → monthly_gp_stats.totalGames
 *   mistakes    → monthly_gp_stats.mistakes (single source of truth)
 *   workedHours → monthly_gp_stats.workedHours when recorded; otherwise
 *                 ESTIMATED from attendance (base month ± shift deltas)
 *   disqualifiers → attendance lateness / sick-leave over the company
 *                   threshold (3 incidents)
 */
import * as db from "../db";
import { computeBonus, type BonusResult } from "../../shared/bonus";
import { createLogger } from "./logger";

const log = createLogger("BonusService");

// Operational defaults. A typical full month is ~160h (40h/week × 4) on
// 8h shifts; 3 incidents is the late/sick violation threshold. Kept as
// constants until/unless the company asks for per-team tuning.
const DEFAULT_MONTHLY_HOURS = 160;
const HOURS_PER_SHIFT = 8;
const VIOLATION_THRESHOLD = 3;

export interface GpBonusReport {
  gpId: number;
  gpName: string;
  teamId: number | null;
  month: number;
  year: number;
  // Inputs (so the UI can show the derivation)
  totalGames: number;
  mistakes: number;
  workedHours: number;
  hoursSource: "recorded" | "estimated";
  hoursBreakdown: { base: number; extraShifts: number; missedDays: number; sickLeaves: number } | null;
  // Calculated
  ggs: number;
  level: BonusResult["level"];
  rate: number;
  amount: number;
  isEligible: boolean;
  minimumGGsRequired: number;
  disqualifyingFactors: string[];
  gapToNext: BonusResult["gapToNext"];
}

interface AttendanceLike {
  extraShifts?: number | null;
  missedDays?: number | null;
  sickLeaves?: number | null;
  lateToWork?: number | null;
}

function deriveHours(att: AttendanceLike | null): { hours: number; breakdown: NonNullable<GpBonusReport["hoursBreakdown"]> } {
  const extraShifts = att?.extraShifts ?? 0;
  const missedDays = att?.missedDays ?? 0;
  const sickLeaves = att?.sickLeaves ?? 0;
  const hours = Math.max(
    0,
    DEFAULT_MONTHLY_HOURS + extraShifts * HOURS_PER_SHIFT - missedDays * HOURS_PER_SHIFT - sickLeaves * HOURS_PER_SHIFT,
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

function resolveDisqualifiers(att: AttendanceLike | null): string[] {
  const factors: string[] = [];
  if ((att?.lateToWork ?? 0) >= VIOLATION_THRESHOLD) {
    factors.push(`Lateness violations (${att!.lateToWork})`);
  }
  if ((att?.sickLeaves ?? 0) >= VIOLATION_THRESHOLD) {
    factors.push(`Sick-leave procedure violations (${att!.sickLeaves})`);
  }
  return factors;
}

async function buildReport(
  gp: { id: number; name: string; teamId: number | null },
  month: number,
  year: number,
): Promise<GpBonusReport> {
  const [stats, attendance] = await Promise.all([
    db.getMonthlyGpStats(gp.id, month, year),
    db.findAttendance(gp.id, month, year),
  ]);

  const totalGames = stats?.totalGames ?? 0;
  const mistakes = stats?.mistakes ?? 0;

  // Worked hours: prefer the recorded value; otherwise estimate from
  // attendance so the engine still produces a meaningful number.
  let workedHours: number;
  let hoursSource: "recorded" | "estimated";
  let hoursBreakdown: GpBonusReport["hoursBreakdown"];
  if (stats?.workedHours != null) {
    workedHours = stats.workedHours;
    hoursSource = "recorded";
    hoursBreakdown = null;
  } else {
    const derived = deriveHours(attendance);
    workedHours = derived.hours;
    hoursSource = "estimated";
    hoursBreakdown = derived.breakdown;
  }

  const disqualifyingFactors = resolveDisqualifiers(attendance);
  const result = computeBonus({ totalGames, mistakes, workedHours, disqualifyingFactors });

  return {
    gpId: gp.id,
    gpName: gp.name,
    teamId: gp.teamId ?? null,
    month,
    year,
    totalGames,
    mistakes,
    workedHours,
    hoursSource,
    hoursBreakdown,
    ggs: result.ggs,
    level: result.level,
    rate: result.rate,
    amount: result.amount,
    isEligible: result.isEligible,
    minimumGGsRequired: result.minimumGGsRequired,
    disqualifyingFactors: result.disqualifyingFactors,
    gapToNext: result.gapToNext,
  };
}

export async function getBonusForGp(gpId: number, month: number, year: number): Promise<GpBonusReport | null> {
  const gp = await db.getGamePresenterById(gpId);
  if (!gp) return null;
  try {
    return await buildReport({ id: gp.id, name: gp.name, teamId: gp.teamId ?? null }, month, year);
  } catch (e) {
    log.error(`Failed to compute bonus for GP ${gpId}`, e instanceof Error ? e : new Error(String(e)));
    return null;
  }
}

async function reportForList(
  gps: Array<{ id: number; name: string; teamId: number | null }>,
  month: number,
  year: number,
): Promise<GpBonusReport[]> {
  const reports = await Promise.all(
    gps.map(async gp => {
      try {
        return await buildReport(gp, month, year);
      } catch (e) {
        log.error(`Failed to compute bonus for GP ${gp.id}`, e instanceof Error ? e : new Error(String(e)));
        return null;
      }
    }),
  );
  return reports
    .filter((r): r is GpBonusReport => r !== null)
    .sort((a, b) => b.amount - a.amount || b.ggs - a.ggs || a.gpName.localeCompare(b.gpName));
}

export async function getBonusesAll(month: number, year: number): Promise<GpBonusReport[]> {
  const gps = await db.getAllGamePresenters();
  return reportForList(gps.map(g => ({ id: g.id, name: g.name, teamId: g.teamId ?? null })), month, year);
}

export async function getBonusesForUser(userId: number, month: number, year: number): Promise<GpBonusReport[]> {
  const gps = await db.getAllGamePresentersByUser(userId);
  return reportForList(gps.map(g => ({ id: g.id, name: g.name, teamId: g.teamId ?? null })), month, year);
}

export async function getBonusesForTeam(teamId: number, month: number, year: number): Promise<GpBonusReport[]> {
  const gps = await db.getGamePresentersByTeam(teamId);
  return reportForList(gps.map(g => ({ id: g.id, name: g.name, teamId: g.teamId ?? null })), month, year);
}
