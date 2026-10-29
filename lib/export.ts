import path from "node:path";
import fs from "node:fs/promises";
import { getItem } from "@/lib/db";
import { UPLOADS_DIR, EXPORTS_DIR } from "@/lib/paths";

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return slug || "item";
}

/**
 * Copies the given items' images (plus a reference.md summarizing their
 * metadata) into a fresh folder under data/exports/ — a self-contained
 * bundle meant to be pasted as a path into a Claude Code session.
 */
export async function exportItems(ids: string[]): Promise<{ exportDir: string; fileCount: number }> {
  if (ids.length === 0) throw new Error("No items to export");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label =
    ids.length === 1 ? slugify(getItem(ids[0])?.title ?? "item") : `${ids.length}-items`;
  const exportDir = path.join(EXPORTS_DIR, `${timestamp}-${label}`);
  await fs.mkdir(exportDir, { recursive: true });

  const usedNames = new Set<string>();
  const lines: string[] = [
    "# Design Reference Export",
    "",
    `${ids.length} item(s), exported ${new Date().toLocaleString()}`,
    "",
  ];

  let fileCount = 0;

  for (const id of ids) {
    const item = getItem(id);
    if (!item) continue;

    const ext = path.extname(item.filename) || ".png";
    const base = slugify(item.title);
    let filename = `${base}${ext}`;
    let n = 2;
    while (usedNames.has(filename)) {
      filename = `${base}-${n}${ext}`;
      n++;
    }
    usedNames.add(filename);

    await fs.copyFile(path.join(UPLOADS_DIR, item.filename), path.join(exportDir, filename));
    fileCount++;

    lines.push(`## ${item.title}`, "");
    lines.push(`- Image: \`${filename}\``);
    lines.push(`- Category: ${item.category}`);
    if (item.tags.length) lines.push(`- Tags: ${item.tags.join(", ")}`);
    if (item.description) lines.push(`- Description: ${item.description}`);
    if (item.design_notes) lines.push(`- Design notes: ${item.design_notes}`);
    if (item.colors.length) lines.push(`- Colors: ${item.colors.join(", ")}`);
    if (item.typography) lines.push(`- Typography: ${item.typography}`);
    if (item.layout) lines.push(`- Layout: ${item.layout}`);
    if (item.source_url) lines.push(`- Source: ${item.source_url}`);
    lines.push("");
  }

  await fs.writeFile(path.join(exportDir, "reference.md"), lines.join("\n"));

  return { exportDir, fileCount };
}
