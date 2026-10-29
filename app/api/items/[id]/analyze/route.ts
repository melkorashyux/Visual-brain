import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { getItem, updateItem } from "@/lib/db";
import { analyzeScreenshot } from "@/lib/analysis";
import { EXT_BY_MIME } from "@/lib/ingest";
import { getSettings } from "@/lib/settings";
import { UPLOADS_DIR } from "@/lib/paths";

const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime]),
);

// Manual (re-)analysis trigger from the detail modal's "Analyze with AI" /
// "Re-analyze with AI" button — always runs, so it also recovers items whose
// background analysis silently failed (marked "complete" with empty fields).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = getItem(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ext = path.extname(item.filename).toLowerCase();
  const mediaType = MIME_BY_EXT[ext];
  if (!mediaType) {
    return NextResponse.json({ error: `Unsupported image type: ${ext}` }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(path.join(UPLOADS_DIR, item.filename));
  } catch {
    return NextResponse.json({ error: "Image file missing on disk" }, { status: 404 });
  }

  if (getSettings().analysisProvider === "none") {
    return NextResponse.json(
      { error: "AI analysis is off. Choose Claude or Ollama in Settings to use it." },
      { status: 400 },
    );
  }

  const imageBase64 = buffer.toString("base64");
  try {
    const analysis = await analyzeScreenshot(imageBase64, mediaType, item.title);
    const updated = updateItem(id, { ...analysis, analysis_status: "complete" });
    return NextResponse.json({ item: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 502 },
    );
  }
}
