import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

// Downloads the configured model through Ollama and passes its progress
// stream straight through: newline-delimited JSON like
// {"status":"pulling …","total":3338801804,"completed":1048576}.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { ollamaHost, ollamaModel } = getSettings();
  try {
    const res = await fetch(`${ollamaHost}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ollamaModel, stream: true }),
    });
    if (!res.ok || !res.body) {
      return NextResponse.json(
        { error: `Ollama couldn't download ${ollamaModel} (${res.status})` },
        { status: 502 },
      );
    }
    return new Response(res.body, { headers: { "Content-Type": "application/x-ndjson" } });
  } catch {
    return NextResponse.json({ error: "Ollama isn't running" }, { status: 502 });
  }
}
