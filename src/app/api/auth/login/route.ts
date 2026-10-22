import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authConfigured, createSession } from "@/lib/security/session";
import { verifyPassword } from "@/lib/security/password";
import { isTrustedMutation } from "@/lib/security/request-origin";
import { consumeLoginAttempt } from "@/lib/security/login-limit";

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!authConfigured()) return NextResponse.json({ error: "O acesso ainda precisa ser configurado pelo proprietário." }, { status: 503 });
  try {
    if (!await consumeLoginAttempt()) return NextResponse.json({ error: "Muitas tentativas. Aguarde até 15 minutos." }, { status: 429, headers: { "Retry-After": "900" } });
    const reader = request.body?.getReader();
    let body = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 2048) { await reader.cancel(); return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 }); }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    }
    const payload = JSON.parse(body || "null");
    if (typeof payload?.password !== "string" || !await verifyPassword(payload.password, process.env.AUTH_PASSWORD_HASH!)) {
      return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { id: process.env.AUTH_USER_ID! }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Conta de acesso não configurada." }, { status: 503 });
    await createSession(user.id);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
    return NextResponse.json({ error: "Não foi possível entrar. Tente novamente." }, { status: 503 });
  }
}
