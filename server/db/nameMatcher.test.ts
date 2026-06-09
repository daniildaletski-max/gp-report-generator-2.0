import { describe, it, expect } from "vitest";
import { nameMatchScore } from "./gamePresenters";

/**
 * Sanity tests for the GP fuzzy matcher, using the real names users
 * reported as "unmatched" in the studioworks importer. These names are
 * Estonian + Slavic and carry diacritics (š ž ä ö ü õ), so the matcher
 * MUST score above 0.7 against any reasonable rendering of the same name
 * — otherwise the FM sees them as unmatched even though the GP exists.
 */
describe("nameMatchScore — robustness on real GP names", () => {
  const THRESHOLD = 0.7;

  // Pairs of (Studioworks input, plausible DB rendering) for each
  // reported unmatched name. If any pair scores below threshold, the
  // matcher is too strict for that case.
  const cases: Array<[string, string, string]> = [
    // [studioworks form, possible DB form, label]
    ["Maria Tšekotina", "Maria Tsekotina", "diacritic š ↔ s"],
    ["Marija Kashnova", "Maria Kashnova", "Marija ↔ Maria (Slavic spelling)"],
    ["Polina Lillepea", "Polina Lillepea", "identity"],
    ["Veronika Belyaeva", "Veronika Belyayeva", "ya ↔ yay"],
    ["Angelina Tuluša", "Angelina Tulusa", "diacritic š ↔ s"],
    ["Anneli Zaitseva", "Anneli Zaitseva", "identity"],
    ["Karoliina Rajamägi", "Karoliina Rajamagi", "diacritic ä ↔ a"],
    ["Kateryna Hantseva", "Kateryna Gantseva", "H ↔ G (transliteration variant)"],
    ["Keitlin Gruzdova", "Keitlin Gruzdova", "identity"],
    ["Kirill Stepanenko", "Kirill Stepanenko", "identity"],
    ["Darja Kornilova", "Darya Kornilova", "j ↔ y"],
    ["Fjodor Leontjev", "Fyodor Leontev", "diacritic-free transliteration"],
    ["Grettel Kaljuste", "Grettel Kaljuste", "identity"],
    ["Heili Liis Kallasse", "Heili Kallasse", "drops middle name"],
    ["Astrid Suvorov", "Astrid Suvorov", "identity"],
    ["Angelina Želobetski", "Angelina Zelobetski", "diacritic ž ↔ z"],
    ["Oleksandra Korniienko", "Aleksandra Korniienko", "Ole- ↔ Ale-"],
  ];

  for (const [sw, db, label] of cases) {
    it(`matches "${sw}" against "${db}" (${label})`, () => {
      const score = nameMatchScore(sw, db);
      expect(score, `score ${score.toFixed(3)} should be >= ${THRESHOLD}`).toBeGreaterThanOrEqual(THRESHOLD);
    });
  }

  it("does NOT match wildly different names (no false positives)", () => {
    expect(nameMatchScore("Maria Tšekotina", "Vegas Star")).toBeLessThan(THRESHOLD);
    expect(nameMatchScore("Kirill Stepanenko", "Diamond Dealer")).toBeLessThan(THRESHOLD);
  });

  it("treats word order as the same name (HR systems flip Firstname Lastname)", () => {
    expect(nameMatchScore("Tšekotina Maria", "Maria Tsekotina")).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("handles substring stage-name matches (containsMatch hits 0.85)", () => {
    expect(nameMatchScore("Kirill", "Kirill Stepanenko")).toBeGreaterThanOrEqual(THRESHOLD);
  });
});
