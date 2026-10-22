import { timingSafeEqual } from "node:crypto";

export interface CronAuthResult { authorized: boolean; error?: string }

/** Scheduler credentials never authorize other routes or depend on browser headers. */
export function verifyCronAuth(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : request.headers.get("x-cron-secret");
  if (secret && supplied) {
    const expected = Buffer.from(secret);
    const actual = Buffer.from(supplied);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return { authorized: true };
  }
  return { authorized: false, error: "Unauthorized: Invalid or missing CRON_SECRET header." };
}
