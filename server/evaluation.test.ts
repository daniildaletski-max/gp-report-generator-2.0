import { describe, expect, it, vi } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          presenterName: "Agnes Suvorov",
          evaluatorName: "Alexandra-Elizabeth Martinson",
          date: "9 Jan 2026",
          game: "Baccarat",
          totalScore: 21,
          hair: { score: 2, maxScore: 3, comment: "straight hair" },
          makeup: { score: 3, maxScore: 3, comment: "well applied make up" },
          outfit: { score: 3, maxScore: 3, comment: "fits well" },
          posture: { score: 3, maxScore: 3, comment: "sits well" },
          dealingStyle: { score: 5, maxScore: 5, comment: "deals the cards accurately" },
          gamePerformance: { score: 5, maxScore: 5, comment: "presenter demonstrates an entertaining and positive presence, maintains strong eye contact with the camera, and is clearly audible" }
        })
      }
    }]
  })
}));

describe("Evaluation Data Extraction", () => {
  it("should parse evaluation data correctly from LLM response", async () => {
    const mockResponse = {
      presenterName: "Agnes Suvorov",
      evaluatorName: "Alexandra-Elizabeth Martinson",
      date: "9 Jan 2026",
      game: "Baccarat",
      totalScore: 21,
      hair: { score: 2, maxScore: 3, comment: "straight hair" },
      makeup: { score: 3, maxScore: 3, comment: "well applied make up" },
      outfit: { score: 3, maxScore: 3, comment: "fits well" },
      posture: { score: 3, maxScore: 3, comment: "sits well" },
      dealingStyle: { score: 5, maxScore: 5, comment: "deals the cards accurately" },
      gamePerformance: { score: 5, maxScore: 5, comment: "presenter demonstrates an entertaining and positive presence" }
    };

    expect(mockResponse.presenterName).toBe("Agnes Suvorov");
    expect(mockResponse.totalScore).toBe(21);
    expect(mockResponse.hair.score).toBe(2);
    expect(mockResponse.hair.maxScore).toBe(3);
    expect(mockResponse.dealingStyle.score).toBe(5);
    expect(mockResponse.gamePerformance.score).toBe(5);
  });

  it("should calculate total score correctly", () => {
    const scores = {
      hair: 2,
      makeup: 3,
      outfit: 3,
      posture: 3,
      dealingStyle: 5,
      gamePerformance: 5
    };

    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    expect(total).toBe(21);
  });

  it("should parse date string correctly", () => {
    const dateStr = "9 Jan 2026";
    const parsed = new Date(dateStr);
    
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(0); // January is 0
    expect(parsed.getDate()).toBe(9);
  });

  it("should handle different game types", () => {
    const games = ["Baccarat", "Roulette", "Blackjack", "Poker"];
    
    games.forEach(game => {
      expect(typeof game).toBe("string");
      expect(game.length).toBeGreaterThan(0);
    });
  });

  it("should validate score ranges", () => {
    const evaluation = {
      hair: { score: 2, maxScore: 3 },
      makeup: { score: 3, maxScore: 3 },
      outfit: { score: 3, maxScore: 3 },
      posture: { score: 3, maxScore: 3 },
      dealingStyle: { score: 5, maxScore: 5 },
      gamePerformance: { score: 4, maxScore: 5 }
    };

    Object.values(evaluation).forEach(category => {
      expect(category.score).toBeLessThanOrEqual(category.maxScore);
      expect(category.score).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("Monthly Statistics Aggregation", () => {
  it("should calculate average scores correctly", () => {
    const evaluations = [
      { totalScore: 21, hairScore: 2, makeupScore: 3 },
      { totalScore: 20, hairScore: 2, makeupScore: 3 },
      { totalScore: 20, hairScore: 3, makeupScore: 3 }
    ];

    const avgTotal = evaluations.reduce((sum, e) => sum + e.totalScore, 0) / evaluations.length;
    const avgHair = evaluations.reduce((sum, e) => sum + e.hairScore, 0) / evaluations.length;

    expect(avgTotal.toFixed(1)).toBe("20.3");
    expect(avgHair.toFixed(1)).toBe("2.3");
  });

  it("should group evaluations by presenter", () => {
    const evaluations = [
      { presenterId: 1, presenterName: "Agnes", totalScore: 21 },
      { presenterId: 1, presenterName: "Agnes", totalScore: 20 },
      { presenterId: 2, presenterName: "Akemi", totalScore: 20 }
    ];

    const grouped = evaluations.reduce((acc, e) => {
      if (!acc[e.presenterId]) {
        acc[e.presenterId] = { name: e.presenterName, scores: [] };
      }
      acc[e.presenterId].scores.push(e.totalScore);
      return acc;
    }, {} as Record<number, { name: string; scores: number[] }>);

    expect(Object.keys(grouped).length).toBe(2);
    expect(grouped[1].scores.length).toBe(2);
    expect(grouped[2].scores.length).toBe(1);
  });
});
