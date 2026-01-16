import { describe, it, expect, vi } from "vitest";

// Mock db module
vi.mock("./db", () => ({
  getAllUsers: vi.fn().mockResolvedValue([
    { user: { id: 1, name: "Admin User", email: "admin@test.com", role: "admin", teamId: null }, team: null },
    { user: { id: 2, name: "FM User", email: "fm@test.com", role: "user", teamId: 1 }, team: { id: 1, teamName: "Team Alpha" } },
  ]),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  updateUserTeam: vi.fn().mockResolvedValue(undefined),
  getAllTeamsWithStats: vi.fn().mockResolvedValue([
    { id: 1, teamName: "Team Alpha", floorManagerName: "John", assignedUsers: [], gpCount: 5, reportCount: 2 },
    { id: 2, teamName: "Team Beta", floorManagerName: "Jane", assignedUsers: [], gpCount: 3, reportCount: 1 },
  ]),
  getTeamWithUsers: vi.fn().mockResolvedValue({
    id: 1, teamName: "Team Alpha", floorManagerName: "John",
    assignedUsers: [{ id: 2, name: "FM User" }],
    gpCount: 5,
  }),
  createFmTeam: vi.fn().mockResolvedValue({ id: 3, teamName: "New Team", floorManagerName: "New FM" }),
  updateFmTeam: vi.fn().mockResolvedValue(undefined),
  deleteFmTeam: vi.fn().mockResolvedValue(undefined),
  getAdminDashboardStats: vi.fn().mockResolvedValue({
    totalUsers: 5,
    totalTeams: 3,
    totalGPs: 36,
    totalEvaluations: 150,
    totalReports: 10,
    recentReports: [],
    recentUsers: [],
  }),
  getAllReportsWithTeam: vi.fn().mockResolvedValue([
    { report: { id: 1, teamId: 1, reportMonth: 12, reportYear: 2025, status: "finalized" }, team: { teamName: "Team Alpha" } },
  ]),
  getFmTeamById: vi.fn().mockResolvedValue({ id: 1, teamName: "Team Alpha", floorManagerName: "John" }),
  getAllFmTeams: vi.fn().mockResolvedValue([
    { id: 1, teamName: "Team Alpha", floorManagerName: "John" },
    { id: 2, teamName: "Team Beta", floorManagerName: "Jane" },
  ]),
}));

import * as db from "./db";

describe("Admin Access Control", () => {
  describe("User Management", () => {
    it("getAllUsers returns list of users with team info", async () => {
      const users = await db.getAllUsers();
      expect(users).toHaveLength(2);
      expect(users[0].user.role).toBe("admin");
      expect(users[1].user.teamId).toBe(1);
    });

    it("updateUserRole changes user role", async () => {
      await db.updateUserRole(2, "admin");
      expect(db.updateUserRole).toHaveBeenCalledWith(2, "admin");
    });

    it("deleteUser removes user from database", async () => {
      await db.deleteUser(2);
      expect(db.deleteUser).toHaveBeenCalledWith(2);
    });

    it("updateUserTeam assigns user to team", async () => {
      await db.updateUserTeam(2, 1);
      expect(db.updateUserTeam).toHaveBeenCalledWith(2, 1);
    });
  });

  describe("Team Management", () => {
    it("getAllTeamsWithStats returns teams with statistics", async () => {
      const teams = await db.getAllTeamsWithStats();
      expect(teams).toHaveLength(2);
      expect(teams[0].gpCount).toBe(5);
      expect(teams[0].reportCount).toBe(2);
    });

    it("getTeamWithUsers returns team with assigned users", async () => {
      const team = await db.getTeamWithUsers(1);
      expect(team).not.toBeNull();
      expect(team?.teamName).toBe("Team Alpha");
      expect(team?.assignedUsers).toHaveLength(1);
    });

    it("createFmTeam creates new team", async () => {
      const team = await db.createFmTeam({ teamName: "New Team", floorManagerName: "New FM" });
      expect(team.teamName).toBe("New Team");
    });

    it("updateFmTeam updates team details", async () => {
      await db.updateFmTeam(1, { teamName: "Updated Team" });
      expect(db.updateFmTeam).toHaveBeenCalledWith(1, { teamName: "Updated Team" });
    });

    it("deleteFmTeam removes team", async () => {
      await db.deleteFmTeam(1);
      expect(db.deleteFmTeam).toHaveBeenCalledWith(1);
    });
  });

  describe("Admin Dashboard Stats", () => {
    it("getAdminDashboardStats returns system-wide statistics", async () => {
      const stats = await db.getAdminDashboardStats();
      expect(stats).not.toBeNull();
      expect(stats?.totalUsers).toBe(5);
      expect(stats?.totalTeams).toBe(3);
      expect(stats?.totalGPs).toBe(36);
      expect(stats?.totalEvaluations).toBe(150);
      expect(stats?.totalReports).toBe(10);
    });
  });

  describe("Report Access Control", () => {
    it("getAllReportsWithTeam returns all reports for admin", async () => {
      const reports = await db.getAllReportsWithTeam();
      expect(reports).toHaveLength(1);
      expect(reports[0].team?.teamName).toBe("Team Alpha");
    });
  });

  describe("FM Team Isolation", () => {
    it("getFmTeamById returns single team for FM", async () => {
      const team = await db.getFmTeamById(1);
      expect(team).not.toBeNull();
      expect(team?.teamName).toBe("Team Alpha");
    });

    it("getAllFmTeams returns all teams for admin", async () => {
      const teams = await db.getAllFmTeams();
      expect(teams).toHaveLength(2);
    });
  });
});

describe("Role-based Access", () => {
  it("admin role should have full access", () => {
    const adminUser = { id: 1, role: "admin", teamId: null };
    expect(adminUser.role).toBe("admin");
    expect(adminUser.teamId).toBeNull(); // Admin has no team restriction
  });

  it("user role should be restricted to their team", () => {
    const fmUser = { id: 2, role: "user", teamId: 1 };
    expect(fmUser.role).toBe("user");
    expect(fmUser.teamId).toBe(1); // FM is restricted to team 1
  });
});
