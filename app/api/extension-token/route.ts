import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth";
import { getExtensionToken, regenerateExtensionToken } from "@/lib/token";

// Same-origin only — the Settings screen shows the token so it can be
// copied into the extension. Never readable cross-origin, or the extension
// (or any other extension) could just fetch it.
export async function GET(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ token: getExtensionToken() });
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ token: regenerateExtensionToken() });
}
