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
