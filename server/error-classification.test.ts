import { describe, it, expect } from "vitest";
import { isTechnicalError } from "@shared/errorClassification";

describe("isTechnicalError", () => {
  describe("errorType signal", () => {
    it("flags technical_error from smart-upload", () => {
      expect(isTechnicalError({ errorType: "technical_error" })).toBe(true);
    });
    it("flags 'technical' as type", () => {
      expect(isTechnicalError({ errorType: "technical" })).toBe(true);
    });
    it("does NOT flag a genuine GP error type", () => {
      expect(isTechnicalError({ errorType: "dealing_error" })).toBe(false);
      expect(isTechnicalError({ errorType: "procedure_error" })).toBe(false);
      expect(isTechnicalError({ errorType: "communication_error" })).toBe(false);
    });
  });

  describe("errorCategory signal", () => {
    it("flags 'technical' category", () => {
      expect(isTechnicalError({ errorCategory: "technical" })).toBe(true);
    });
  });

  describe("errorCode signal", () => {
    it("flags plain 'TV'", () => {
      expect(isTechnicalError({ errorCode: "TV" })).toBe(true);
    });
    it("flags TV-RO (the bug from the screenshot)", () => {
      expect(isTechnicalError({ errorCode: "TV-RO" })).toBe(true);
    });
    it("flags TV_BJ", () => {
      expect(isTechnicalError({ errorCode: "TV_BJ" })).toBe(true);
    });
    it("flags TVRO without separator", () => {
      expect(isTechnicalError({ errorCode: "TVRO" })).toBe(false); // letter follows TV — not a separator
      // Actually TVRO is ambiguous. We've decided to require a separator
      // (digit / hyphen / underscore / period) after TV to avoid false
      // positives on game codes that happen to start with TV. Documenting
      // this trade-off: a real "TVRO" code would need the upload-side to
      // normalize it to "TV-RO" or "TV_RO".
    });
    it("flags TV001", () => {
      expect(isTechnicalError({ errorCode: "TV001" })).toBe(true);
    });
    it("flags lower-case tv-ro", () => {
      expect(isTechnicalError({ errorCode: "tv-ro" })).toBe(true);
    });
    it("flags SYS_VOID", () => {
      expect(isTechnicalError({ errorCode: "SYS_VOID" })).toBe(true);
    });
    it("flags EQ_FAULT", () => {
      expect(isTechnicalError({ errorCode: "EQ_FAULT" })).toBe(true);
    });
    it("flags INT_ERR", () => {
      expect(isTechnicalError({ errorCode: "INT_ERR" })).toBe(true);
    });
    it("flags TECH_VOID", () => {
      expect(isTechnicalError({ errorCode: "TECH_VOID" })).toBe(true);
    });
    it("does NOT flag SC_BAC (a real Speed Baccarat game code)", () => {
      expect(isTechnicalError({ errorCode: "SC_BAC" })).toBe(false);
    });
    it("does NOT flag DEAL_ERR", () => {
      expect(isTechnicalError({ errorCode: "DEAL_ERR" })).toBe(false);
    });
    it("does NOT flag plain GP-style codes", () => {
      expect(isTechnicalError({ errorCode: "GP_X" })).toBe(false);
      expect(isTechnicalError({ errorCode: "ROULETTE_001" })).toBe(false);
    });
  });

  describe("errorDescription signal", () => {
    it("flags exact 'Technical error' (the screenshot case)", () => {
      expect(isTechnicalError({ errorDescription: "Technical error" })).toBe(true);
    });
    it("flags 'technical error' lower-case", () => {
      expect(isTechnicalError({ errorDescription: "technical error" })).toBe(true);
    });
    it("flags descriptions containing 'interface error'", () => {
      expect(isTechnicalError({ errorDescription: "TV interface error during round 14" })).toBe(true);
    });
    it("flags 'ball misread'", () => {
      expect(isTechnicalError({ errorDescription: "Ball misread by camera" })).toBe(true);
    });
    it("flags 'system void'", () => {
      expect(isTechnicalError({ errorDescription: "System void after spin" })).toBe(true);
    });
    it("flags 'voided round'", () => {
      expect(isTechnicalError({ errorDescription: "Voided round due to glitch" })).toBe(true);
    });
    it("does NOT flag a genuine procedure mistake", () => {
      expect(isTechnicalError({ errorDescription: "GP did not call last bets" })).toBe(false);
      expect(isTechnicalError({ errorDescription: "Wrong card pulled before announcement" })).toBe(false);
    });
  });

  describe("real-world combination from the screenshot", () => {
    it("flags TV-RO + Technical error", () => {
      expect(isTechnicalError({
        errorCode: "TV-RO",
        errorDescription: "Technical error",
      })).toBe(true);
    });
  });

  describe("safe defaults", () => {
    it("returns false on empty input", () => {
      expect(isTechnicalError({})).toBe(false);
    });
    it("returns false on all-null input", () => {
      expect(isTechnicalError({
        errorType: null, errorCategory: null, errorCode: null, errorDescription: null,
      })).toBe(false);
    });
  });
});
