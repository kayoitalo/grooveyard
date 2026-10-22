import { authorizeApi } from "@/lib/security/api-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * Em que horas do dia a agulha desce. É calculado no banco, sobre o
 * mesmo filtro da listagem, e no fuso do usuário — em UTC a madrugada
 * de quem ouve à noite apareceria no lugar errado.
 */
async function hourHistogram(userId: string, timezone: string, search: string): Promise<number[]> {
  const term = `%${search.trim()}%`;
  const filter = search.trim()
    ? Prisma.sql`AND ("rawArtistName" ILIKE ${term} OR "rawTrackName" ILIKE ${term} OR "rawAlbumName" ILIKE ${term})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ hour: number; plays: number }>>`
    SELECT EXTRACT(HOUR FROM "playedAt" AT TIME ZONE ${timezone})::int AS hour,
           COUNT(*)::int AS plays
    FROM "ListeningEvent"
    WHERE "userId" = ${userId} ${filter}
    GROUP BY 1
  `;

  const buckets = Array.from({ length: 24 }, () => 0);
  for (const row of rows) buckets[row.hour] = Number(row.plays);
  return buckets;
}

export async function GET(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search") || "";

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ events: [], totalPages: 0, totalItems: 0, page, hourHistogram: [], since: null });
    }

    const where: Prisma.ListeningEventWhereInput = { userId: user.id };
    if (search.trim()) {
      where.OR = [
        { rawArtistName: { contains: search, mode: "insensitive" } },
        { rawTrackName: { contains: search, mode: "insensitive" } },
        { rawAlbumName: { contains: search, mode: "insensitive" } },
      ];
    }

    const totalItems = await prisma.listeningEvent.count({ where });
    const totalPages = Math.ceil(totalItems / limit);

    const [events, hours, first] = await Promise.all([
      prisma.listeningEvent.findMany({
        where,
        orderBy: { playedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          playedAt: true,
          rawArtistName: true,
          rawTrackName: true,
          rawAlbumName: true,
          provider: true,
          album: { select: { coverUrl: true } },
          track: { select: { previewUrl: true, appleMusicUrl: true } },
        },
      }),
      hourHistogram(user.id, user.timezone, search),
      // desde quando ele te conhece: a primeira audição que o histórico tem
      prisma.listeningEvent.findFirst({ where: { userId: user.id }, orderBy: { playedAt: "asc" }, select: { playedAt: true } }),
    ]);

    return NextResponse.json({
      events: events.map(({ album, track, ...event }) => ({
        ...event,
        coverUrl: album?.coverUrl ?? null,
        // prévia e link vêm do catálogo da Apple, quando a faixa já foi casada
        previewUrl: track?.previewUrl ?? null,
        appleMusicUrl: track?.appleMusicUrl ?? null,
      })),
      page,
      totalPages,
      totalItems,
      hourHistogram: hours,
      since: first?.playedAt ?? null,
      // o fuso das horas do gráfico: a lista agrupa e mostra no mesmo
      timezone: user.timezone,
    });
  } catch (error: any) {
    console.error("History API error:", error);
    return NextResponse.json({ error: error?.message || "Failed to fetch history" }, { status: 500 });
  }
}
