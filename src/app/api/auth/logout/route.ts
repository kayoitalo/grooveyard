import { NextResponse } from "next/server";
import { isTrustedMutation } from "@/lib/security/request-origin";
import { deleteSession } from "@/lib/security/session";

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  try {
    await deleteSession();
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Não foi possível sair." }, { status: 503 }); }
}
