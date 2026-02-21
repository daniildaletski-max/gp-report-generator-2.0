import { describe, it, expect } from "vitest";
import {
  calculateBonusEligibility,
  getMonthlyBonusProjection,
  calculateGGsGapToLevel,
} from "./services/bonusCalculator";

describe("Bonus Calculator", () => {
  describe("calculateBonusEligibility", () => {
    it("should qualify for level 2 bonus with sufficient GGs and no disqualifying factors", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 5100,
        errorCount: 1,
        hoursWorked: 100,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      expect(result.bonusLevel).toBe("level2");
      expect(result.bonusRate).toBe(2.5);
      expect(result.isEligible).toBe(true);
      expect(result.bonusAmount).toBe(250);
      expect(result.achievedGGs).toBe(5100);
    });

    it("should apply first mistake rule (free mistake)", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 5000,
        errorCount: 1,
        hoursWorked: 100,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      expect(result.calculations.effectiveErrorCount).toBe(0);
      expect(result.achievedGGs).toBe(5000);
      expect(result.bonusLevel).toBe("level2");
    });

    it("should treat 0 errors same as 1 error (free mistake rule)", () => {
      const resultZeroErrors = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 3000,
        errorCount: 0,
        hoursWorked: 80,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      const resultOneError = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 3000,
        errorCount: 1,
        hoursWorked: 80,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      expect(resultZeroErrors.achievedGGs).toBe(resultOneError.achievedGGs);
      expect(resultZeroErrors.bonusLevel).toBe(resultOneError.bonusLevel);
    });

    it("should qualify for level 1 when GGs meet minimum but below level 2", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 2500,
        errorCount: 1,
        hoursWorked: 100,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      expect(result.bonusLevel).toBe("level1");
      expect(result.bonusRate).toBe(1.5);
      expect(result.isEligible).toBe(true);
      expect(result.bonusAmount).toBe(150);
    });

    it("should be ineligible when GGs are below level 1 minimum", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 2000,
        errorCount: 1,
        hoursWorked: 100,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      expect(result.bonusLevel).toBe("ineligible");
      expect(result.isEligible).toBe(false);
      expect(result.bonusAmount).toBe(0);
    });

    it("should be ineligible due to disqualifying factors", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 5000,
        errorCount: 1,
        hoursWorked: 100,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: true,
      });

      expect(result.bonusLevel).toBe("ineligible");
      expect(result.isEligible).toBe(false);
      expect(result.disqualifyingFactors.length).toBeGreaterThan(0);
    });

    it("should be ineligible due to sick leave violations", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 5000,
        errorCount: 1,
        hoursWorked: 100,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
        sickleaveLateViolations: true,
      });

      expect(result.bonusLevel).toBe("ineligible");
      expect(result.disqualifyingFactors).toContain(
        "Lateness or sick leave procedure violations"
      );
    });

    it("should calculate GGs correctly with multiple errors", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 5000,
        errorCount: 2,
        hoursWorked: 100,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      expect(result.achievedGGs).toBe(5000);
      expect(result.calculations.effectiveErrorCount).toBe(1);
    });

    it("should be ineligible with no worked hours", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 5000,
        errorCount: 1,
        hoursWorked: 0,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      expect(result.bonusLevel).toBe("ineligible");
      expect(result.bonusAmount).toBe(0);
    });
  });

  describe("getMonthlyBonusProjection", () => {
    it("should project end-of-month bonus correctly", () => {
      const projection = getMonthlyBonusProjection(
        1,
        2024,
        2500,
        1,
        50,
        31,
        15
      );

      expect(projection.pace).toBeGreaterThan(2);
      expect(projection.projectedBonus).toBeGreaterThan(0);
      expect(projection.onTrackForLevel).toBe("level2");
    });

    it("should show on track for level 1 when pace supports it", () => {
      const projection = getMonthlyBonusProjection(
        1,
        2024,
        1300,
        0,
        40,
        31,
        15
      );

      expect(projection.onTrackForLevel).toBe("level1");
    });

    it("should show neither when projected GGs insufficient", () => {
      const projection = getMonthlyBonusProjection(
        1,
        2024,
        1000,
        2,
        40,
        31,
        15
      );

      expect(projection.onTrackForLevel).toBe("neither");
    });
  });

  describe("calculateGGsGapToLevel", () => {
    it("should calculate gap to level 2", () => {
      const gap = calculateGGsGapToLevel(3000, "level2");

      expect(gap.gapGGs).toBe(2000);
      expect(gap.estimatedGamesNeeded).toBe(2000);
    });

    it("should return zero gap when already at target", () => {
      const gap = calculateGGsGapToLevel(5000, "level2");

      expect(gap.gapGGs).toBe(0);
      expect(gap.recommendedErrorRate).toBe(0);
      expect(gap.estimatedGamesNeeded).toBe(0);
    });

    it("should calculate gap to level 1", () => {
      const gap = calculateGGsGapToLevel(2000, "level1");

      expect(gap.gapGGs).toBe(500);
    });
  });

  describe("Bonus calculation edge cases", () => {
    it("should handle zero games played", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 0,
        errorCount: 0,
        hoursWorked: 100,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      expect(result.bonusLevel).toBe("ineligible");
      expect(result.achievedGGs).toBe(0);
    });

    it("should handle high error count reducing GGs", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 10000,
        errorCount: 10,
        hoursWorked: 100,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      expect(result.achievedGGs).toBeLessThan(10000);
      expect(result.calculations.effectiveErrorCount).toBe(9);
    });

    it("should handle fractional bonus calculation", () => {
      const result = calculateBonusEligibility({
        gpId: "gp1",
        totalGamesPlayed: 5000,
        errorCount: 1,
        hoursWorked: 85.5,
        month: 1,
        year: 2024,
        hasDisqualifyingFactors: false,
      });

      expect(result.bonusAmount).toBe(85.5 * 2.5);
    });
  });
});
