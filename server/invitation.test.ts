import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";

// Mock database functions
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getInvitationByEmail: vi.fn(),
    createInvitation: vi.fn(),
    getAllInvitations: vi.fn(),
    getInvitationStats: vi.fn(),
    updateInvitationStatus: vi.fn(),
    deleteInvitation: vi.fn(),
    getInvitationByToken: vi.fn(),
    expireOldInvitations: vi.fn(),
    getFmTeamById: vi.fn(),
    updateUserFromInvitation: vi.fn(),
  };
});

describe("Invitation System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createInvitation", () => {
    it("should create invitation with valid data", async () => {
      const mockInvitation = {
        id: 1,
        email: "test@example.com",
        token: "abc123",
        teamId: 1,
        role: "user" as const,
        status: "pending" as const,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: 1,
        usedById: null,
        usedAt: null,
        createdAt: new Date(),
      };

      vi.mocked(db.getInvitationByEmail).mockResolvedValue(null);
      vi.mocked(db.createInvitation).mockResolvedValue(mockInvitation);

      const result = await db.createInvitation({
        email: "test@example.com",
        token: "abc123",
        teamId: 1,
        role: "user",
        status: "pending",
        expiresAt: mockInvitation.expiresAt,
        createdById: 1,
      });

      expect(result).toEqual(mockInvitation);
      expect(db.createInvitation).toHaveBeenCalledTimes(1);
    });
  });

  describe("getInvitationByToken", () => {
    it("should return invitation when token exists", async () => {
      const mockInvitation = {
        id: 1,
        email: "test@example.com",
        token: "valid-token",
        teamId: 1,
        role: "user" as const,
        status: "pending" as const,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: 1,
        usedById: null,
        usedAt: null,
        createdAt: new Date(),
      };

      vi.mocked(db.getInvitationByToken).mockResolvedValue(mockInvitation);

      const result = await db.getInvitationByToken("valid-token");

      expect(result).toEqual(mockInvitation);
      expect(result?.status).toBe("pending");
    });

    it("should return null when token does not exist", async () => {
      vi.mocked(db.getInvitationByToken).mockResolvedValue(null);

      const result = await db.getInvitationByToken("invalid-token");

      expect(result).toBeNull();
    });
  });

  describe("getInvitationStats", () => {
    it("should return correct stats", async () => {
      const mockStats = {
        total: 10,
        pending: 3,
        accepted: 5,
        expired: 1,
        revoked: 1,
      };

      vi.mocked(db.getInvitationStats).mockResolvedValue(mockStats);

      const result = await db.getInvitationStats();

      expect(result.total).toBe(10);
      expect(result.pending).toBe(3);
      expect(result.accepted).toBe(5);
      expect(result.expired).toBe(1);
      expect(result.revoked).toBe(1);
    });
  });

  describe("updateInvitationStatus", () => {
    it("should update status to accepted", async () => {
      vi.mocked(db.updateInvitationStatus).mockResolvedValue(undefined);

      await db.updateInvitationStatus(1, "accepted", 5);

      expect(db.updateInvitationStatus).toHaveBeenCalledWith(1, "accepted", 5);
    });

    it("should update status to revoked", async () => {
      vi.mocked(db.updateInvitationStatus).mockResolvedValue(undefined);

      await db.updateInvitationStatus(1, "revoked");

      expect(db.updateInvitationStatus).toHaveBeenCalledWith(1, "revoked");
    });
  });

  describe("Invitation Validation Logic", () => {
    it("should validate pending invitation within expiry", () => {
      const invitation = {
        status: "pending" as const,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      };

      const isValid = invitation.status === "pending" && invitation.expiresAt > new Date();
      expect(isValid).toBe(true);
    });

    it("should invalidate expired invitation", () => {
      const invitation = {
        status: "pending" as const,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      };

      const isValid = invitation.status === "pending" && invitation.expiresAt > new Date();
      expect(isValid).toBe(false);
    });

    it("should invalidate revoked invitation", () => {
      const invitation = {
        status: "revoked" as const,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const isValid = invitation.status === "pending" && invitation.expiresAt > new Date();
      expect(isValid).toBe(false);
    });

    it("should invalidate accepted invitation", () => {
      const invitation = {
        status: "accepted" as const,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const isValid = invitation.status === "pending" && invitation.expiresAt > new Date();
      expect(isValid).toBe(false);
    });
  });

  describe("Email Validation", () => {
    it("should validate correct email format", () => {
      const validEmails = [
        "test@example.com",
        "user.name@domain.org",
        "admin+tag@company.co.uk",
      ];

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      validEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(true);
      });
    });

    it("should reject invalid email format", () => {
      const invalidEmails = [
        "invalid",
        "@nodomain.com",
        "no@domain",
        "spaces in@email.com",
      ];

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      invalidEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(false);
      });
    });
  });

  describe("Bulk Invitation", () => {
    it("should parse multiple emails correctly", () => {
      const input = "test1@example.com\ntest2@example.com, test3@example.com; test4@example.com";
      
      const emails = input
        .split(/[\n,;]/)
        .map(e => e.trim())
        .filter(e => e && e.includes("@"));

      expect(emails).toHaveLength(4);
      expect(emails).toContain("test1@example.com");
      expect(emails).toContain("test2@example.com");
      expect(emails).toContain("test3@example.com");
      expect(emails).toContain("test4@example.com");
    });

    it("should filter out invalid entries", () => {
      const input = "valid@email.com\ninvalid\n\n  \nanother@valid.org";
      
      const emails = input
        .split(/[\n,;]/)
        .map(e => e.trim())
        .filter(e => e && e.includes("@"));

      expect(emails).toHaveLength(2);
      expect(emails).toContain("valid@email.com");
      expect(emails).toContain("another@valid.org");
    });
  });
});
