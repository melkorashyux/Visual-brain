import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/paths";

const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

export interface BrainSettings {
  /** "none": images are saved without any AI analysis. */
  analysisProvider: "anthropic" | "ollama" | "none";
  anthropicApiKey: string;
  analysisModel: string;
  ollamaHost: string;
  ollamaModel: string;
  /** Set once the first-launch setup screen is finished or skipped. */
  setupComplete: boolean;
}

const DEFAULTS: BrainSettings = {
  analysisProvider: process.env.ANALYSIS_PROVIDER === "anthropic" ? "anthropic" : "ollama",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  analysisModel: process.env.ANALYSIS_MODEL || "claude-sonnet-5",
  ollamaHost: process.env.OLLAMA_HOST || "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "gemma3:4b",
  setupComplete: false,
};

// Cached per file mtime, not just once: Next bundles each page and API route
// separately, so each has its own copy of this module. A plain once-only
// cache meant a save from /api/settings never reached the others (the home
// page kept redirecting to /setup; uploads kept the old provider).
let cached: { mtimeMs: number; settings: BrainSettings } | null = null;

/**
 * Local per-install settings (analysis provider, API key, model). Backed by
 * a JSON file in the data dir, so each install's key lives only on that
 * machine. Until something is saved, defaults come from env vars if set.
 */
export function getSettings(): BrainSettings {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(SETTINGS_PATH).mtimeMs;
  } catch {
    return DEFAULTS;
  }
  if (cached?.mtimeMs === mtimeMs) return cached.settings;

  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    cached = { mtimeMs, settings: { ...DEFAULTS, ...saved } };
    return cached.settings;
  } catch {
    return DEFAULTS; // corrupt file
  }
}

export function saveSettings(partial: Partial<BrainSettings>): BrainSettings {
  const next = { ...getSettings(), ...partial };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
  return next;
}
