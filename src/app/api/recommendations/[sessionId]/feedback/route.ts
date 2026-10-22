import { authorizeApi } from "@/lib/security/api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { RecommendationService } from "@/modules/recommendations/application/recommendation-service";
import type { FeedbackType } from "@/modules/recommendations/domain/recommendation.types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  try {
    const { sessionId } = await params;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await request.json();
    const itemId = body.itemId;
    const type = body.type as FeedbackType;
    const note = body.note;

    if (!itemId || !type) {
      return NextResponse.json({ error: "Missing itemId or type" }, { status: 400 });
    }

    const service = new RecommendationService();
    const allowed = ["LIKED", "DISLIKED", "ALREADY_KNOW", "NOT_INTERESTED", "SAVE_FOR_LATER"];
    if (!allowed.includes(type) || (note !== undefined && typeof note !== "string")) {
      return NextResponse.json({ error: "Feedback inválido" }, { status: 400 });
    }
    await service.submitFeedback(user.id, itemId, type, note, sessionId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST Feedback API error:", error);
    return NextResponse.json({ error: error?.message || "Failed to submit feedback" }, { status: 500 });
  }
}
