import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DATA_DIR } from "@/lib/paths";

const TOKEN_PATH = path.join(DATA_DIR, "extension-token");

let cached: string | null = null;

function generate(): string {
  return randomBytes(24).toString("hex");
}

function write(token: string) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
}

/**
 * The secret the Chrome extension authenticates with. Generated on first
 * read and stored in the data dir, so every install gets its own — never
 * baked into the build, where every copy of the app would share one.
 */
export function getExtensionToken(): string {
  if (cached) return cached;

  try {
    const saved = fs.readFileSync(TOKEN_PATH, "utf-8").trim();
    if (saved) return (cached = saved);
  } catch {
    // missing — generate below
  }

  cached = generate();
  write(cached);
  return cached;
}

/** Replaces the token; any connected extension has to paste the new one. */
export function regenerateExtensionToken(): string {
  cached = generate();
  write(cached);
  return cached;
}
