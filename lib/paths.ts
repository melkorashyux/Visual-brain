import path from "node:path";

// In the packaged desktop app, electron/main.js points this at a directory
// outside the app bundle (Electron's userData path) so the library survives
// reinstalls/updates — the bundle itself is replaced wholesale on every
// build, and on Linux it's a read-only AppImage mount. Falls back to a
// project-relative folder for `npm run dev`/`start`. Every read or write of
// library data must go through these, never process.cwd() directly.
export const DATA_DIR = process.env.VISUAL_BRAIN_DATA_DIR || path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");

// Where the seed placeholder SVGs ship — inside the repo/bundle, which is
// only the same place as UPLOADS_DIR in dev.
export const BUNDLED_UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
