import { authorizeApi } from "@/lib/security/api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { RecommendationService } from "@/modules/recommendations/application/recommendation-service";
import type { RecommendationMode, RecommendationContext } from "@/modules/recommendations/domain/recommendation.types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const service = new RecommendationService();
    const session = await service.getLatestSession(user.id);

    return NextResponse.json(session || { items: [] });
  } catch (error: any) {
    console.error("GET Recommendations API error:", error);
    return NextResponse.json({ error: error?.message || "Failed to load session" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await request.json();
    const mode = (body.mode as RecommendationMode) || "BALANCED";
    const context = (body.context as RecommendationContext) || "GENERAL";
    const period = body.period || "30d";

    // Os controles chegam como 0..100; o que vier fora disso é ignorado em
    // favor do preset do modo, para uma query malformada não desregular o motor.
    const dials =
      typeof body.proximity === "number" && typeof body.fame === "number"
        ? {
            proximity: Math.min(100, Math.max(0, Math.round(body.proximity))),
            fame: Math.min(100, Math.max(0, Math.round(body.fame))),
          }
        : undefined;

    const service = new RecommendationService();

    // O reuso vive no serviço, que considera janela de tempo e os controles.
    // A checagem que existia aqui devolvia qualquer sessão ativa do mesmo modo,
    // ignorando se a pessoa tinha acabado de mexer nos eixos.
    const session = await service.generateSession({
      userId: user.id,
      mode,
      context,
      period,
      size: 8,
      dials,
    });

    return NextResponse.json(session);
  } catch (error: any) {
    console.error("POST Recommendations API error:", error);
    return NextResponse.json({ error: error?.message || "Failed to generate recommendations" }, { status: 500 });
  }
}
