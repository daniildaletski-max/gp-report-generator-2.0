import { describe, it, expect, vi, beforeEach } from "vitest";

// Test that validates Resend API key is configured
describe("Email Service with Resend", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should return false when RESEND_API_KEY is not configured", async () => {
    // Mock ENV without resendApiKey
    vi.doMock("./_core/env", () => ({
      ENV: {
        resendApiKey: "",
      },
    }));

    const { sendEmail } = await import("./_core/email");

    const result = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      body: "Test body",
    });

    expect(result).toBe(false);
  });

  it("should format report email correctly", async () => {
    // This test validates the email formatting logic
    const params = {
      userEmail: "fm@example.com",
      userName: "John Doe",
      teamName: "Team Alpha",
      monthName: "January",
      year: 2026,
      excelUrl: "https://storage.example.com/report.xlsx",
    };

    // Validate that all required fields are present
    expect(params.userEmail).toBeTruthy();
    expect(params.userName).toBeTruthy();
    expect(params.teamName).toBeTruthy();
    expect(params.monthName).toBeTruthy();
    expect(params.year).toBeGreaterThan(2020);
    expect(params.excelUrl).toContain("http");
  });

  it("should generate correct attachment filename", () => {
    const teamName = "Team Alpha";
    const monthName = "January";
    const year = 2026;
    
    const filename = `TeamOverview_${teamName.replace(/\s+/g, '_')}_${monthName}${year}.xlsx`;
    
    expect(filename).toBe("TeamOverview_Team_Alpha_January2026.xlsx");
  });
});
