import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/paths";

const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

export interface BrainSettings {
  analysisProvider: "anthropic" | "ollama";
  anthropicApiKey: string;
  analysisModel: string;
  ollamaHost: string;
  ollamaModel: string;
}

const DEFAULTS: BrainSettings = {
  analysisProvider: process.env.ANALYSIS_PROVIDER === "anthropic" ? "anthropic" : "ollama",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  analysisModel: process.env.ANALYSIS_MODEL || "claude-sonnet-5",
  ollamaHost: process.env.OLLAMA_HOST || "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "gemma3:4b",
};

let cached: BrainSettings | null = null;

/**
 * Local per-install settings (analysis provider, API key, model). Backed by
 * a JSON file in the data dir, so each install's key lives only on that
 * machine. Until something is saved, defaults come from env vars if set.
 */
export function getSettings(): BrainSettings {
  if (cached) return cached;

  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      cached = { ...DEFAULTS, ...saved };
      return cached!;
    } catch {
      // fall through to defaults on a corrupt file
    }
  }

  cached = DEFAULTS;
  return cached;
}

export function saveSettings(partial: Partial<BrainSettings>): BrainSettings {
  const next = { ...getSettings(), ...partial };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
  cached = next;
  return next;
}
