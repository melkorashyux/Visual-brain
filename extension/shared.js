export const DEFAULT_VISUAL_BRAIN_URL = "http://localhost:3000";

export async function getSettings() {
  const { brainUrl, brainToken } = await chrome.storage.local.get(["brainUrl", "brainToken"]);
  return {
    brainUrl: brainUrl || DEFAULT_VISUAL_BRAIN_URL,
    brainToken: brainToken || "",
  };
}

export async function setSettings(partial) {
  await chrome.storage.local.set(partial);
}

// The app takes the first free port from 3000 up (see electron/main.js).
const CANDIDATE_PORTS = Array.from({ length: 10 }, (_, i) => 3000 + i);

/** Finds the port the app is on via /api/health, or null if it isn't running. */
export async function discoverBrainUrl() {
  for (const port of CANDIDATE_PORTS) {
    const url = `http://localhost:${port}`;
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(800) });
      const body = await res.json();
      if (body.app === "visual-brain") return url;
    } catch {
      // nothing there, or not Visual Brain
    }
  }
  return null;
}

function send(brainUrl, brainToken, path, options) {
  return fetch(`${brainUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "X-Visual-Brain-Token": brainToken,
    },
  });
}

export async function apiFetch(path, options = {}) {
  const { brainUrl, brainToken } = await getSettings();
  try {
    return await send(brainUrl, brainToken, path, options);
  } catch (err) {
    // Unreachable — the app may have started on a different local port.
    if (!brainUrl.startsWith("http://localhost:")) throw err;
    const found = await discoverBrainUrl();
    if (!found || found === brainUrl) {
      throw new Error("Can't reach Visual Brain — is the app open?");
    }
    await setSettings({ brainUrl: found });
    return send(found, brainToken, path, options);
  }
}

export async function fetchFolders() {
  const res = await apiFetch("/api/folders");
  if (res.status === 401) {
    throw new Error("Token doesn't match — copy it again from Visual Brain → Settings");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to load folders (${res.status})`);
  }
  const { folders } = await res.json();
  return folders;
}

export async function createFolder(name) {
  const res = await apiFetch("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Failed to create folder (${res.status})`);
  return body.folder;
}
