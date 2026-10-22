import { authorizeApi } from "@/lib/security/api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { SpotifyService } from "@/modules/spotify/application/spotify-service";
import { getValidAccessToken, markNeedsReauth } from "@/modules/spotify/application/spotify-connection";
import { isSpotifyAuthError } from "@/modules/spotify/domain/spotify-errors";

const spotifyService = new SpotifyService();

export async function POST(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  try {
    const body = await request.json();
    const { tracks, customTitle } = body || {};

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json(
        { success: false, error: "Envie ao menos uma faixa para exportar." },
        { status: 400 }
      );
    }

    // O token vem da conexão guardada, nunca do cliente: um token de acesso
    // trafegando pelo corpo do POST é credencial exposta à toa.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const connection = user ? await getValidAccessToken(user.id) : null;

    const exportResult = await spotifyService.exportTracks(
      tracks,
      connection?.accessToken,
      connection?.spotifyUserId,
      customTitle
    );

    return NextResponse.json({ success: true, data: exportResult });
  } catch (error) {
    if (isSpotifyAuthError(error)) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) await markNeedsReauth(user.id);
      return NextResponse.json(
        {
          success: false,
          error: "O Spotify recusou a autorização. Reconecte sua conta em Ajustes e tente de novo.",
        },
        { status: 409 }
      );
    }

    console.error("POST /api/spotify/export error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Não foi possível exportar.",
      },
      { status: 500 }
    );
  }
}
