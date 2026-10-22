import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ configured: vi.fn(), create: vi.fn(), verify: vi.fn(), limit: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/security/session", () => ({ authConfigured: mocks.configured, createSession: mocks.create }));
vi.mock("@/lib/security/password", () => ({ verifyPassword: mocks.verify }));
vi.mock("@/lib/security/login-limit", () => ({ consumeLoginAttempt: mocks.limit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
import { POST } from "./route";

const request = (body = '{"password":"secret"}', origin = "https://app.test") => new Request("https://app.test/api/auth/login", {
  method: "POST", headers: { origin, "Content-Type": "application/json" }, body,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_ORIGIN", "https://app.test");
  vi.stubEnv("AUTH_USER_ID", "owner");
  mocks.configured.mockReturnValue(true);
  mocks.limit.mockResolvedValue(true);
  mocks.verify.mockResolvedValue(true);
  mocks.user.mockResolvedValue({ id: "owner" });
});
afterEach(() => vi.unstubAllEnvs());

describe("login route", () => {
  it("creates a session only after checking credentials and the explicit owner", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.user).toHaveBeenCalledWith({ where: { id: "owner" }, select: { id: true } });
    expect(mocks.create).toHaveBeenCalledWith("owner");
  });
  it("blocks invalid passwords, cross-site calls, oversized bodies and exhausted attempts", async () => {
    mocks.verify.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request(undefined, "https://attacker.test"))).status).toBe(403);
    expect((await POST(request("x".repeat(2049)))).status).toBe(413);
    mocks.limit.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("fails closed on missing setup or unavailable database", async () => {
    mocks.configured.mockReturnValue(false);
    expect((await POST(request())).status).toBe(503);
    mocks.configured.mockReturnValue(true);
    mocks.limit.mockRejectedValue(new Error("offline"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
