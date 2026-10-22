import { afterEach, describe, expect, it, vi } from "vitest";
import { isTrustedMutation } from "./request-origin";

afterEach(() => vi.unstubAllEnvs());
const request = (origin?: string, site = "same-origin") => new Request("https://grooveyard.app/api/sync", {
  method: "POST", headers: { ...(origin ? { origin } : {}), "sec-fetch-site": site },
});

describe("mutation origin", () => {
  it("requires the configured HTTPS origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://grooveyard.app");
    expect(isTrustedMutation(request("https://grooveyard.app"))).toBe(true);
    expect(isTrustedMutation(request("https://attacker.app"))).toBe(false);
    expect(isTrustedMutation(request())).toBe(false);
    expect(isTrustedMutation(request("https://grooveyard.app", "cross-site"))).toBe(false);
  });
  it("fails closed when production configuration is missing or insecure", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "");
    expect(isTrustedMutation(request("https://grooveyard.app"))).toBe(false);
    vi.stubEnv("APP_ORIGIN", "http://grooveyard.app");
    expect(isTrustedMutation(request("http://grooveyard.app"))).toBe(false);
  });
  it("allows the current development origin without trusting forwarded headers", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_ORIGIN", "");
    expect(isTrustedMutation(request("https://grooveyard.app"))).toBe(true);
    expect(isTrustedMutation(new Request("http://localhost:3000/api/sync", { method: "POST", headers: {
      origin: "https://attacker.app", "x-forwarded-host": "attacker.app",
    } }))).toBe(false);
  });
});
