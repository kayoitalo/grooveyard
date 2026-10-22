import { authorizeApi } from "@/lib/security/api-auth";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  buildAuthorizeUrl,
  disconnect,
  getConnectionStatus,
  isSpotifyConfigured,
} from "@/modules/spotify/application/spotify-connection";

export const STATE_COOKIE = "spotify_oauth_state";

/** Status da conexão, para a tela de Ajustes saber o que mostrar. */
export async function GET(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ configured: isSpotifyConfigured(), connected: false });
  }
  return NextResponse.json(await getConnectionStatus(user.id));
}

/** Início do fluxo: leva o navegador para a tela de permissão do Spotify. */
export async function POST(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  if (!isSpotifyConfigured()) {
    const status = await getConnectionStatus("");
    return NextResponse.json({ error: status.reason }, { status: 400 });
  }

  // o state amarra o callback a este navegador e barra CSRF
  const state = crypto.randomBytes(24).toString("base64url");
  const response = NextResponse.json({ authorizeUrl: buildAuthorizeUrl(state) });

  response.cookies.set(STATE_COOKIE, `${userId}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return response;
}

export async function DELETE(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) await disconnect(user.id);
  return NextResponse.json({ success: true });
}
