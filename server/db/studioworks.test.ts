import { describe, it, expect } from "vitest";
import { normalizeStudioworksName, summarizeImportDetails } from "./studioworks";

describe("normalizeStudioworksName", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeStudioworksName("  Anna   Maria  ")).toBe("anna maria");
    expect(normalizeStudioworksName("KRISTO")).toBe("kristo");
  });
  it("handles null / undefined / blank", () => {
    expect(normalizeStudioworksName(null)).toBe("");
    expect(normalizeStudioworksName(undefined)).toBe("");
    expect(normalizeStudioworksName("   ")).toBe("");
  });
  it("makes equivalent names collide on the same key", () => {
    expect(normalizeStudioworksName("Anna  Maria")).toBe(normalizeStudioworksName("anna maria"));
  });
});

describe("summarizeImportDetails", () => {
  it("counts each outcome and reports success when everything lands cleanly", () => {
    const s = summarizeImportDetails([
      { matched: true },                        // inserted
      { matched: true, skippedExisting: true }, // skipped
      { matched: true, updated: true },         // updated
    ]);
    expect(s).toMatchObject({
      inserted: 1, skipped: 1, updated: 1, unmatched: 0, errors: 0,
      status: "success", totalFound: 3,
    });
  });

  it("flags partial when a row is unmatched or errored", () => {
    const s = summarizeImportDetails([
      { matched: true },                // inserted
      { matched: false },               // unmatched
      { matched: true, error: "boom" }, // errored
    ]);
    expect(s.inserted).toBe(1);
    expect(s.unmatched).toBe(1);
    expect(s.errors).toBe(1);
    expect(s.status).toBe("partial");
  });

  it("does not count a date-parse failure as unmatched", () => {
    const s = summarizeImportDetails([{ matched: false, error: "unparseable date: x" }]);
    expect(s.unmatched).toBe(0);
    expect(s.errors).toBe(1);
    expect(s.status).toBe("partial");
  });

  it("is failed when nothing was found", () => {
    expect(summarizeImportDetails([]).status).toBe("failed");
    expect(summarizeImportDetails([], 0).status).toBe("failed");
  });

  it("honors an explicit totalFound over the details length", () => {
    expect(summarizeImportDetails([{ matched: true }], 5).totalFound).toBe(5);
  });
});
