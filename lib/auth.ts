import { NextRequest, NextResponse } from "next/server";
import { getExtensionToken } from "@/lib/token";

/**
 * True for requests from the app's own UI. Browsers set Sec-Fetch-Site
 * themselves and pages can't forge it, so a cross-origin caller (the
 * extension, or any website) never gets past this without the token.
 */
export function isSameOrigin(req: NextRequest): boolean {
  return req.headers.get("sec-fetch-site") === "same-origin";
}

/**
 * Gate for /api/ingest and /api/folders — routes the Chrome extension calls
 * cross-origin. The app's own UI passes as same-origin; everything else
 * needs the X-Visual-Brain-Token header. Returns a 401 response to
 * short-circuit with, or null if the request is authorized.
 */
export function requireToken(req: NextRequest): NextResponse | null {
  if (isSameOrigin(req)) return null;

  const header = req.headers.get("x-visual-brain-token");
  if (header !== getExtensionToken()) {
    return NextResponse.json({ error: "Invalid or missing X-Visual-Brain-Token header" }, { status: 401 });
  }

  return null;
}
