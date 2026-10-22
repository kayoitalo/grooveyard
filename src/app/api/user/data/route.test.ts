import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), findUser: vi.fn(), events: vi.fn(), runs: vi.fn(), connections: vi.fn(),
}));
vi.mock("@/lib/security/api-auth", () => ({ authorizeApi: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  user: { findUnique: mocks.findUser }, listeningEvent: { deleteMany: mocks.events },
  syncRun: { deleteMany: mocks.runs }, providerConnection: { deleteMany: mocks.connections },
} }));
import { DELETE, GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "authenticated-owner" });
  mocks.findUser.mockResolvedValue({ id: "authenticated-owner", email: "owner@test", connections: [], listeningEvents: [] });
  mocks.events.mockResolvedValue({ count: 1 });
});

describe("personal data ownership", () => {
  it("exports only the authenticated account and prevents response caching", async () => {
    const response = await GET(new Request("https://app.test/api/user/data"));
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "authenticated-owner" } }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("limits history, sync-run and connection deletion to the authenticated account", async () => {
    await DELETE(new Request("https://app.test/api/user/data", { method: "DELETE" }));
    expect(mocks.events).toHaveBeenCalledWith({ where: { userId: "authenticated-owner" } });
    expect(mocks.runs).toHaveBeenCalledWith({ where: { connection: { userId: "authenticated-owner" } } });
    expect(mocks.connections).toHaveBeenCalledWith({ where: { userId: "authenticated-owner" } });
  });
});
