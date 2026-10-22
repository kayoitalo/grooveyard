import { authorizeApi } from "@/lib/security/api-auth";
import { EnrichmentService } from "@/modules/enrichment/application/enrichment-service";
import { NextResponse } from "next/server";

const enrichmentService = new EnrichmentService();

/**
 * O lote do catálogo da Apple anda no ritmo da API deles (~19 chamadas
 * por minuto) e leva perto de 40s; o padrão da Vercel cortaria antes.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  try {
    const coverage = await enrichmentService.getCoverageStats();
    return NextResponse.json({ success: true, data: coverage });
  } catch (error: any) {
    console.error("GET /api/enrichment error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await authorizeApi(request);
  if (access.response) return access.response;
  try {
    let batchSize = 5;
    let action: "all" | "covers" | "catalog" = "all";
    try {
      const body = await request.json();
      if (body.batchSize && typeof body.batchSize === "number") {
        batchSize = Math.min(20, Math.max(1, body.batchSize));
      }
      if (body.action === "covers" || body.action === "catalog") action = body.action;
    } catch {

    }

    if (action === "covers") {
      const covers = await enrichmentService.enrichMissingAlbumCovers(batchSize);
      const coverage = await enrichmentService.getCoverageStats();
      return NextResponse.json({ success: true, data: { covers, coverage } });
    }

    if (action === "catalog") {
      // duas chamadas por disco: mais de 8 não cabe em um minuto
      const catalog = await enrichmentService.enrichAlbumsFromCatalog(Math.min(8, batchSize));
      const coverage = await enrichmentService.getCoverageStats();
      return NextResponse.json({ success: true, data: { catalog, coverage } });
    }

    const summary = await enrichmentService.enrichUnresolvedArtists(batchSize);
    const updatedCoverage = await enrichmentService.getCoverageStats();

    return NextResponse.json({
      success: true,
      data: {
        summary,
        coverage: updatedCoverage,
      },
    });
  } catch (error: any) {
    console.error("POST /api/enrichment error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
