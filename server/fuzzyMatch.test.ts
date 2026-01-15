import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Test the fuzzy matching algorithm directly
describe("Fuzzy Matching Algorithm", () => {
  // Levenshtein distance algorithm
  function levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  }

  // Calculate similarity score (0-1, where 1 is exact match)
  function calculateSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;
    const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return 1 - distance / maxLen;
  }

  // Normalize name for comparison
  function normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[''`]/g, "'")
      .replace(/[–—]/g, '-');
  }

  describe("levenshteinDistance", () => {
    it("returns 0 for identical strings", () => {
      expect(levenshteinDistance("hello", "hello")).toBe(0);
    });

    it("returns correct distance for single character difference", () => {
      expect(levenshteinDistance("hello", "hallo")).toBe(1);
    });

    it("returns string length for completely different strings", () => {
      expect(levenshteinDistance("abc", "xyz")).toBe(3);
    });

    it("handles empty strings", () => {
      expect(levenshteinDistance("", "hello")).toBe(5);
      expect(levenshteinDistance("hello", "")).toBe(5);
      expect(levenshteinDistance("", "")).toBe(0);
    });
  });

  describe("calculateSimilarity", () => {
    it("returns 1 for identical strings", () => {
      expect(calculateSimilarity("Sofia Barchan", "Sofia Barchan")).toBe(1);
    });

    it("returns high similarity for similar names (Sofja vs Sofia)", () => {
      const similarity = calculateSimilarity("Sofja Barchan", "Sofia Barchan");
      expect(similarity).toBeGreaterThan(0.9);
    });

    it("returns high similarity for similar names (Kristina vs Christina)", () => {
      const similarity = calculateSimilarity("Kristina Bobrovskaja", "Christina Bobrovskaja");
      expect(similarity).toBeGreaterThan(0.9);
    });

    it("returns high similarity for hyphen vs space variations", () => {
      const similarity = calculateSimilarity("Anna Maria", "Anna-Maria");
      expect(similarity).toBeGreaterThan(0.85);
    });

    it("returns high similarity for missing letter", () => {
      const similarity = calculateSimilarity("John Smith", "Jon Smith");
      expect(similarity).toBeGreaterThan(0.85);
    });

    it("returns low similarity for completely different names", () => {
      const similarity = calculateSimilarity("John Smith", "Maria Garcia");
      expect(similarity).toBeLessThan(0.5);
    });
  });

  describe("normalizeName", () => {
    it("converts to lowercase", () => {
      expect(normalizeName("SOFIA BARCHAN")).toBe("sofia barchan");
    });

    it("trims whitespace", () => {
      expect(normalizeName("  Sofia Barchan  ")).toBe("sofia barchan");
    });

    it("normalizes multiple spaces", () => {
      expect(normalizeName("Sofia   Barchan")).toBe("sofia barchan");
    });

    it("normalizes apostrophes", () => {
      expect(normalizeName("O'Connor")).toBe("o'connor");
      expect(normalizeName("O'Connor")).toBe("o'connor");
    });

    it("normalizes dashes", () => {
      expect(normalizeName("Anna–Maria")).toBe("anna-maria");
      expect(normalizeName("Anna—Maria")).toBe("anna-maria");
    });
  });

  describe("Fuzzy Matching Threshold Tests", () => {
    const MATCH_THRESHOLD = 0.85;

    it("matches Sofja to Sofia (above 85% threshold)", () => {
      const similarity = calculateSimilarity("Sofja Barchan", "Sofia Barchan");
      expect(similarity).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    });

    it("matches Kristina to Christina (above 85% threshold)", () => {
      const similarity = calculateSimilarity("Kristina Bobrovskaja", "Christina Bobrovskaja");
      expect(similarity).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    });

    it("matches Alexandra-Elizabeth to Alexandra Elizabeth (above 85% threshold)", () => {
      const similarity = calculateSimilarity("Alexandra-Elizabeth", "Alexandra Elizabeth");
      expect(similarity).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    });

    it("does not match completely different names (below 85% threshold)", () => {
      const similarity = calculateSimilarity("John Smith", "Maria Garcia");
      expect(similarity).toBeLessThan(MATCH_THRESHOLD);
    });
  });
});
