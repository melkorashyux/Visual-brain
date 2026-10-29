import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { UPLOADS_DIR } from "@/lib/paths";

const THUMBS_DIR = path.join(UPLOADS_DIR, ".thumbs");

const DEFAULT_WIDTH = 480;
const MAX_WIDTH = 1200;

// Originals here are raw screenshots (often 3000px+, multi-megabyte PNGs).
// Grid views only ever display them at a few hundred CSS pixels, but an
// <img> still has to decode the full-resolution bitmap to do that — that
// decode cost is what was making fast scrolling janky. This route resizes
// once, caches the result on disk, and serves the small version instead so
// the grid never asks the browser to decode a full-size original.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const requestedWidth = Number(req.nextUrl.searchParams.get("w"));
  const width =
    Number.isFinite(requestedWidth) && requestedWidth > 0
      ? Math.min(Math.round(requestedWidth), MAX_WIDTH)
      : DEFAULT_WIDTH;

  const originalPath = path.join(UPLOADS_DIR, filename);
  const thumbPath = path.join(THUMBS_DIR, `${filename}.w${width}.webp`);

  try {
    const cached = await fs.readFile(thumbPath);
    return new NextResponse(new Uint8Array(cached), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // Not cached yet — fall through and generate it below.
  }

  let original: Buffer;
  try {
    original = await fs.readFile(originalPath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resized = await sharp(original)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  await fs.mkdir(THUMBS_DIR, { recursive: true });
  await fs.writeFile(thumbPath, resized);

  return new NextResponse(new Uint8Array(resized), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
