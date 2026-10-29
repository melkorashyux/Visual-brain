import path from "node:path";

// In the packaged desktop app, electron/main.js points this at a directory
// outside the app bundle (Electron's userData path) so the library survives
// reinstalls/updates — the bundle itself is replaced wholesale on every
// build, and on Linux it's a read-only AppImage mount. Falls back to a
// project-relative folder for `npm run dev`/`start`. Every read or write of
// library data must go through these, never process.cwd() directly.
// turbopackIgnore: a runtime path, not a build input. Without it, file
// tracing assumes any file under the project could be read and copies the
// whole repo (release/ included) into the standalone build.
export const DATA_DIR =
  process.env.VISUAL_BRAIN_DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");
