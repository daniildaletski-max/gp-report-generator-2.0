import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getUserById: vi.fn(),
}));

import * as db from "./db";
import { resolveReportRecipient } from "./routers/_shared";

const adminCtx = { user: { id: 1, role: "admin", email: "admin@example.com", name: "Admin" } };

describe("resolveReportRecipient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes to the team's Floor Manager when admin generates for someone else's team", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({
      id: 7,
      role: "user",
      email: "fm-alice@example.com",
      name: "Alice",
    } as any);

    const recipient = await resolveReportRecipient(adminCtx, { userId: 7 });

    expect(recipient.fallbackToCaller).toBe(false);
    expect(recipient.user.email).toBe("fm-alice@example.com");
    expect(recipient.user.id).toBe(7);
  });

  it("falls back to the caller when the team has no FM linked", async () => {
    const recipient = await resolveReportRecipient(adminCtx, { userId: null });

    expect(recipient.fallbackToCaller).toBe(false); // owner === caller branch
    expect(recipient.user.email).toBe("admin@example.com");
    expect(db.getUserById).not.toHaveBeenCalled();
  });

  it("falls back to the caller when the linked FM has no email on file", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({
      id: 9,
      role: "user",
      email: null,
      name: "No-Email FM",
    } as any);

    const recipient = await resolveReportRecipient(adminCtx, { userId: 9 });

    expect(recipient.fallbackToCaller).toBe(true);
    expect(recipient.user.email).toBe("admin@example.com");
  });

  it("uses the caller directly when caller is the team's own FM (no DB lookup)", async () => {
    const fmCtx = { user: { id: 7, role: "user", email: "fm-alice@example.com", name: "Alice" } };

    const recipient = await resolveReportRecipient(fmCtx, { userId: 7 });

    expect(recipient.fallbackToCaller).toBe(false);
    expect(recipient.user.email).toBe("fm-alice@example.com");
    expect(db.getUserById).not.toHaveBeenCalled();
  });
});
