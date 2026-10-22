import { authorizeApi } from "@/lib/security/api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { LastFmHistoryProvider } from "@/modules/listening/infrastructure/lastfm-adapter";
import { ListeningSyncService } from "@/modules/listening/application/sync-service";
import { z } from "zod";



const syncRequestSchema = z.object({
  username: z.string().min(1, "Last.fm username is required"),
});

export async function GET(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  const userId = access.userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ connection: null, latestRun: null });
  const connection = await prisma.providerConnection.findUnique({
    where: { userId_provider: { userId: user.id, provider: "lastfm" } },
    select: { username: true, status: true, lastSyncedAt: true, syncRuns: { orderBy: { startedAt: "desc" }, take: 1 } },
  });
  if (!connection) return NextResponse.json({ connection: null, latestRun: null });
  const { syncRuns, ...details } = connection;
  return NextResponse.json({ connection: details, latestRun: syncRuns[0] ?? null });
}

export async function POST(request: Request) {
  const access = await authorizeApi(request, true);
  if (access.response) return access.response;
  const userId = access.userId;

  try {
    const body = await request.json();
    const parsed = syncRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { username } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

    await prisma.providerConnection.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider: "lastfm",
        },
      },
      update: {
        username,
      },
      create: {
        userId: user.id,
        provider: "lastfm",
        username,
        status: "ACTIVE",
      },
    });

    const provider = new LastFmHistoryProvider();
    const syncService = new ListeningSyncService(provider);
    const result = await syncService.runIncrementalSync(user.id, "lastfm");

    return NextResponse.json({
      success: true,
      user: { id: user.id, username },
      sync: result,
    });
  } catch (error: any) {
    console.error("Sync API error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to synchronize history" },
      { status: 500 }
    );
  }
}
