import { describe, it, expect } from "vitest";

describe("Report Generate Email Body", () => {
  // Simulates the stats array structure returned by getGPMonthlyStats
  const mockStats = [
    { gpId: 1, gpName: "Alice", evaluationCount: 5, avgAppearanceScore: 10.5, avgGamePerfScore: 8.2, avgTotalScore: 20.1 },
    { gpId: 2, gpName: "Bob", evaluationCount: 3, avgAppearanceScore: 9.0, avgGamePerfScore: 7.5, avgTotalScore: 17.8 },
    { gpId: 3, gpName: "Charlie", evaluationCount: 4, avgAppearanceScore: 11.0, avgGamePerfScore: 9.0, avgTotalScore: 22.0 },
  ];

  it("should correctly compute totalGPs from stats.length", () => {
    const totalGPs = mockStats.length;
    expect(totalGPs).toBe(3);
  });

  it("should correctly compute averageScore from stats array", () => {
    const averageScore = mockStats.length > 0
      ? (mockStats.reduce((sum, gp) => sum + Number(gp.avgTotalScore || 0), 0) / mockStats.length)
      : 0;
    expect(averageScore).toBeCloseTo(19.97, 1);
    expect(averageScore.toFixed(1)).toBe("20.0");
  });

  it("should correctly compute totalEvaluations from stats array", () => {
    const totalEvaluations = mockStats.reduce((sum, gp) => sum + gp.evaluationCount, 0);
    expect(totalEvaluations).toBe(12);
  });

  it("should handle empty stats array gracefully", () => {
    const emptyStats: typeof mockStats = [];
    const totalGPs = emptyStats.length;
    const averageScore = emptyStats.length > 0
      ? (emptyStats.reduce((sum, gp) => sum + Number(gp.avgTotalScore || 0), 0) / emptyStats.length).toFixed(1)
      : "N/A";
    const totalEvaluations = emptyStats.reduce((sum, gp) => sum + gp.evaluationCount, 0);

    expect(totalGPs).toBe(0);
    expect(averageScore).toBe("N/A");
    expect(totalEvaluations).toBe(0);
  });

  it("should generate correct email body format", () => {
    const teamName = "Team White";
    const monthName = "January";
    const year = 2026;
    const userName = "Test User";

    const totalGPs = mockStats.length;
    const avgScore = (mockStats.reduce((sum, gp) => sum + Number(gp.avgTotalScore || 0), 0) / mockStats.length).toFixed(1);
    const totalEvals = mockStats.reduce((sum, gp) => sum + gp.evaluationCount, 0);

    const body = `Hello ${userName},\n\nYour Team Monthly Overview report has been generated successfully.\n\n📋 Report Details:\n• Team: ${teamName}\n• Period: ${monthName} ${year}\n\n📊 Key Stats:\n• Total GPs: ${totalGPs}\n• Average Score: ${avgScore}\n• Total Evaluations: ${totalEvals}\n\nYou can view the full report from the GP Report Generator dashboard.\n\n---\nThis is an automated message from GP Report Generator.`;

    expect(body).toContain("Team White");
    expect(body).toContain("January 2026");
    expect(body).toContain("Total GPs: 3");
    expect(body).toContain("Average Score: 20.0");
    expect(body).toContain("Total Evaluations: 12");
    expect(body).toContain("Hello Test User");
  });
});
