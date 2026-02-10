import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { systemRouter } from "./systemRouter";

const createCaller = (role: "admin" | "user" | null = null) =>
  systemRouter.createCaller({
    req: {} as any,
    res: {} as any,
    user:
      role === null
        ? null
        : ({
            id: 1,
            name: "Test User",
            email: "test@example.com",
            role,
            teamId: null,
            passwordHash: null,
            passwordSalt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            resetToken: null,
            resetTokenExpiry: null,
          } as any),
  });

describe("systemRouter.health", () => {
  it("returns runtime metadata without client timestamp", async () => {
    const caller = createCaller();
    const response = await caller.health({});

    expect(response.ok).toBe(true);
    expect(response.timestamp).toBeGreaterThan(0);
    expect(response.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(response.environment).toBeTypeOf("string");
    expect(response.version).toBeTypeOf("string");
    expect(response.clientLatencyMs).toBeNull();
  });

  it("calculates client latency when timestamp is provided", async () => {
    const caller = createCaller();
    const timestamp = Date.now() - 25;

    const response = await caller.health({ timestamp });
    expect(response.clientLatencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("systemRouter.notifyOwner", () => {
  it("requires admin role", async () => {
    const caller = createCaller("user");

    await expect(
      caller.notifyOwner({ title: "Need review", content: "Please check." })
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: "FORBIDDEN",
    });
  });
});
