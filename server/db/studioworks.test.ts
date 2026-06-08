import { describe, it, expect } from "vitest";
import {
  normalizeStudioworksName,
  summarizeImportDetails,
  frequencyToMs,
  shouldRunScheduledSync,
  nextRunAt,
  studioworksContentHash,
} from "./studioworks";

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

describe("frequencyToMs", () => {
  it("maps each frequency to milliseconds", () => {
    expect(frequencyToMs("6h")).toBe(6 * 3600_000);
    expect(frequencyToMs("12h")).toBe(12 * 3600_000);
    expect(frequencyToMs("daily")).toBe(24 * 3600_000);
  });
});

describe("shouldRunScheduledSync", () => {
  const now = new Date("2026-06-08T12:00:00Z");

  it("never runs when disabled", () => {
    expect(shouldRunScheduledSync({ autoSyncEnabled: 0, frequency: "6h" }, null, now)).toBe(false);
  });
  it("runs when enabled and never run before", () => {
    expect(shouldRunScheduledSync({ autoSyncEnabled: 1, frequency: "6h" }, null, now)).toBe(true);
  });
  it("waits until the frequency gap has elapsed", () => {
    const fourHoursAgo = new Date(now.getTime() - 4 * 3600_000);
    const sevenHoursAgo = new Date(now.getTime() - 7 * 3600_000);
    expect(shouldRunScheduledSync({ autoSyncEnabled: 1, frequency: "6h" }, fourHoursAgo, now)).toBe(false);
    expect(shouldRunScheduledSync({ autoSyncEnabled: 1, frequency: "6h" }, sevenHoursAgo, now)).toBe(true);
  });
  it("treats an unparseable last-run as due", () => {
    expect(shouldRunScheduledSync({ autoSyncEnabled: 1, frequency: "daily" }, "not-a-date", now)).toBe(true);
  });
});

describe("nextRunAt", () => {
  it("is null when disabled", () => {
    expect(nextRunAt({ autoSyncEnabled: 0, frequency: "6h" }, new Date())).toBeNull();
  });
  it("is last-run + frequency when enabled", () => {
    const last = new Date("2026-06-08T00:00:00Z");
    expect(nextRunAt({ autoSyncEnabled: 1, frequency: "12h" }, last)?.toISOString())
      .toBe(new Date("2026-06-08T12:00:00Z").toISOString());
  });
});

describe("studioworksContentHash", () => {
  const base = { d: "2026-04-30", g: "Baccarat", t: 20, hair: 3, oa: "great" };

  it("is stable for identical content", () => {
    expect(studioworksContentHash(base)).toBe(studioworksContentHash({ ...base }));
  });
  it("is independent of key order", () => {
    expect(studioworksContentHash({ a: 1, b: 2 })).toBe(studioworksContentHash({ b: 2, a: 1 }));
  });
  it("changes when any value changes", () => {
    expect(studioworksContentHash(base)).not.toBe(studioworksContentHash({ ...base, t: 21 }));
    expect(studioworksContentHash(base)).not.toBe(studioworksContentHash({ ...base, oa: "ok" }));
  });
  it("treats null and empty-string as equivalent (avoids spurious updates)", () => {
    expect(studioworksContentHash({ x: null })).toBe(studioworksContentHash({ x: "" }));
  });
});
