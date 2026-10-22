import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  jar: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  sessions: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.jar }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { appSession: mocks.sessions } }));
import { createSession, currentSession, deleteSession, SESSION_COOKIE, tokenHash } from "./session";

const credential = `scrypt:${"a".repeat(32)}:${"b".repeat(128)}`;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_USER_ID", "owner");
  vi.stubEnv("AUTH_PASSWORD_HASH", credential);
  mocks.jar.get.mockReturnValue({ value: "a".repeat(64) });
});
afterEach(() => vi.unstubAllEnvs());
const valid = () => ({ userId: "owner", user: { id: "owner" }, credentialVersion: tokenHash(credential), expiresAt: new Date(Date.now() + 60_000) });

describe("database sessions", () => {
  it("rejects missing, malformed and unknown cookies", async () => {
    mocks.jar.get.mockReturnValue(undefined);
    expect(await currentSession()).toBeNull();
    mocks.jar.get.mockReturnValue({ value: "forged" });
    expect(await currentSession()).toBeNull();
    expect(mocks.sessions.findUnique).not.toHaveBeenCalled();
    mocks.jar.get.mockReturnValue({ value: "a".repeat(64) });
    mocks.sessions.findUnique.mockResolvedValue(null);
    expect(await currentSession()).toBeNull();
  });
  it("accepts an unexpired session only for the configured account and credentials", async () => {
    const session = valid();
    mocks.sessions.findUnique.mockResolvedValue(session);
    expect(await currentSession()).toEqual(session);
    mocks.sessions.findUnique.mockResolvedValue({ ...valid(), expiresAt: new Date(0) });
    expect(await currentSession()).toBeNull();
    mocks.sessions.findUnique.mockResolvedValue({ ...valid(), userId: "other" });
    expect(await currentSession()).toBeNull();
    mocks.sessions.findUnique.mockResolvedValue({ ...valid(), credentialVersion: "old-password" });
    expect(await currentSession()).toBeNull();
  });
  it("stores only a digest and uses protected cookies", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createSession("owner");
    const [name, token, options] = mocks.jar.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(mocks.sessions.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tokenHash: tokenHash(token), userId: "owner" }) });
    expect(mocks.sessions.create.mock.calls[0][0].data.tokenHash).not.toBe(token);
  });
  it("revokes the session on logout", async () => {
    await deleteSession();
    expect(mocks.sessions.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: tokenHash("a".repeat(64)) } });
    expect(mocks.jar.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });
});
