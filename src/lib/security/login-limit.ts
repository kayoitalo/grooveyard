import { prisma } from "@/lib/db/prisma";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_ATTEMPTS = 10;

/** A global personal-account limit cannot be evaded by spoofing a forwarded IP. */
export async function consumeLoginAttempt(now = Date.now()): Promise<boolean> {
  const window = Math.floor(now / LOGIN_WINDOW_MS);
  const expiresAt = new Date((window + 1) * LOGIN_WINDOW_MS);
  await prisma.authRateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  const counter = await prisma.authRateLimit.upsert({
    where: { key: `login:${window}` },
    create: { key: `login:${window}`, expiresAt },
    update: { attempts: { increment: 1 } },
  });
  return counter.attempts <= LOGIN_ATTEMPTS;
}
