import { beforeEach, describe, expect, it, vi } from "vitest";
const counters = vi.hoisted(() => ({ deleteMany: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { authRateLimit: counters } }));
import { consumeLoginAttempt, LOGIN_ATTEMPTS, LOGIN_WINDOW_MS } from "./login-limit";

beforeEach(() => vi.resetAllMocks());
describe("persistent login limits", () => {
  it("rejects attempts beyond the shared window limit", async () => {
    counters.upsert.mockResolvedValue({ attempts: LOGIN_ATTEMPTS });
    expect(await consumeLoginAttempt(2 * LOGIN_WINDOW_MS)).toBe(true);
    counters.upsert.mockResolvedValue({ attempts: LOGIN_ATTEMPTS + 1 });
    expect(await consumeLoginAttempt(2 * LOGIN_WINDOW_MS)).toBe(false);
    expect(counters.upsert).toHaveBeenCalledWith({
      where: { key: "login:2" }, create: { key: "login:2", expiresAt: new Date(3 * LOGIN_WINDOW_MS) },
      update: { attempts: { increment: 1 } },
    });
  });
});
