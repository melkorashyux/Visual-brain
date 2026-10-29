import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, type BrainSettings } from "@/lib/settings";

function maskKey(key: string): string {
  if (!key) return "";
  return key.length <= 4 ? "*".repeat(key.length) : `${"*".repeat(key.length - 4)}${key.slice(-4)}`;
}

// Same-origin only (no token/CORS) — local UI reads/writes its own install's
// analysis settings. The API key is masked on the way out; POST only
// overwrites it when the client sends a new, unmasked value.
export async function GET() {
  const settings = getSettings();
  return NextResponse.json({
    ...settings,
    anthropicApiKey: maskKey(settings.anthropicApiKey),
    anthropicApiKeySet: settings.anthropicApiKey.length > 0,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const partial: Partial<BrainSettings> = {};

  if (["anthropic", "ollama", "none"].includes(body.analysisProvider)) {
    partial.analysisProvider = body.analysisProvider;
  }
  if (typeof body.anthropicApiKey === "string" && !body.anthropicApiKey.includes("*")) {
    partial.anthropicApiKey = body.anthropicApiKey.trim();
  }
  if (typeof body.analysisModel === "string" && body.analysisModel.trim()) {
    partial.analysisModel = body.analysisModel.trim();
  }
  if (typeof body.ollamaHost === "string" && body.ollamaHost.trim()) {
    partial.ollamaHost = body.ollamaHost.trim();
  }
  if (typeof body.ollamaModel === "string" && body.ollamaModel.trim()) {
    partial.ollamaModel = body.ollamaModel.trim();
  }
  if (body.setupComplete === true) {
    partial.setupComplete = true;
  }

  const settings = saveSettings(partial);
  return NextResponse.json({
    ...settings,
    anthropicApiKey: maskKey(settings.anthropicApiKey),
    anthropicApiKeySet: settings.anthropicApiKey.length > 0,
  });
}
