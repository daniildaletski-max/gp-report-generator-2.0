import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ENV module
vi.mock("./_core/env", () => ({
  ENV: {
    forgeApiUrl: "https://api.test.com",
    forgeApiKey: "test-api-key",
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Email Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendEmail", () => {
    it("should send email successfully when API returns 200", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      // Import after mocking
      const { sendEmail } = await import("./_core/email");

      const result = await sendEmail({
        to: "test@example.com",
        subject: "Test Subject",
        body: "Test Body",
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/webdevtoken.v1.WebDevService/SendEmail",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            authorization: "Bearer test-api-key",
            "content-type": "application/json",
          }),
        })
      );
    });

    it("should return false when API returns error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Server error"),
      });

      const { sendEmail } = await import("./_core/email");

      const result = await sendEmail({
        to: "test@example.com",
        subject: "Test Subject",
        body: "Test Body",
      });

      expect(result).toBe(false);
    });

    it("should return false when fetch throws error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const { sendEmail } = await import("./_core/email");

      const result = await sendEmail({
        to: "test@example.com",
        subject: "Test Subject",
        body: "Test Body",
      });

      expect(result).toBe(false);
    });

    it("should include attachment info when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const { sendEmail } = await import("./_core/email");

      await sendEmail({
        to: "test@example.com",
        subject: "Test Subject",
        body: "Test Body",
        attachmentUrl: "https://example.com/file.xlsx",
        attachmentName: "report.xlsx",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("attachment_url"),
        })
      );
    });
  });

  describe("sendReportEmail", () => {
    it("should format report email correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const { sendReportEmail } = await import("./_core/email");

      const result = await sendReportEmail({
        userEmail: "fm@example.com",
        userName: "John Doe",
        teamName: "Team Alpha",
        monthName: "January",
        year: 2026,
        excelUrl: "https://storage.example.com/report.xlsx",
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("Team Alpha"),
        })
      );
    });

    it("should include download link in email body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const { sendReportEmail } = await import("./_core/email");

      await sendReportEmail({
        userEmail: "fm@example.com",
        userName: "John Doe",
        teamName: "Team Alpha",
        monthName: "January",
        year: 2026,
        excelUrl: "https://storage.example.com/report.xlsx",
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.body).toContain("https://storage.example.com/report.xlsx");
    });
  });
});
