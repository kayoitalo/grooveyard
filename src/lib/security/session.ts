import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

export const SESSION_COOKIE = "grooveyard_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function authConfigured(): boolean {
  return Boolean(process.env.AUTH_USER_ID && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(process.env.AUTH_PASSWORD_HASH ?? ""));
}

export async function currentSession() {
  if (!authConfigured()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.appSession.findUnique({
    where: { tokenHash: tokenHash(token) }, include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() ||
    session.userId !== process.env.AUTH_USER_ID ||
    session.credentialVersion !== tokenHash(process.env.AUTH_PASSWORD_HASH!)) return null;
  return session;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await prisma.appSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.appSession.create({ data: {
    tokenHash: tokenHash(token), userId,
    credentialVersion: tokenHash(process.env.AUTH_PASSWORD_HASH!),
    expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
  } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: SESSION_SECONDS,
  });
}

export async function deleteSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.appSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
  jar.delete(SESSION_COOKIE);
}
