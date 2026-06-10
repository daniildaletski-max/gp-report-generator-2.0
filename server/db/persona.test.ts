import { describe, it, expect } from "vitest";
import { normalizePersonaName, summarizePersonaSync } from "./persona";

describe("normalizePersonaName", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizePersonaName("  Anna   Maria  ")).toBe("anna maria");
    expect(normalizePersonaName("KASHNOVA Marija")).toBe("kashnova marija");
  });
  it("handles null / undefined / blank", () => {
    expect(normalizePersonaName(null)).toBe("");
    expect(normalizePersonaName(undefined)).toBe("");
    expect(normalizePersonaName("   ")).toBe("");
  });
});

describe("summarizePersonaSync", () => {
  it("counts matched / unmatched and reports success when clean", () => {
    const s = summarizePersonaSync([
      { workerName: "A", matched: true },
      { workerName: "B", matched: true },
    ]);
    expect(s).toEqual({ totalWorkers: 2, matched: 2, unmatched: 0, status: "success" });
  });
  it("is partial when any worker is unmatched or errored", () => {
    const s = summarizePersonaSync([
      { workerName: "A", matched: true },
      { workerName: "B", matched: false },
      { workerName: "C", matched: true, error: "boom" },
    ]);
    expect(s.matched).toBe(1); // the errored row doesn't count as cleanly matched
    expect(s.unmatched).toBe(1);
    expect(s.status).toBe("partial");
  });
  it("is failed when the scrape returned no workers", () => {
    expect(summarizePersonaSync([]).status).toBe("failed");
  });
});
