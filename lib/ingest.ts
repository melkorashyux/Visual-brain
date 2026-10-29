import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { createItem, updateItem } from "@/lib/db";
import { analyzeScreenshot } from "@/lib/analysis";
import { FALLBACK_CATEGORY } from "@/lib/analysis-shared";
import type { BrainItem } from "@/lib/types";
import { UPLOADS_DIR } from "@/lib/paths";

export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export const SUPPORTED_MIME_TYPES = Object.keys(EXT_BY_MIME);

export interface SaveAndAnalyzeInput {
  buffer: Buffer;
  mediaType: string;
  fallbackTitle: string;
  sourceUrl?: string | null;
  folderId?: string | null;
}

/**
 * Saves image bytes to disk and inserts the row immediately with placeholder
 * metadata and analysis_status "pending", so the item (and its thumbnail)
 * shows up right away instead of the caller — the Chrome extension, the
 * upload form — blocking on however long the vision model takes (Ollama in
 * particular can take up to two minutes). The real analysis runs afterward
 * in the background and overwrites the row in place once it resolves.
 */
export async function saveAndAnalyze(input: SaveAndAnalyzeInput): Promise<BrainItem> {
  const ext = EXT_BY_MIME[input.mediaType];
  if (!ext) throw new Error(`Unsupported image type: ${input.mediaType}`);

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  await fs.writeFile(path.join(UPLOADS_DIR, filename), input.buffer);

  const item = createItem({
    filename,
    title: input.fallbackTitle,
    category: FALLBACK_CATEGORY,
    tags: [],
    description: "",
    design_notes: "",
    colors: [],
    typography: "",
    layout: "",
    source_url: input.sourceUrl ?? null,
    folder_id: input.folderId ?? null,
    analysis_status: "pending",
  });

  const imageBase64 = input.buffer.toString("base64");
  after(async () => {
    try {
      const analysis = await analyzeScreenshot(imageBase64, input.mediaType, input.fallbackTitle);
      updateItem(item.id, { ...analysis, analysis_status: "complete" });
    } catch (err) {
      console.error(`Background analysis failed for item ${item.id}:`, err);
      updateItem(item.id, { analysis_status: "complete" });
    }
  });

  return item;
}
