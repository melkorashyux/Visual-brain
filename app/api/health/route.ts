import { NextRequest, NextResponse } from "next/server";
import { withCors, corsPreflight } from "@/lib/cors";

// Unauthenticated identity check — lets the extension find which local port
// the app ended up on (it falls back past 3000 when that's taken).
export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function GET(req: NextRequest) {
  return withCors(NextResponse.json({ app: "visual-brain" }), req);
}
