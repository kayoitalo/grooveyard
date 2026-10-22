import { authorizeApi } from "@/lib/security/api-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ADDRESS_STYLES } from "@/modules/ai-analysis/domain/ai-analysis.types";

export const dynamic = "force-dynamic";

const updateSchema = z.object({ addressAs: z.enum(ADDRESS_STYLES) });

/** As preferências de conversa: por enquanto, como os textos tratam a pessoa. */
export async function GET(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { addressAs: true } });
  return NextResponse.json({ addressAs: user?.addressAs ?? "neutro" });
}

export async function PUT(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Tratamento inválido." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Nenhum usuário encontrado." }, { status: 404 });

  await prisma.user.update({ where: { id: user.id }, data: { addressAs: parsed.data.addressAs } });
  return NextResponse.json({ addressAs: parsed.data.addressAs });
}
