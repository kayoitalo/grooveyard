import { beforeEach, describe, expect, it, vi } from "vitest";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock("./api-auth", () => ({ authorizeApi: mocks.authorize }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const routes = import.meta.glob("../../app/api/**/route.ts");
beforeEach(() => vi.clearAllMocks());

describe("every private API entry point", () => {
  for (const [name, load] of Object.entries(routes)) {
    if (name.includes("/auth/")) continue;
    it(`blocks anonymous calls before accessing data: ${name}`, async () => {
      const route = await load() as Record<string, (request: Request, context?: unknown) => Promise<Response>>;
      const blocked = new Response("unauthorized", { status: 401 });
      mocks.authorize.mockResolvedValue({ response: blocked });
      for (const method of ["GET", "POST", "PUT", "DELETE"]) {
        if (!route[method]) continue;
        const result = await route[method](new Request("https://app.test/api/test", { method }), { params: Promise.resolve({ sessionId: "session" }) });
        expect(result).toBe(blocked);
      }
    });
  }
});
