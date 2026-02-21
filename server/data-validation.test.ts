import { describe, it, expect } from "vitest";
import {
  validateEvaluation,
  validateAttendance,
  validateErrorReport,
  normalizeGPName,
  fuzzyMatchGPName,
  detectDuplicates,
  validateDataConsistency,
} from "./services/dataValidation";

describe("Data Validation", () => {
  describe("validateEvaluation", () => {
    it("should validate correct evaluation data", () => {
      const result = validateEvaluation({
        gpName: "John Doe",
        date: new Date(),
        fmName: "Jane Smith",
        performance: 8,
        attitude: 7,
        errorCount: 0,
        teamId: "team1",
      });

      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("should warn about low performance", () => {
      const result = validateEvaluation({
        gpName: "John Doe",
        date: new Date(),
        fmName: "Jane Smith",
        performance: 2,
        attitude: 7,
        errorCount: 0,
        teamId: "team1",
      });

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should warn about high error count", () => {
      const result = validateEvaluation({
        gpName: "John Doe",
        date: new Date(),
        fmName: "Jane Smith",
        performance: 7,
        attitude: 7,
        errorCount: 10,
        teamId: "team1",
      });

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should reject invalid performance score", () => {
      const result = validateEvaluation({
        gpName: "John Doe",
        date: new Date(),
        fmName: "Jane Smith",
        performance: 15,
        attitude: 7,
        errorCount: 0,
        teamId: "team1",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("validateAttendance", () => {
    it("should validate correct attendance data", () => {
      const result = validateAttendance({
        gpName: "John Doe",
        date: new Date(),
        status: "present",
        hoursWorked: 8,
        teamId: "team1",
      });

      expect(result.valid).toBe(true);
    });

    it("should warn about late attendance", () => {
      const result = validateAttendance({
        gpName: "John Doe",
        date: new Date(),
        status: "late",
        hoursWorked: 7,
        teamId: "team1",
      });

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should reject invalid hours", () => {
      const result = validateAttendance({
        gpName: "John Doe",
        date: new Date(),
        status: "present",
        hoursWorked: 25,
        teamId: "team1",
      });

      expect(result.valid).toBe(false);
    });
  });

  describe("Name normalization", () => {
    it("should normalize GP names consistently", () => {
      const names = [
        "john doe",
        "JOHN DOE",
        "John Doe",
        "john  doe",
      ];

      const normalized = names.map((name) => normalizeGPName(name));
      const unique = new Set(normalized);

      expect(unique.size).toBe(1);
      expect(normalized[0]).toBe("John Doe");
    });

    it("should handle names with special characters", () => {
      const result = normalizeGPName("  joão silva  ");

      expect(result).toBe("João Silva");
      expect(result.trim()).toBe(result);
    });
  });

  describe("Fuzzy matching", () => {
    it("should find exact matches with high score", () => {
      const candidates = ["John Doe", "Jane Smith", "John Davis"];
      const results = fuzzyMatchGPName("John Doe", candidates);

      expect(results[0].score).toBe(100);
      expect(results[0].match).toBe("John Doe");
    });

    it("should find partial matches", () => {
      const candidates = ["John Doe", "Jane Smith", "John Davis"];
      const results = fuzzyMatchGPName("John", candidates);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].match).toMatch(/John/);
    });

    it("should rank matches by relevance", () => {
      const candidates = ["John Doe", "Jane Smith", "John Davis"];
      const results = fuzzyMatchGPName("John Doe", candidates);

      expect(results[0].match).toBe("John Doe");
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it("should return empty results for no matches", () => {
      const candidates = ["Alice", "Bob", "Charlie"];
      const results = fuzzyMatchGPName("Zxyxz", candidates);

      expect(results.length).toBe(0);
    });
  });

  describe("Duplicate detection", () => {
    it("should detect exact duplicates", () => {
      const items = [
        { id: "1", name: "John Doe", email: "john@example.com" },
        { id: "2", name: "John Doe", email: "john@example.com" },
        { id: "3", name: "Jane Smith", email: "jane@example.com" },
      ];

      const result = detectDuplicates(items, ["name", "email"]);

      expect(result.duplicates.length).toBe(1);
      expect(result.unique.length).toBe(1);
    });

    it("should identify unique items", () => {
      const items = [
        { id: "1", name: "John Doe", email: "john@example.com" },
        { id: "2", name: "Jane Smith", email: "jane@example.com" },
      ];

      const result = detectDuplicates(items, ["name", "email"]);

      expect(result.duplicates.length).toBe(0);
      expect(result.unique.length).toBe(2);
    });
  });

  describe("Data consistency validation", () => {
    it("should warn about GPs with errors but no evaluations", () => {
      const evaluations: any[] = [];
      const errors = [
        {
          gpName: "John Doe",
          errorType: "game_error",
          description: "Test",
          severity: "high",
          date: new Date(),
          teamId: "team1",
          resolved: false,
        },
      ];
      const attendance: any[] = [];

      const result = validateDataConsistency(evaluations, errors, attendance);

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should detect duplicate evaluations for same date and GP", () => {
      const evaluations = [
        {
          gpName: "John Doe",
          date: new Date("2024-01-15"),
          fmName: "Jane Smith",
          performance: 8,
          attitude: 7,
          errorCount: 0,
          teamId: "team1",
          comments: "",
        },
        {
          gpName: "John Doe",
          date: new Date("2024-01-15"),
          fmName: "Jane Smith",
          performance: 7,
          attitude: 8,
          errorCount: 1,
          teamId: "team1",
          comments: "",
        },
      ];

      const result = validateDataConsistency(evaluations, [], []);

      expect(result.issues.length).toBeGreaterThan(0);
    });
  });
});
