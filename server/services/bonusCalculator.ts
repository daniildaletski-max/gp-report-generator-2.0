import { BonusCalculation } from "@shared/validation";

const BONUS_CONFIG = {
  level1: {
    minGGs: 2500,
    rate: 1.50,
  },
  level2: {
    minGGs: 5000,
    rate: 2.50,
  },
};

interface BonusCalculationInput {
  gpId: string;
  totalGamesPlayed: number;
  errorCount: number;
  hoursWorked: number;
  month: number;
  year: number;
  hasDisqualifyingFactors: boolean;
  disciplinaryWarnings?: number;
  sickleaveLateViolations?: boolean;
}

interface BonusCalculationResult extends BonusCalculation {
  calculations: {
    ggs: number;
    qualifiedGames: number;
    effectiveErrorCount: number;
  };
}

export function calculateBonusEligibility(
  input: BonusCalculationInput
): BonusCalculationResult {
  const disqualifyingFactors: string[] = [];

  if (input.hasDisqualifyingFactors) {
    disqualifyingFactors.push("Active disciplinary cases, warnings, or PDPs");
  }

  if (input.sickleaveLateViolations) {
    disqualifyingFactors.push("Lateness or sick leave procedure violations");
  }

  const effectiveErrorCount = Math.max(0, input.errorCount - 1);
  const ggs =
    effectiveErrorCount === 0
      ? input.totalGamesPlayed
      : Math.floor(input.totalGamesPlayed / effectiveErrorCount);

  const level2Qualified =
    ggs >= BONUS_CONFIG.level2.minGGs &&
    input.hoursWorked > 0 &&
    disqualifyingFactors.length === 0;

  const level1Qualified =
    ggs >= BONUS_CONFIG.level1.minGGs &&
    input.hoursWorked > 0 &&
    disqualifyingFactors.length === 0;

  let bonusLevel: "level1" | "level2" | "ineligible" = "ineligible";
  let bonusRate = 0;

  if (level2Qualified) {
    bonusLevel = "level2";
    bonusRate = BONUS_CONFIG.level2.rate;
  } else if (level1Qualified) {
    bonusLevel = "level1";
    bonusRate = BONUS_CONFIG.level1.rate;
  }

  const bonusAmount = bonusRate * input.hoursWorked;
  const isEligible = bonusLevel !== "ineligible";

  return {
    gpId: input.gpId,
    month: input.month,
    year: input.year,
    totalGamesPlayed: input.totalGamesPlayed,
    errorCount: input.errorCount,
    hoursWorked: input.hoursWorked,
    bonusLevel,
    minimumGGsRequired:
      bonusLevel === "level2"
        ? BONUS_CONFIG.level2.minGGs
        : BONUS_CONFIG.level1.minGGs,
    achievedGGs: ggs,
    bonusRate,
    bonusAmount,
    isEligible,
    disqualifyingFactors,
    calculations: {
      ggs,
      qualifiedGames: Math.max(0, input.totalGamesPlayed - effectiveErrorCount),
      effectiveErrorCount,
    },
  };
}

export function getMonthlyBonusProjection(
  currentMonth: number,
  currentYear: number,
  gamesSoFar: number,
  errorsSoFar: number,
  hoursSoFar: number,
  daysInMonth: number,
  daysElapsed: number
): {
  projectedBonus: number;
  projectedGGs: number;
  pace: number;
  onTrackForLevel: "level1" | "level2" | "neither";
} {
  const projectionRatio = daysInMonth / daysElapsed;
  const projectedGames = Math.floor(gamesSoFar * projectionRatio);
  const projectedErrors = Math.max(0, Math.floor(errorsSoFar * projectionRatio) - 1);
  const projectedHours = hoursSoFar * projectionRatio;

  const projectedGGs =
    projectedErrors === 0
      ? projectedGames
      : Math.floor(projectedGames / projectedErrors);

  let projectedBonus = 0;
  let onTrackForLevel: "level1" | "level2" | "neither" = "neither";

  if (projectedGGs >= BONUS_CONFIG.level2.minGGs) {
    projectedBonus = BONUS_CONFIG.level2.rate * projectedHours;
    onTrackForLevel = "level2";
  } else if (projectedGGs >= BONUS_CONFIG.level1.minGGs) {
    projectedBonus = BONUS_CONFIG.level1.rate * projectedHours;
    onTrackForLevel = "level1";
  }

  return {
    projectedBonus: Math.round(projectedBonus * 100) / 100,
    projectedGGs: Math.max(0, projectedGGs),
    pace: projectionRatio,
    onTrackForLevel,
  };
}

export function calculateGGsGapToLevel(
  currentGGs: number,
  targetLevel: "level1" | "level2"
): {
  gapGGs: number;
  recommendedErrorRate: number;
  estimatedGamesNeeded: number;
} {
  const targetGGs =
    targetLevel === "level2"
      ? BONUS_CONFIG.level2.minGGs
      : BONUS_CONFIG.level1.minGGs;

  const gapGGs = Math.max(0, targetGGs - currentGGs);

  if (gapGGs === 0) {
    return {
      gapGGs: 0,
      recommendedErrorRate: 0,
      estimatedGamesNeeded: 0,
    };
  }

  const recommendedErrorRate = 1 / (targetGGs / gapGGs);
  const estimatedGamesNeeded = gapGGs;

  return {
    gapGGs,
    recommendedErrorRate: Math.round(recommendedErrorRate * 10000) / 10000,
    estimatedGamesNeeded,
  };
}
