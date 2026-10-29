import { apiFetch, fetchFolders } from "./shared.js";

const MENU_ROOT = "save-to-visual-brain";
const MENU_REFRESH = "save-to-visual-brain-refresh";
const MENU_NEW_FOLDER = "save-to-visual-brain-new-folder";
const MENU_ERROR = "save-to-visual-brain-error";
const FOLDER_PREFIX = "folder:";

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

// MV3 service workers are ephemeral and don't remember previously created
// context menus across restarts, so the menu is rebuilt from scratch on
// every install/startup, and again whenever the popup creates a folder.
let rebuildChain = Promise.resolve();

function rebuildMenu() {
  // Serialized: a storage change and a popup message can arrive together,
  // and two interleaved runs would create duplicate menu ids.
  rebuildChain = rebuildChain.then(buildMenu, buildMenu);
  return rebuildChain;
}

async function buildMenu() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: MENU_ROOT,
    title: "Save to Visual Brain",
    contexts: ["image"],
  });

  let folders = [];
  try {
    folders = await fetchFolders();
  } catch (err) {
    chrome.contextMenus.create({
      id: MENU_ERROR,
      parentId: MENU_ROOT,
      title: `⚠ ${err instanceof Error ? err.message : "Can't reach Visual Brain"}`,
      contexts: ["image"],
      enabled: false,
    });
  }

  for (const folder of folders) {
    chrome.contextMenus.create({
      id: `${FOLDER_PREFIX}${folder.id}`,
      parentId: MENU_ROOT,
      title: folder.name,
      contexts: ["image"],
    });
  }

  if (folders.length > 0) {
    chrome.contextMenus.create({
      id: "save-to-visual-brain-sep",
      parentId: MENU_ROOT,
      type: "separator",
      contexts: ["image"],
    });
  }

  chrome.contextMenus.create({
    id: MENU_NEW_FOLDER,
    parentId: MENU_ROOT,
    title: "＋ New folder…",
    contexts: ["image"],
  });

  chrome.contextMenus.create({
    id: MENU_REFRESH,
    parentId: MENU_ROOT,
    title: "↻ Refresh folders",
    contexts: ["image"],
  });
}

chrome.runtime.onInstalled.addListener(() => {
  rebuildMenu();
});

chrome.runtime.onStartup.addListener(() => {
  rebuildMenu();
});

// A new token or URL pasted into the popup should fix the menu right away —
// otherwise it keeps the error it was built with until Chrome restarts.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.brainToken || changes.brainUrl)) rebuildMenu();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "rebuild-menu") {
    rebuildMenu().then(() => sendResponse({ ok: true }));
    return true; // keep the message channel open for the async response
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_REFRESH) {
    rebuildMenu();
    return;
  }

  if (info.menuItemId === MENU_NEW_FOLDER) {
    try {
      await chrome.action.openPopup();
    } catch {
      chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
    }
    return;
  }

  if (typeof info.menuItemId === "string" && info.menuItemId.startsWith(FOLDER_PREFIX)) {
    const folderId = info.menuItemId.slice(FOLDER_PREFIX.length);
    await saveImage(info, folderId, tab);
  }
});

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function saveImage(info, folderId, tab) {
  const srcUrl = info.srcUrl;
  const pageUrl = info.pageUrl || tab?.url || "";

  const payload = { folderId, sourceUrl: srcUrl, pageUrl };

  // Prefer sending bytes fetched in the extension's own context — it can
  // reach images the server can't (cross-origin, hotlink-protected, behind
  // a session cookie the browser already holds). If that fails for any
  // reason, fall back to sourceUrl-only and let the server fetch it.
  try {
    if (srcUrl.startsWith("data:")) {
      const match = srcUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (match && SUPPORTED_TYPES.has(match[1])) {
        payload.imageBase64 = match[2];
        payload.mediaType = match[1];
      }
    } else {
      const res = await fetch(srcUrl);
      if (res.ok) {
        const blob = await res.blob();
        if (SUPPORTED_TYPES.has(blob.type)) {
          payload.imageBase64 = await blobToBase64(blob);
          payload.mediaType = blob.type;
        }
      }
    }
  } catch {
    // leave payload as sourceUrl-only; server-side fetch fallback handles it
  }

  try {
    const res = await apiFetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`);

    const folders = await fetchFolders().catch(() => []);
    const folderName = folders.find((f) => f.id === folderId)?.name ?? "Visual Brain";
    notify("Saved to Visual Brain ✓", `Added to ${folderName}`);
  } catch (err) {
    notify("Save failed", err instanceof Error ? err.message : "Unknown error");
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
  });
}
