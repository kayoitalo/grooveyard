import { after, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api-auth";
import { prisma } from "@/lib/db/prisma";
import { AIAnalysisService } from "@/modules/ai-analysis/application/ai-analysis-service";
import { logAi } from "@/modules/ai-analysis/application/ai-log";
import { ConversationService } from "@/modules/conversation/application/conversation-service";

export const dynamic = "force-dynamic";

/** A renovação agendada roda depois da resposta e pode levar um minuto. */
export const maxDuration = 180;

/**
 * A conversa da tela inicial: leituras de várias janelas, cada uma com a
 * prova que cita. Responde com o que já está escrito; se alguma janela
 * precisa de leitura nova, pede uma — só uma por visita — depois da
 * resposta, como o cron faz.
 */
export async function GET(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  try {
    const user = await prisma.user.findUnique({ where: { id: access.userId }, select: { id: true } });
    if (!user) return NextResponse.json({ moments: [], writing: false, hasHistory: false });

    const { view, refresh } = await new ConversationService().load(user.id);
    if (refresh) {
      after(async () => {
        await new AIAnalysisService()
          .refreshPack(user.id, refresh)
          .catch((error) =>
            logAi("ai.background_failed", { kind: `PACK:${refresh}`, message: String(error).slice(0, 200) }, "error"),
          );
      });
    }
    return NextResponse.json(view);
  } catch (error) {
    logAi("ai.route_failed", { route: "conversation", message: String(error).slice(0, 200) }, "error");
    return NextResponse.json({ error: "Não foi possível montar a conversa." }, { status: 500 });
  }
}
