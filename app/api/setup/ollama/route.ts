import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth";
import { getOllamaStatus } from "@/lib/ollamaSetup";

export async function GET(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getOllamaStatus());
}
