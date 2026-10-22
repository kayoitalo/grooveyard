import { authorizeApi } from "@/lib/security/api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { AIAnalysisService } from "@/modules/ai-analysis/application/ai-analysis-service";
import { logAi } from "@/modules/ai-analysis/application/ai-log";
import { SCREEN_KEYS, type ScreenKey } from "@/modules/ai-analysis/domain/ai-analysis.types";
import type { PeriodKey } from "@/modules/statistics/application/overview-service";

export const dynamic = "force-dynamic";

const PERIODS: PeriodKey[] = ["7d", "30d", "1y", "all"];

/**
 * As frases de uma tela, lidas dos pacotes prontos. Nunca gera nada: quem
 * gera é a Visão geral (na primeira visita) e o cron.
 */
export async function GET(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  const params = new URL(request.url).searchParams;
  const screen = params.get("screen");
  const period = params.get("period");

  if (screen && !SCREEN_KEYS.includes(screen as ScreenKey)) {
    return NextResponse.json({ error: "Tela inválida" }, { status: 400 });
  }
  if (period && !PERIODS.includes(period as PeriodKey)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ lines: [], source: "fallback" });

    const service = new AIAnalysisService();
    return NextResponse.json(
      await service.getScreenLines(user.id, (screen as ScreenKey) ?? undefined, (period as PeriodKey) ?? undefined),
    );
  } catch (error) {
    logAi("ai.route_failed", { route: "lines", screen, period, message: String(error).slice(0, 200) }, "error");
    return NextResponse.json({ error: "Não foi possível ler as frases." }, { status: 500 });
  }
}
