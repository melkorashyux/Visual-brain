import { getSettings, setSettings, fetchFolders, createFolder } from "./shared.js";

const brainUrlInput = document.getElementById("brainUrl");
const brainTokenInput = document.getElementById("brainToken");
const testBtn = document.getElementById("test");
const statusEl = document.getElementById("status");
const newFolderInput = document.getElementById("newFolder");
const createFolderBtn = document.getElementById("createFolder");
const folderStatusEl = document.getElementById("folderStatus");

async function init() {
  const { brainUrl, brainToken } = await getSettings();
  brainUrlInput.value = brainUrl;
  brainTokenInput.value = brainToken;
}
init();

async function persist() {
  await setSettings({
    brainUrl: brainUrlInput.value.trim() || "http://localhost:3000",
    brainToken: brainTokenInput.value.trim(),
  });
}

brainUrlInput.addEventListener("change", persist);
brainTokenInput.addEventListener("change", persist);

testBtn.addEventListener("click", async () => {
  await persist();
  statusEl.textContent = "Testing…";
  statusEl.className = "";
  try {
    const folders = await fetchFolders();
    brainUrlInput.value = (await getSettings()).brainUrl; // may have been rediscovered
    chrome.runtime.sendMessage({ type: "rebuild-menu" });
    statusEl.textContent = `Connected — ${folders.length} folder${folders.length === 1 ? "" : "s"} found`;
    statusEl.className = "ok";
  } catch (err) {
    statusEl.textContent = err instanceof Error ? err.message : "Connection failed";
    statusEl.className = "err";
  }
});

createFolderBtn.addEventListener("click", async () => {
  const name = newFolderInput.value.trim();
  if (!name) return;
  await persist();
  folderStatusEl.textContent = "Creating…";
  folderStatusEl.className = "";
  try {
    await createFolder(name);
    newFolderInput.value = "";
    folderStatusEl.textContent = `Created "${name}" — menu updated`;
    folderStatusEl.className = "ok";
    chrome.runtime.sendMessage({ type: "rebuild-menu" });
  } catch (err) {
    folderStatusEl.textContent = err instanceof Error ? err.message : "Could not create folder";
    folderStatusEl.className = "err";
  }
});
