import { afterEach, describe, expect, it, vi } from "vitest";
import { privateFetch } from "./private-fetch";

afterEach(() => vi.unstubAllGlobals());

describe("authenticated frontend requests", () => {
  it("redirects an expired session to login instead of reporting a provider failure", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(privateFetch("/api/history")).rejects.toThrow("Sua sessão terminou");
    expect(assign).toHaveBeenCalledWith("/login?expired=1");
  });
  it("leaves provider errors and successful responses for the calling screen to handle", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    const response = new Response(null, { status: 503 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await privateFetch("/api/history")).toBe(response);
    expect(assign).not.toHaveBeenCalled();
  });
});
