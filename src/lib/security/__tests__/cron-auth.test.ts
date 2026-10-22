import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCronAuth } from "../cron-auth";

afterEach(() => vi.unstubAllEnvs());
describe("scheduler authorization", () => {
  it("requires a secret even in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRON_SECRET", "");
    expect(verifyCronAuth(new Request("http://localhost/api/sync")).authorized).toBe(false);
  });
  it("accepts only the configured bearer or cron header", () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const accepted: Record<string, string>[] = [{ authorization: "Bearer cron-secret" }, { "x-cron-secret": "cron-secret" }];
    for (const headers of accepted) {
      expect(verifyCronAuth(new Request("https://app/api/sync", { headers })).authorized).toBe(true);
    }
    const rejected: Record<string, string>[] = [{ authorization: "Bearer wrong" }, { origin: "https://app", "sec-fetch-site": "same-origin", host: "app" }];
    for (const headers of rejected) {
      expect(verifyCronAuth(new Request("https://app/api/sync", { headers })).authorized).toBe(false);
    }
  });
});
