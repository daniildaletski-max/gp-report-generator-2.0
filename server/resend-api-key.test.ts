import { describe, it, expect } from "vitest";
import { Resend } from "resend";

describe("Resend API Key Validation", () => {
  it("should have valid RESEND_API_KEY configured", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    
    // Check if API key is set
    expect(apiKey).toBeTruthy();
    expect(apiKey?.startsWith("re_")).toBe(true);
    
    // Validate API key by making a lightweight API call
    const resend = new Resend(apiKey);
    
    // Use domains.list() as a validation call
    const { data, error } = await resend.domains.list();
    
    // A "restricted_api_key" error means the key is valid but only for sending emails
    // This is actually the correct configuration for our use case
    if (error) {
      if (error.name === "restricted_api_key") {
        console.log("[Resend] API key is valid (restricted to sending emails only - this is correct)");
        return; // Test passes - key is valid for sending
      }
      throw new Error(`Invalid RESEND_API_KEY: ${error.message}`);
    }
    
    console.log("[Resend] API key is valid. Domains found:", data?.data?.length || 0);
  });
});
