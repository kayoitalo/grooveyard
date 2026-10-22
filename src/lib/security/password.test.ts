import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password verification", () => {
  it("uses a distinct salt and accepts only the original password", async () => {
    const first = await hashPassword("minha senha longa");
    const second = await hashPassword("minha senha longa");
    expect(first).not.toBe(second);
    expect(await verifyPassword("minha senha longa", first)).toBe(true);
    expect(await verifyPassword("outra senha", first)).toBe(false);
  });
  it("rejects malformed hashes and oversized input", async () => {
    expect(await verifyPassword("secret", "scrypt:bad:key")).toBe(false);
    expect(await verifyPassword("x".repeat(257), await hashPassword("secret"))).toBe(false);
  });
});
