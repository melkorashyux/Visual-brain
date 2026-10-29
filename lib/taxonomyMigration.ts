import type Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { matchAllowed } from "@/lib/tags";
import { CATEGORIES, SEED_TAGS } from "@/lib/types";
import { UPLOADS_DIR } from "@/lib/paths";

/**
 * One-time remap from the old free-form taxonomy to the new fixed one.
 * Deliberately narrow — the goal is "closest confident match," not a
 * guess for every historical string. Anything not listed here is left for
 * `matchAllowed` to fail on, which drops it rather than inventing a value.
 */
const OLD_CATEGORY_MAP: Record<string, (typeof CATEGORIES)[number]> = {
  "Landing Page": "Landing Pages & Marketing Sites",
  "Marketing Site": "Landing Pages & Marketing Sites",
  "Dashboard / App UI": "SaaS & Dashboards",
  Portfolio: "Portfolios & Personal Sites",
  "E-commerce": "E-commerce & Retail",
  "Editorial / Blog": "Editorial, Blog & Publishing",
  "Mobile App": "Mobile Apps",
  "Email / Newsletter": "Editorial, Blog & Publishing",
  "Branding / Identity": "Portfolios & Personal Sites",
  "Component / UI Detail": "Components & UI Kits",
};

const OLD_TAG_SYNONYMS: Record<string, (typeof SEED_TAGS)[number]> = {
  "dark mode": "Dark",
  dark: "Dark",
  "dark background": "Dark",
  "dark_background": "Dark",
  light: "Light",
  "light mode": "Light",
  colorful: "Colorful",
  vibrant: "Colorful",
  monochrome: "Monochrome",
  "high contrast": "Monochrome",
  grayscale: "Monochrome",
  pastel: "Pastel",
  playful: "Playful",
  whimsical: "Playful",
  elegant: "Elegant",
  refined: "Elegant",
  bold: "Bold",
  brutalist: "Bold",
  minimal: "Minimal",
  minimalist: "Minimal",
  "minimalist design": "Minimal",
  "clean design": "Minimal",
  "clean layout": "Minimal",
  retro: "Retro",
  vintage: "Retro",
  "80s design": "Retro",
  "retro interface": "Retro",
  grid: "Grid-heavy",
  "grid_layout": "Grid-heavy",
  asymmetric: "Asymmetric",
  "card grid": "Card-based",
  "card-based": "Card-based",
  "full-bleed": "Full-bleed",
  "full bleed": "Full-bleed",
  "3d": "3D",
  animated: "Animated",
  motion: "Animated",
  typography: "Typography-led",
  "typography detail": "Typography-led",
  "typography hierarchy": "Typography-led",
  "maximalist type": "Typography-led",
  "layered typography": "Typography-led",
  illustrated: "Illustrated",
  illustration: "Illustrated",
  "technical illustration": "Illustrated",
  gradient: "Gradient",
  gradients: "Gradient",
};

function remapCategory(old: string): (typeof CATEGORIES)[number] | null {
  return OLD_CATEGORY_MAP[old] ?? null;
}

function remapTags(oldTags: string[]): string[] {
  const next = new Set<string>();
  for (const tag of oldTags) {
    const mapped = OLD_TAG_SYNONYMS[tag.trim().toLowerCase()];
    if (mapped) next.add(mapped);
  }
  return Array.from(next);
}

/**
 * Runs once per process against whatever's in the DB at startup. Both halves
 * are naturally idempotent — after the first pass, no row still carries an
 * old category string or a category='Other' + empty-tags placeholder, so
 * later calls are cheap no-ops. No migration-flag table needed.
 */
export function migrateTaxonomy(db: Database.Database): void {
  // Items that never got a real analysis (Ollama/Claude unreachable at
  // upload time) are indistinguishable from a real "Other" pick once
  // stripped of the retired category — there's no stored signal for what
  // they should become. Rather than guess, drop them; the underlying
  // upload file is deleted too, so a fresh re-upload runs the (now correct)
  // analysis pipeline against real image content.
  const broken = db
    .prepare("SELECT id, filename, tags FROM items WHERE category = 'Other'")
    .all() as { id: string; filename: string; tags: string }[];
  const brokenIds = broken
    .filter((row) => {
      try {
        return (JSON.parse(row.tags || "[]") as unknown[]).length === 0;
      } catch {
        return true;
      }
    })
    .map((row) => row.id);

  if (brokenIds.length > 0) {
    const brokenSet = new Set(brokenIds);
    for (const row of broken) {
      if (!brokenSet.has(row.id) || row.filename.startsWith("__placeholder")) continue;
      fs.rm(path.join(UPLOADS_DIR, row.filename), { force: true }, () => {});
    }
    const placeholders = brokenIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...brokenIds);
  }

  const rows = db.prepare("SELECT id, category, tags FROM items").all() as {
    id: string;
    category: string;
    tags: string;
  }[];

  const update = db.prepare("UPDATE items SET category = ?, tags = ? WHERE id = ?");
  const applyAll = db.transaction(() => {
    for (const row of rows) {
      const allowedCategory = matchAllowed(row.category, CATEGORIES);
      if (allowedCategory) continue; // already a current category — nothing to do

      const nextCategory = remapCategory(row.category);
      if (!nextCategory) continue; // unrecognized old value — leave for manual fix

      let oldTags: string[] = [];
      try {
        oldTags = JSON.parse(row.tags || "[]");
      } catch {
        oldTags = [];
      }
      const nextTags = remapTags(oldTags);

      update.run(nextCategory, JSON.stringify(nextTags), row.id);
    }
  });
  applyAll();
}
