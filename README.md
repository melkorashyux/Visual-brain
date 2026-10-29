# Visual Brain

A local-first design inspiration library, packaged as a desktop app. Drop in screenshots
of designs you like, or use the Chrome extension to right click on any photo and add it
to your library. A vision model (local via Ollama, or Claude) auto-titles, categorizes,
tags, and writes design notes for each one — or skip AI entirely and organize by hand.
Everything runs on your machine — no accounts, no cloud database.

## Download

Grab the installer for your OS from the
[latest release](https://github.com/melkorashyux/visual-brain/releases/latest):

| OS | File |
| --- | --- |
| macOS (Apple Silicon) | `Visual-Brain-<version>-arm64.dmg` |
| Windows | `Visual-Brain-Setup-<version>.exe` |
| Linux | `Visual-Brain-<version>.AppImage` |

The builds aren't code-signed yet, so each OS asks you to confirm the first launch:

- **macOS** — open the `.dmg`, drag Visual Brain into Applications, and launch it. When
  macOS says it can't verify the app, open **System Settings → Privacy & Security**,
  scroll down, and click **Open Anyway**.
- **Windows** — if SmartScreen shows "Windows protected your PC", click **More info →
  Run anyway**.
- **Linux** — make the AppImage executable, then run it:
  `chmod +x Visual-Brain-*.AppImage && ./Visual-Brain-*.AppImage`

On Linux and Windows the app updates itself: it checks for a new release on launch,
downloads it in the background, and installs it the next time you quit. On macOS,
download new versions from the releases page until the builds are signed.

## First launch

The first time you open Visual Brain, it asks how you want images analyzed:

- **Ollama** — runs a vision model locally, so nothing leaves your machine. Needs
  [Ollama](https://ollama.com) installed; the setup screen checks it's running and can
  download the model for you.
- **Claude** — sharper results, via the Anthropic API. Paste a key from
  [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
- **No AI analysis** — uploads are saved with their filename as the title, and you
  add tags and notes yourself.

You can switch anytime in **Settings**.

## Analysis providers

**Ollama** (the default provider) runs auto-tagging entirely on your machine — no API key, no upload leaves your machine.
Requires [Ollama](https://ollama.com) running locally with a vision-capable model
pulled:

```bash
ollama pull gemma3:4b
ollama serve
```

The model defaults to `gemma3:4b` and the host to `http://localhost:11434` — change
either in **Settings**. Local models are noticeably weaker than Claude at this task
(nuanced tags, naming aesthetic movements, staying in valid JSON), so expect
lower-quality results in exchange for running fully offline. The Claude model defaults
to `claude-sonnet-5`.

Both the analysis provider and local UI preferences (font, accent color, header size)
live under **Settings** inside the app, in the "Settings" and "Developer" sections
respectively.

## Development

```bash
npm install
npm run electron
```

`npm run electron` launches the desktop app in dev mode — it starts the Next.js server
for you in the background and opens it in an app window, no browser required.

### Building the desktop app

```bash
npm run dist:mac    # or dist:win / dist:linux
```

Builds a distributable (`.dmg` / `.nsis` / `.AppImage`) into `release/`. The packaged app
bundles Next's standalone server and runs it with Electron's own embedded Node runtime,
so end users don't need Node or npm installed at all.

### Releasing a new version

Installed copies of the app check GitHub Releases on launch, download a newer
version in the background, and install it the next time they quit (Linux and
Windows; macOS updates need a signed and notarized build first).

1. Bump `"version"` in `package.json` (e.g. `0.2.0`) and commit it.
2. Tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. The **Release** GitHub Action builds Linux, Windows and macOS installers and
   attaches them to a draft release. Open it on GitHub, edit the notes, and
   click **Publish** — that's when installed apps see the update.

## Where data lives

The installed app keeps your library outside the app itself, so it survives updates and
reinstalls:

- **macOS** — `~/Library/Application Support/Visual Brain/data`
- **Windows** — `%APPDATA%\Visual Brain\data`
- **Linux** — `~/.config/Visual Brain/data`

In dev mode it's `data/` in the repo (gitignored). Override either with the
`VISUAL_BRAIN_DATA_DIR` environment variable. Inside that folder:

- `visual-brain.db` — SQLite database (items, folders — metadata only, no image bytes)
- `uploads/` — the actual screenshot/image files, referenced by filename from the db
- `extension-token` — the Chrome extension's token

A new library starts empty. Deleting `visual-brain.db` resets your library (images in
`uploads/` are untouched but become orphaned).

## How it works

1. Drop screenshots onto the Library page (drag-and-drop anywhere, or the **+ Add**
   button), or right-click any image on the web and save it via the
   [Chrome extension](#chrome-extension-save-to-visual-brain).
2. Each image is saved to `uploads/`, sent to the analysis provider with a
   design-librarian system prompt, and the returned JSON (title, category, tags, description, design notes,
   dominant colors, typography, layout) is stored as a row in SQLite.
3. Multiple files upload concurrently (limit of 3 at a time) so the grid fills in as
   each analysis finishes.
4. The Library page filters everything client-side — search matches title, description,
   design notes, and tags; folder, category, and tag filters all stack with search.
5. Click any card to open the detail view, edit any field, move it to a different
   folder, copy a color swatch's hex, or delete the item.

Library is the app's home view — the logo and title in the header always route back to
it, from anywhere including Settings. **Settings** (top right) is the only other nav
item, and covers both the analysis provider/API key and local UI/developer preferences.

### Folders

A **folder** is a manual bucket you file items into by hand — separate from the
category/tags the AI generates automatically. Every item lives in exactly one folder;
new items with nothing specified land in the default **Unsorted** folder. Manage
folders from the sidebar on the Library page (create, rename, delete — deleting a
folder moves its items to Unsorted rather than deleting them; Unsorted itself can't be
renamed or deleted).

## Chrome extension (Save to Visual Brain)

A Manifest V3 extension in `./extension/` lets you right-click any image on the web,
pick a folder, and have it saved and analyzed exactly like an upload. It authenticates
with a token the app generates on first launch, so every install has its own; copy it
from **Settings → Chrome Extension**, which can also regenerate it.

**Load it:**

1. Download the source from the release (or clone the repo) — the extension lives in
   `extension/`.
2. Make sure the app is running (the installed desktop app, or `npm run electron`). It
   serves on `http://localhost:3000`, or the next free port up to 3009 — the extension
   finds it automatically.
3. Open `chrome://extensions`, enable **Developer mode** (top right).
4. Click **Load unpacked**, select the `extension/` folder.
5. In the app, open **Settings → Chrome Extension** and click **copy**. Then click the
   extension's icon in the toolbar, paste into **Visual Brain Token**, and click
   **Test Connection**.

**Use it:** right-click any image on any page → **Save to Visual Brain** → pick a folder. A
notification confirms the save, and the image shows up in your Library within a few
seconds, auto-titled and tagged like everything else. Create new folders from the
popup — the right-click menu updates immediately, no reinstall needed.

**Tightening CORS to your extension ID:** by default `/api/ingest` and `/api/folders`
accept requests from any `chrome-extension://` origin. To lock it to just this
extension, copy its ID from `chrome://extensions` (shown under the extension's name
once loaded) and swap the `chrome-extension://` prefix check in `lib/cors.ts` for an
exact match against `chrome-extension://<your-extension-id>`.

## API routes the extension uses

- `GET /api/folders` — list folders (builds the right-click submenu)
- `POST /api/folders` — create `{ name }`
- `PATCH /api/folders/:id` / `DELETE /api/folders/:id` — rename / delete
- `POST /api/ingest` — save + analyze `{ imageBase64, mediaType, folderId, sourceUrl, pageUrl }`
  (or `{ sourceUrl, pageUrl }` alone — the server fetches the image itself)

All four require an `X-Visual-Brain-Token` header matching the extension token (the app's
own UI is let through as same-origin). `GET /api/health` is open and only identifies the
app, so the extension can find its port.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS v4 · better-sqlite3 · @anthropic-ai/sdk ·
Electron (desktop packaging via electron-builder)

## License

[MIT](LICENSE) © 2026 Mostafa Elkorashy
