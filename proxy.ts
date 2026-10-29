import { NextResponse, type NextRequest } from "next/server";

// Routes the Chrome extension calls cross-origin. They check the extension
// token themselves (lib/auth.ts), so they're let through here.
const EXTENSION_ROUTES = ["/api/ingest", "/api/folders", "/api/health"];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The app serves on localhost while it's open, so any website in the
 * user's browser can send it requests. This turns away:
 * - requests for any other host name — a DNS-rebinding page pointing its
 *   own domain at 127.0.0.1 would otherwise count as same-origin;
 * - writes from other sites — form posts and text/plain JSON need no CORS
 *   preflight, so without this a page could upload into the library or
 *   rewrite settings (e.g. point the Ollama host at its own server).
 */
export function proxy(req: NextRequest) {
  const host = req.headers.get("host")?.replace(/:\d+$/, "") ?? "";
  if (!LOCAL_HOSTS.has(host)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { pathname } = req.nextUrl;
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (!pathname.startsWith("/api/") || !isWrite) return NextResponse.next();

  const origin = req.headers.get("origin");
  const fromExtension = origin?.startsWith("chrome-extension://") ?? false;
  if (fromExtension && EXTENSION_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return NextResponse.next();
  }

  const site = req.headers.get("sec-fetch-site");
  const crossSite = site === "cross-site" || site === "same-site";
  // Compared with the Host header rather than nextUrl, which may not match
  // what the browser actually used (localhost vs 127.0.0.1).
  const foreignOrigin = origin !== null && origin !== `http://${req.headers.get("host")}`;
  if (crossSite || foreignOrigin) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
