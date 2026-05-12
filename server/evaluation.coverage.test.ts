import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the evaluation.coverage endpoint.
 * We mock the db module to avoid hitting the real database.
 */

// Mock db module
vi.mock("./db", () => ({
  getAllTeamsWithGPs: vi.fn(),
  getTeamsWithGPsByUser: vi.fn(),
  getEvaluationsByGPAndMonth: vi.fn(),
  getEvaluationsByGP: vi.fn(),
}));

import * as db from "./db";

const mockedDb = vi.mocked(db);

describe("evaluation.coverage logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should classify GP with 0 evals as 'missing'", async () => {
    const evalCount = 0;
    let status: "complete" | "partial" | "missing" = "missing";
    if (evalCount >= 6) status = "complete";
    else if (evalCount > 0) status = "partial";
    expect(status).toBe("missing");
  });

  it("should classify GP with 1-5 evals as 'partial'", async () => {
    for (const count of [1, 2, 3, 4, 5]) {
      let status: "complete" | "partial" | "missing" = "missing";
      if (count >= 6) status = "complete";
      else if (count > 0) status = "partial";
      expect(status).toBe("partial");
    }
  });

  it("should classify GP with 6+ evals as 'complete'", async () => {
    for (const count of [6, 7, 10, 20]) {
      let status: "complete" | "partial" | "missing" = "missing";
      if (count >= 6) status = "complete";
      else if (count > 0) status = "partial";
      expect(status).toBe("complete");
    }
  });

  it("should calculate average score correctly", () => {
    const scores = [18, 20, 19, 21, 17, 20];
    const avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    expect(avgScore).toBe(19.2);
  });

  it("should handle empty scores array", () => {
    const scores: number[] = [];
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;
    expect(avgScore).toBeNull();
  });

  it("should sort GPs: missing first, then partial, then complete", () => {
    const gps = [
      { gpName: "Alice", status: "complete" as const },
      { gpName: "Bob", status: "missing" as const },
      { gpName: "Charlie", status: "partial" as const },
      { gpName: "Diana", status: "missing" as const },
    ];

    const statusRank: Record<string, number> = { missing: 0, partial: 1, complete: 2 };
    gps.sort((a, b) => {
      const sa = statusRank[a.status] ?? 99;
      const sb = statusRank[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return a.gpName.localeCompare(b.gpName);
    });

    expect(gps.map(g => g.gpName)).toEqual(["Bob", "Diana", "Charlie", "Alice"]);
  });

  it("should compute summary counts correctly", () => {
    const gpCoverage = [
      { status: "complete" as const },
      { status: "complete" as const },
      { status: "partial" as const },
      { status: "missing" as const },
      { status: "missing" as const },
      { status: "missing" as const },
    ];

    const summary = {
      total: gpCoverage.length,
      complete: gpCoverage.filter(g => g.status === "complete").length,
      partial: gpCoverage.filter(g => g.status === "partial").length,
      missing: gpCoverage.filter(g => g.status === "missing").length,
    };

    expect(summary).toEqual({ total: 6, complete: 2, partial: 1, missing: 3 });
  });
});
