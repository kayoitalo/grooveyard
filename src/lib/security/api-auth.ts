import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { currentSession } from "./session";
import { verifyCronAuth } from "./cron-auth";
import { isTrustedMutation } from "./request-origin";

type Access = { userId: string; response?: never } | { userId?: never; response: NextResponse };

/** Called in each route, before payload parsing, database access or provider calls. */
export async function authorizeApi(request: Request, allowCron = false): Promise<Access> {
  try {
    if (allowCron && request.method === "POST" && verifyCronAuth(request).authorized) {
      const id = process.env.AUTH_USER_ID;
      const user = id ? await prisma.user.findUnique({ where: { id }, select: { id: true } }) : null;
      if (user) return { userId: user.id };
      return { response: NextResponse.json({ error: "Conta do agendamento não configurada." }, { status: 503 }) };
    }
    const session = await currentSession();
    if (!session) return { response: NextResponse.json({ error: "Entre para acessar sua conta." }, { status: 401 }) };
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !isTrustedMutation(request)) {
      return { response: NextResponse.json({ error: "Origem não autorizada." }, { status: 403 }) };
    }
    return { userId: session.userId };
  } catch {
    return { response: NextResponse.json({ error: "Não foi possível verificar o acesso." }, { status: 503 }) };
  }
}
