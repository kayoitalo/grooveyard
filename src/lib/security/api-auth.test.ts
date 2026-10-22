import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), findUser: vi.fn() }));
vi.mock("./session", () => ({ currentSession: mocks.session }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
import { authorizeApi } from "./api-auth";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("AUTH_USER_ID", "owner");
  vi.stubEnv("APP_ORIGIN", "https://app.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("API access", () => {
  it("denies anonymous reads and mutations before accessing user data", async () => {
    mocks.session.mockResolvedValue(null);
    for (const method of ["GET", "POST", "DELETE"]) {
      const result = await authorizeApi(new Request("https://app.test/api/user/data", { method }));
      expect(result.response?.status).toBe(401);
    }
    expect(mocks.findUser).not.toHaveBeenCalled();
  });
  it("binds browser calls to the session and rejects cross-site writes", async () => {
    mocks.session.mockResolvedValue({ userId: "session-owner" });
    expect(await authorizeApi(new Request("https://app.test/api/history"))).toEqual({ userId: "session-owner" });
    expect(await authorizeApi(new Request("https://app.test/api/sync", { method: "POST", headers: { origin: "https://app.test" } }))).toEqual({ userId: "session-owner" });
    const rejected = await authorizeApi(new Request("https://app.test/api/user/data", { method: "DELETE", headers: { origin: "https://attacker.test" } }));
    expect(rejected.response?.status).toBe(403);
  });
  it("allows scheduler credentials only on explicitly opted-in POST routes", async () => {
    mocks.session.mockResolvedValue(null);
    mocks.findUser.mockResolvedValue({ id: "owner" });
    const post = new Request("https://app.test/api/sync", { method: "POST", headers: { authorization: "Bearer cron-secret" } });
    expect(await authorizeApi(post, true)).toEqual({ userId: "owner" });
    expect(mocks.findUser).toHaveBeenCalledWith({ where: { id: "owner" }, select: { id: true } });
    expect((await authorizeApi(post)).response?.status).toBe(401);
    expect((await authorizeApi(new Request(post.url, { headers: post.headers }), true)).response?.status).toBe(401);
  });
  it("fails closed on database or session errors", async () => {
    mocks.session.mockRejectedValue(new Error("database unavailable"));
    expect((await authorizeApi(new Request("https://app.test/api/history"))).response?.status).toBe(503);
  });
});
