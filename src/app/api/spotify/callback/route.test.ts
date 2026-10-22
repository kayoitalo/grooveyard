import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), cookie: vi.fn(), user: vi.fn(), connect: vi.fn() }));
vi.mock("@/lib/security/api-auth", () => ({ authorizeApi: mocks.auth }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock("@/modules/spotify/application/spotify-connection", () => ({ completeConnection: mocks.connect }));
vi.mock("../connect/route", () => ({ STATE_COOKIE: "spotify_oauth_state" }));
import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "owner" });
  mocks.user.mockResolvedValue({ id: "owner" });
});
describe("Spotify OAuth owner binding", () => {
  it("accepts the state after the cookie serializer round trip", async () => {
    const response = new NextResponse();
    response.cookies.set("spotify_oauth_state", "owner:random-state");
    const cookieHeader = response.headers.get("set-cookie")!.split(";")[0];
    const request = new NextRequest("https://app.test/api/spotify/callback?state=random-state&code=code", { headers: { cookie: cookieHeader } });
    mocks.cookie.mockImplementation((name) => request.cookies.get(name));
    const result = await GET(request);
    expect(mocks.connect).toHaveBeenCalledWith("owner", "code");
    expect(result.headers.get("location")).toContain("spotify=conectado");
  });
  it("rejects a state from another owner without exchanging credentials", async () => {
    mocks.cookie.mockReturnValue({ value: "other:random-state" });
    const response = await GET(new Request("https://app.test/api/spotify/callback?state=random-state&code=code"));
    expect(response.headers.get("location")).toContain("estado-invalido");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
