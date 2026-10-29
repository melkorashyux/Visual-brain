import { matchAllowed } from "@/lib/tags";
import { CATEGORIES } from "@/lib/types";
import type { AnalysisResult } from "@/lib/types";

// Failure-of-last-resort default when analysis can't run at all (model
// unreachable, unparseable response). Not a taxonomy decision — just needs
// to be some valid member of CATEGORIES so the row stays well-formed; the
// user can always recategorize once a real analysis succeeds.
export const FALLBACK_CATEGORY: (typeof CATEGORIES)[number] = CATEGORIES[0];

/**
 * True when the category is just FALLBACK_CATEGORY on an item nothing else
 * has filled in yet (added without AI, or analysis failed) — it's a
 * placeholder, not a real label, so the UI hides it outside edit mode.
 */
export function hasPlaceholderCategory(item: {
  category: string;
  tags: string[];
  description: string;
  design_notes: string;
}): boolean {
  return (
    item.category === FALLBACK_CATEGORY &&
    item.tags.length === 0 &&
    !item.description &&
    !item.design_notes
  );
}

/**
 * Builds the system prompt with the current allowed categories and tags
 * spelled out explicitly, since both are closed lists the model must pick
 * from rather than invent. `allowedTags` is read fresh from the tags table
 * (see lib/db.ts listTags()) on every call, since users can add to it.
 */
export function buildSystemPrompt(allowedTags: string[]): string {
  return `You are a design librarian. You are shown an image saved as a design
reference (a UI screenshot, a photo, an illustration, a piece of branding, etc.).
Analyze it as a design reference and return ONLY a JSON object — no prose, no
markdown, no code fences — matching exactly this shape:

{
  "title": string,            // short, specific name for this design, max 6 words
  "category": string,         // EXACTLY one of the allowed categories listed below
  "tags": string[],           // 3-8 tags, EACH one of the allowed tags listed below
  "description": string,      // 2-3 sentences: what this design is and does
  "design_notes": string,     // 2-4 sentences: what makes it distinctive and worth saving
  "colors": string[],         // 3-6 dominant colors as hex, most dominant first
  "typography": string,       // short phrase describing the type treatment
  "layout": string            // short phrase describing the layout structure
}

Allowed categories (pick exactly one — the single closest match, never invent,
rename, or merge categories):
${CATEGORIES.map((c) => `- ${c}`).join("\n")}

Allowed tags (pick zero or more, only from this list — never invent a new tag;
if nothing here fits well, select fewer tags rather than making one up):
${allowedTags.map((t) => `- ${t}`).join("\n")}

Any category or tag outside these two lists is invalid output and will be discarded.

Be precise and specific about visual style. Return valid JSON only.`;
}

export const USER_PROMPT =
  "Analyze this design reference image and return the JSON object described in the system prompt.";

export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text.trim();
}

/**
 * Whitelists the model's response against the current allowed categories and
 * tags. Anything outside those lists is silently dropped rather than passed
 * through — a bad or stale model response can never introduce a new value.
 */
export function normalizeResult(raw: unknown, allowedTags: string[]): AnalysisResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const title = typeof r.title === "string" && r.title.trim() ? r.title.trim() : null;
  if (!title) return null;

  const category =
    (typeof r.category === "string" && matchAllowed(r.category, CATEGORIES)) ||
    FALLBACK_CATEGORY;

  const tags = Array.isArray(r.tags)
    ? Array.from(
        new Set(
          r.tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => matchAllowed(t, allowedTags))
            .filter((t): t is string => t !== null),
        ),
      )
    : [];

  const colors = Array.isArray(r.colors)
    ? r.colors.filter((c): c is string => typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c))
    : [];

  return {
    title,
    category,
    tags,
    description: typeof r.description === "string" ? r.description : "",
    design_notes: typeof r.design_notes === "string" ? r.design_notes : "",
    colors,
    typography: typeof r.typography === "string" ? r.typography : "",
    layout: typeof r.layout === "string" ? r.layout : "",
  };
}

export function emptyResult(fallbackTitle: string): AnalysisResult {
  return {
    title: fallbackTitle,
    category: FALLBACK_CATEGORY,
    tags: [],
    description: "",
    design_notes: "",
    colors: [],
    typography: "",
    layout: "",
  };
}

/**
 * Retries a single analysis call once on failure, then falls back to a
 * minimal record so an upload never hard-fails just because the model
 * (cloud or local) is unreachable or returned unparseable JSON.
 */
export async function withAnalysisRetry(
  fallbackTitle: string,
  callModel: () => Promise<AnalysisResult | null>,
): Promise<AnalysisResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callModel();
      if (result) return result;
    } catch (err) {
      console.error(`analyzeScreenshot attempt ${attempt + 1} failed:`, err);
    }
  }

  return emptyResult(fallbackTitle);
}
