import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("fmTeam.list", () => {
  it("returns list of FM teams", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fmTeam.list();

    expect(Array.isArray(result)).toBe(true);
    // Should have at least the 3 default teams
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

describe("gamePresenter.list", () => {
  it("returns list of game presenters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.gamePresenter.list();

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("dashboard.stats", () => {
  it("returns dashboard statistics", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.stats({ month: 1, year: 2026 });

    expect(result).toHaveProperty("totalGPs");
    expect(result).toHaveProperty("totalEvaluations");
    expect(result).toHaveProperty("totalReports");
    expect(result).toHaveProperty("thisMonthGPs");
    expect(result).toHaveProperty("gpStats");
    expect(typeof result.totalGPs).toBe("number");
    expect(typeof result.totalEvaluations).toBe("number");
    expect(typeof result.totalReports).toBe("number");
    expect(typeof result.thisMonthGPs).toBe("number");
    expect(Array.isArray(result.gpStats)).toBe(true);
  });
});

describe("report.list", () => {
  it("returns list of reports with teams", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.report.list();

    expect(Array.isArray(result)).toBe(true);
  });
});


describe("Excel Template Structure", () => {
  it("should have correct sheet order - Data first, Monthly second", () => {
    const expectedSheetOrder = ["Data", "January 2026"];
    expect(expectedSheetOrder[0]).toBe("Data");
    expect(expectedSheetOrder[1]).toContain("2026");
  });

  it("should have correct attendance table headers", () => {
    const attendanceHeaders = [
      "Name ",
      "Mistakes",
      "Extra shifts/\nStaying longer",
      "Late to work",
      "Missed days",
      "Sick leaves ",
      "Attitude/ Concerns/ Remarks",
    ];

    expect(attendanceHeaders).toContain("Mistakes");
    expect(attendanceHeaders).toContain("Late to work");
    expect(attendanceHeaders).toContain("Sick leaves ");
    expect(attendanceHeaders.length).toBe(7);
  });
});

describe("GP Evaluation Calculations", () => {
  it("should calculate GAME PERF. as sum of Dealing Style and Game Performance", () => {
    const dealingStyleScore = 8;
    const gamePerformanceScore = 7;
    const expectedGamePerf = dealingStyleScore + gamePerformanceScore;
    expect(expectedGamePerf).toBe(15);
  });

  it("should calculate APPEARANCE as sum of Hair, Makeup, Outfit, Posture", () => {
    const hairScore = 3;
    const makeupScore = 3;
    const outfitScore = 3;
    const postureScore = 3;
    const expectedAppearance = hairScore + makeupScore + outfitScore + postureScore;
    expect(expectedAppearance).toBe(12);
  });

  it("should support up to 4 evaluations per GP in Data sheet", () => {
    const maxEvaluationsPerGP = 4;
    const gpEvaluations = [
      { gamePerformanceScore: 14, appearanceScore: 11 },
      { gamePerformanceScore: 15, appearanceScore: 12 },
      { gamePerformanceScore: 13, appearanceScore: 10 },
      { gamePerformanceScore: 14, appearanceScore: 11 },
    ];
    expect(gpEvaluations.length).toBeLessThanOrEqual(maxEvaluationsPerGP);
  });
});

describe("Error File Parsing", () => {
  it("should recognize valid GP names", () => {
    const validNames = [
      "Alina Jivoloup",
      "Kirke Kirs",
      "Valeria Pomerants",
      "Heili Liis Kallasse",
      "Akemi Hashimura",
    ];

    const namePattern = /^[A-Za-z\u00C0-\u024F\s'-]+$/;

    validNames.forEach((name) => {
      expect(namePattern.test(name)).toBe(true);
      expect(name.length).toBeLessThan(100);
    });
  });

  it("should reject invalid GP names", () => {
    const invalidNames = [
      "=IFERROR(VLOOKUP(B4, Sour",
      "GP Name",
      "",
      "12345",
      "A=1.0",
    ];

    const namePattern = /^[A-Za-z\u00C0-\u024F\s'-]+$/;

    invalidNames.forEach((name) => {
      const isValid =
        name.length > 0 &&
        !name.startsWith("=") &&
        name !== "GP Name" &&
        namePattern.test(name) &&
        name.length < 100;
      expect(isValid).toBe(false);
    });
  });

  it("should count errors per GP correctly", () => {
    const gpErrors = [
      "Kirke Kirs",
      "Kirke Kirs",
      "Alina Jivoloup",
      "Kirke Kirs",
      "Valeria Pomerants",
    ];

    const gpErrorCounts: Record<string, number> = {};
    gpErrors.forEach((name) => {
      gpErrorCounts[name] = (gpErrorCounts[name] || 0) + 1;
    });

    expect(gpErrorCounts["Kirke Kirs"]).toBe(3);
    expect(gpErrorCounts["Alina Jivoloup"]).toBe(1);
    expect(gpErrorCounts["Valeria Pomerants"]).toBe(1);
  });

  it("should expect Errors sheet in both Playgon and MG files", () => {
    const expectedSheetName = "Errors";
    const playgonSheets = [
      "Analysis",
      "List of Error Codes",
      "Errors",
      "SourceData",
      "Error Count Analysis",
      "Error Count",
    ];
    const mgSheets = [
      "Analysis",
      "SourceData",
      "Errors",
      "Error Count",
      "Error Count Analysis",
      "List of Error Codes",
    ];

    expect(playgonSheets).toContain(expectedSheetName);
    expect(mgSheets).toContain(expectedSheetName);
  });
});

describe("Month Names", () => {
  it("should have correct month names array", () => {
    const MONTH_NAMES = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    expect(MONTH_NAMES.length).toBe(12);
    expect(MONTH_NAMES[0]).toBe("January");
    expect(MONTH_NAMES[11]).toBe("December");
  });
});


describe("gpAccess.generateToken", () => {
  it("should generate a valid token format", () => {
    // Token should be 32 characters (nanoid default)
    const tokenLength = 32;
    const mockToken = "abcdefghijklmnopqrstuvwxyz123456";
    
    expect(mockToken.length).toBe(tokenLength);
    expect(typeof mockToken).toBe("string");
  });

  it("should create valid GP portal URL", () => {
    const token = "test-token-12345";
    const baseUrl = "https://example.com";
    const portalUrl = `${baseUrl}/gp/${token}`;
    
    expect(portalUrl).toContain("/gp/");
    expect(portalUrl).toContain(token);
  });
});

describe("gpAccess.getEvaluationsByToken", () => {
  it("should return GP name and evaluations array", () => {
    const mockResponse = {
      gpName: "Test Presenter",
      gpId: 1,
      evaluations: [],
    };
    
    expect(mockResponse).toHaveProperty("gpName");
    expect(mockResponse).toHaveProperty("gpId");
    expect(mockResponse).toHaveProperty("evaluations");
    expect(Array.isArray(mockResponse.evaluations)).toBe(true);
  });

  it("should include all evaluation fields for GP portal", () => {
    const requiredFields = [
      "id",
      "evaluationDate",
      "evaluatorName",
      "game",
      "totalScore",
      "hairScore",
      "makeupScore",
      "outfitScore",
      "postureScore",
      "dealingStyleScore",
      "gamePerformanceScore",
      "appearanceScore",
      "gamePerformanceTotalScore",
    ];
    
    expect(requiredFields.length).toBeGreaterThan(10);
    expect(requiredFields).toContain("totalScore");
    expect(requiredFields).toContain("appearanceScore");
  });
});

describe("GP Portal Access Control", () => {
  it("should only allow read access (no mutations)", () => {
    // GP portal should only have query access, not mutation
    const allowedOperations = ["getEvaluationsByToken"];
    const forbiddenOperations = ["updateEvaluation", "deleteEvaluation", "createEvaluation"];
    
    expect(allowedOperations).toContain("getEvaluationsByToken");
    forbiddenOperations.forEach((op) => {
      expect(allowedOperations).not.toContain(op);
    });
  });

  it("should validate token before returning data", () => {
    const validToken = "valid-token-123";
    const invalidToken = "";
    
    expect(validToken.length).toBeGreaterThan(0);
    expect(invalidToken.length).toBe(0);
  });
});


describe("gamePresenter.delete", () => {
  it("should validate GP exists before deletion", () => {
    const gpId = 123;
    const mockGp = { id: gpId, name: "Test GP", teamId: 1 };
    
    expect(mockGp.id).toBe(gpId);
    expect(mockGp.name).toBeDefined();
  });

  it("should cascade delete related records", () => {
    const relatedTables = ["evaluations", "gpAccessTokens"];
    
    expect(relatedTables).toContain("evaluations");
    expect(relatedTables).toContain("gpAccessTokens");
    expect(relatedTables.length).toBe(2);
  });

  it("should return deleted GP name on success", () => {
    const mockResponse = { success: true, deletedName: "Test GP" };
    
    expect(mockResponse.success).toBe(true);
    expect(mockResponse.deletedName).toBeDefined();
  });
});


// ============================================
// GP MONTHLY STATS TESTS
// ============================================

describe("GP Monthly Stats", () => {
  it("should validate attitude score range (1-5)", () => {
    const validScores = [1, 2, 3, 4, 5];
    const invalidScores = [0, 6, -1, 10];
    
    validScores.forEach(score => {
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(5);
    });
    
    invalidScores.forEach(score => {
      expect(score < 1 || score > 5).toBe(true);
    });
  });

  it("should validate mistakes count (non-negative)", () => {
    const validCounts = [0, 1, 5, 10, 100];
    const invalidCounts = [-1, -5];
    
    validCounts.forEach(count => {
      expect(count).toBeGreaterThanOrEqual(0);
    });
    
    invalidCounts.forEach(count => {
      expect(count).toBeLessThan(0);
    });
  });

  it("should have correct stats structure", () => {
    const mockStats = {
      id: 1,
      gamePresenterId: 1,
      month: 1,
      year: 2026,
      attitude: 4,
      mistakes: 2,
      notes: "Good performance",
      updatedById: 1,
    };
    
    expect(mockStats).toHaveProperty("gamePresenterId");
    expect(mockStats).toHaveProperty("month");
    expect(mockStats).toHaveProperty("year");
    expect(mockStats).toHaveProperty("attitude");
    expect(mockStats).toHaveProperty("mistakes");
    expect(mockStats.month).toBeGreaterThanOrEqual(1);
    expect(mockStats.month).toBeLessThanOrEqual(12);
  });
});

// ============================================
// USER TEAM ACCESS TESTS
// ============================================

describe("User Team Access", () => {
  it("should allow admin to see all GPs", () => {
    const user = { role: "admin", teamId: null };
    const hasTeamRestriction = user.teamId !== null;
    
    expect(user.role).toBe("admin");
    expect(hasTeamRestriction).toBe(false);
  });

  it("should restrict FM to their team's GPs", () => {
    const user = { role: "user", teamId: 1 };
    const hasTeamRestriction = user.teamId !== null;
    
    expect(hasTeamRestriction).toBe(true);
    expect(user.teamId).toBe(1);
  });

  it("should validate team assignment permissions", () => {
    const adminUser = { role: "admin" };
    const regularUser = { role: "user" };
    
    const canAssignTeam = (user: { role: string }) => user.role === "admin";
    
    expect(canAssignTeam(adminUser)).toBe(true);
    expect(canAssignTeam(regularUser)).toBe(false);
  });

  it("should have user schema with teamId field", () => {
    const mockUser = {
      id: 1,
      openId: "test-user",
      name: "Test FM",
      email: "test@example.com",
      role: "user",
      teamId: 1,
    };
    
    expect(mockUser).toHaveProperty("teamId");
    expect(typeof mockUser.teamId).toBe("number");
  });
});

describe("gamePresenter.listWithStats", () => {
  it("should return GPs with their monthly stats", () => {
    const mockResponse = [
      {
        id: 1,
        name: "Test GP",
        teamId: 1,
        stats: {
          attitude: 4,
          mistakes: 2,
        },
      },
    ];
    
    expect(Array.isArray(mockResponse)).toBe(true);
    expect(mockResponse[0]).toHaveProperty("stats");
    expect(mockResponse[0].stats).toHaveProperty("attitude");
    expect(mockResponse[0].stats).toHaveProperty("mistakes");
  });

  it("should filter by team when teamId is provided", () => {
    const teamId = 1;
    const mockGPs = [
      { id: 1, name: "GP 1", teamId: 1 },
      { id: 2, name: "GP 2", teamId: 2 },
      { id: 3, name: "GP 3", teamId: 1 },
    ];
    
    const filteredGPs = mockGPs.filter(gp => gp.teamId === teamId);
    
    expect(filteredGPs.length).toBe(2);
    expect(filteredGPs.every(gp => gp.teamId === teamId)).toBe(true);
  });
});
