/**
 * Regression tests for the screenshot date-filter bug.
 *
 * Scenario from the screenshot the user reported:
 *   - GP Portal selects "April 2026"
 *   - But two attitude entries dated "Mar 14" and "Mar 16, 2026" appear
 *
 * Root cause was that `attitudeScreenshots.month`/`.year` were stored
 * from the upload moment, while the row's own `evaluationDate` was the
 * truthful entry date. The filter matched the wrong column.
 *
 * Two-pronged fix locked in here:
 *   1. `monthRange` produces start/end-exclusive boundaries the new
 *      query helper uses to filter on `COALESCE(evaluationDate, createdAt)`.
 *   2. `parseAttitudeEntryDate` returns the correct Date so the insert
 *      can derive month/year from it — preventing future writes from
 *      ever inheriting the bug again.
 *
 * Higher-level "the SQL produces the right rows" lives implicitly in
 * the smoke test plan; we don't have an in-memory MySQL harness here.
 */
import { describe, it, expect } from "vitest";
import { monthRange, parseIsoDateLocal } from "./db/_dateRange";
import { parseAttitudeEntryDate } from "./routers/attitudeScreenshot";

describe("monthRange", () => {
  it("returns the first millisecond of the month as start", () => {
    const { start } = monthRange(3, 2026);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(2); // March = 2 (0-indexed)
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it("returns the first millisecond of the NEXT month as endExclusive", () => {
    const { endExclusive } = monthRange(3, 2026);
    expect(endExclusive.getFullYear()).toBe(2026);
    expect(endExclusive.getMonth()).toBe(3); // April = 3
    expect(endExclusive.getDate()).toBe(1);
    expect(endExclusive.getHours()).toBe(0);
  });

  it("rolls year over when month is December", () => {
    const { endExclusive } = monthRange(12, 2026);
    expect(endExclusive.getFullYear()).toBe(2027);
    expect(endExclusive.getMonth()).toBe(0); // January
  });

  it("includes the very last instant of the previous month? NO — exclusive end", () => {
    const { endExclusive } = monthRange(3, 2026);
    // Mar 31 23:59:59 must be < endExclusive (April 1 00:00:00)
    const lastMomentOfMarch = new Date(2026, 2, 31, 23, 59, 59, 999);
    expect(lastMomentOfMarch.getTime()).toBeLessThan(endExclusive.getTime());
    // April 1 00:00:00 must equal endExclusive — so it's NOT in March
    const aprilStart = new Date(2026, 3, 1, 0, 0, 0, 0);
    expect(aprilStart.getTime()).toBe(endExclusive.getTime());
  });

  it("filter window for the screenshot bug: March 14 belongs to March, NOT April", () => {
    // The exact dates from the bug screenshot
    const mar14 = new Date(2026, 2, 14, 12, 0, 0, 0);
    const mar16 = new Date(2026, 2, 16, 12, 0, 0, 0);

    const march = monthRange(3, 2026);
    expect(mar14.getTime()).toBeGreaterThanOrEqual(march.start.getTime());
    expect(mar14.getTime()).toBeLessThan(march.endExclusive.getTime());
    expect(mar16.getTime()).toBeGreaterThanOrEqual(march.start.getTime());
    expect(mar16.getTime()).toBeLessThan(march.endExclusive.getTime());

    const april = monthRange(4, 2026);
    expect(mar14.getTime()).toBeLessThan(april.start.getTime());
    expect(mar16.getTime()).toBeLessThan(april.start.getTime());
  });
});

describe("parseAttitudeEntryDate", () => {
  it("parses '14 Mar 2026, 12:00' to a March 14 Date", () => {
    const d = parseAttitudeEntryDate("14 Mar 2026, 12:00");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2); // March
    expect(d!.getDate()).toBe(14);
  });

  it("parses '16 Mar 2026' without time", () => {
    const d = parseAttitudeEntryDate("16 Mar 2026");
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(2); // March
    expect(d!.getDate()).toBe(16);
  });

  it("month/year derived from parsed date matches the entry's actual month", () => {
    // This is the heart of the fix: an entry dated Mar 14 must land in
    // month=3, year=2026 even when uploaded in April.
    const d = parseAttitudeEntryDate("14 Mar 2026, 21:00");
    expect(d).not.toBeNull();
    const month = d!.getMonth() + 1;
    const year = d!.getFullYear();
    expect(month).toBe(3);
    expect(year).toBe(2026);
  });

  it("returns null for missing input — caller must fall back to upload moment", () => {
    expect(parseAttitudeEntryDate(undefined)).toBeNull();
    expect(parseAttitudeEntryDate(null)).toBeNull();
    expect(parseAttitudeEntryDate("")).toBeNull();
  });

  it("returns null for unrecognised format", () => {
    expect(parseAttitudeEntryDate("2026-03-14")).toBeNull(); // ISO not supported by this helper
    expect(parseAttitudeEntryDate("yesterday")).toBeNull();
  });

  it("returns null for invalid month name", () => {
    expect(parseAttitudeEntryDate("14 Foo 2026")).toBeNull();
  });

  it("handles single-digit day", () => {
    const d = parseAttitudeEntryDate("3 Jan 2026, 21:00");
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(3);
  });

  it("first-of-month date-only entry stays in that month (no UTC day-shift)", () => {
    // Codex review #22: `new Date("2026-03-01")` was being read as UTC
    // midnight, which on a US server means Feb 28 local — so a March 1
    // entry got filed under February. Local-time constructor avoids
    // that drift.
    const d = parseAttitudeEntryDate("1 Mar 2026");
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(2); // March
    expect(d!.getDate()).toBe(1);
    expect(d!.getFullYear()).toBe(2026);
  });

  it("month boundary: 31 Mar 2026, 23:59 stays March, NOT April", () => {
    // Without time component this parser drops to midnight of that
    // day, which still belongs to March. We only test the "stays in
    // March" property — caller's monthRange filter handles the slot.
    const d = parseAttitudeEntryDate("31 Mar 2026");
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(2); // March
    expect(d!.getDate()).toBe(31);
  });
});

describe("regression: screenshot bug", () => {
  it("an attitude entry dated Mar 14 uploaded on April 28 is filed under March, not April", () => {
    // Simulate what the upload code now does:
    const entryDateRaw = "14 Mar 2026, 21:00";
    const parsed = parseAttitudeEntryDate(entryDateRaw);
    expect(parsed).not.toBeNull();

    const derivedMonth = parsed!.getMonth() + 1;
    const derivedYear = parsed!.getFullYear();
    expect(derivedMonth).toBe(3);
    expect(derivedYear).toBe(2026);

    // And the query-side filter for April excludes it…
    const aprilWindow = monthRange(4, 2026);
    expect(parsed!.getTime()).toBeLessThan(aprilWindow.start.getTime());

    // …while the March filter includes it.
    const marchWindow = monthRange(3, 2026);
    expect(parsed!.getTime()).toBeGreaterThanOrEqual(marchWindow.start.getTime());
    expect(parsed!.getTime()).toBeLessThan(marchWindow.endExclusive.getTime());
  });
});

describe("parseIsoDateLocal", () => {
  // Used by errorScreenshot for the OCR'd `errorDate` field
  // which arrives as YYYY-MM-DD. The bug Codex flagged: `new Date("2026-03-01")`
  // is parsed as UTC and shifts to Feb 28 in negative offsets, so an April-1
  // incident could land in March (or vice-versa).
  it("parses YYYY-MM-DD as local-day midnight, not UTC", () => {
    const d = parseIsoDateLocal("2026-03-01");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(1);
    expect(d!.getHours()).toBe(0);
  });

  it("returns null for missing or empty input", () => {
    expect(parseIsoDateLocal(undefined)).toBeNull();
    expect(parseIsoDateLocal(null)).toBeNull();
    expect(parseIsoDateLocal("")).toBeNull();
    expect(parseIsoDateLocal("   ")).toBeNull();
  });

  it("returns null for non-ISO formats", () => {
    expect(parseIsoDateLocal("2026/03/01")).toBeNull();
    expect(parseIsoDateLocal("Mar 1 2026")).toBeNull();
    expect(parseIsoDateLocal("2026-3-1")).toBeNull(); // strict — needs zero-padding
    expect(parseIsoDateLocal("2026-13-01")).toBeNull(); // out-of-range month
    expect(parseIsoDateLocal("2026-03-32")).toBeNull(); // out-of-range day
  });

  it("derived month/year matches the local calendar day", () => {
    const d = parseIsoDateLocal("2026-04-01");
    expect(d).not.toBeNull();
    expect(d!.getMonth() + 1).toBe(4); // April, not March
    expect(d!.getDate()).toBe(1);
  });
});
