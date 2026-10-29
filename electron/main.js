const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");

// Sets the userData folder name (~/Library/Application Support/Visual Brain
// on macOS) — must run before any app.getPath("userData") call, since
// Electron derives the default path from app.name the first time it's read.
app.setName("Visual Brain");

// The extension looks for the app on these same ports (extension/shared.js).
const FIRST_PORT = 3000;
const LAST_PORT = 3009;

let serverProcess;
let mainWindow;
let appUrl;

// Only one copy may run — a second would start a second server on another
// port against the same library. Relaunching just focuses the open window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "localhost", () => probe.close(() => resolve(true)));
  });
}

async function findFreePort() {
  for (let port = FIRST_PORT; port <= LAST_PORT; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port between ${FIRST_PORT} and ${LAST_PORT}`);
}

// Waits for *our* server via /api/health, so a different app that grabbed
// the port in the meantime is never loaded into the window.
function waitForServer(url, callback) {
  const attempt = () => {
    http
      .get(`${url}/api/health`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (body.includes('"visual-brain"')) callback();
          else setTimeout(attempt, 300);
        });
      })
      .on("error", () => setTimeout(attempt, 300));
  };
  attempt();
}

function startServer(port) {
  if (!app.isPackaged) {
    // Dev mode: rely on the developer's own Node/npm install. Detached into
    // its own process group so stopServer() can kill npm *and* next dev.
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    serverProcess = spawn(npmCmd, ["run", "dev"], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
      shell: false,
      detached: process.platform !== "win32",
      env: { ...process.env, PORT: String(port) },
    });
  } else {
    // Packaged mode: run Next's standalone server.js directly using
    // Electron's own embedded Node runtime (ELECTRON_RUN_AS_NODE), so
    // end users don't need Node/npm installed on their machine at all.
    const standaloneDir = path.join(process.resourcesPath, "app", ".next", "standalone");
    const serverScript = path.join(standaloneDir, "server.js");

    // The bundle itself (including its cwd) is replaced wholesale on every
    // reinstall/update, so the db/uploads must live outside it — in
    // Electron's persistent userData directory — or every update would wipe
    // the library. See the matching env read in lib/db.ts and lib/settings.ts.
    const dataDir = path.join(app.getPath("userData"), "data");

    serverProcess = spawn(process.execPath, [path.join(__dirname, "server-entry.js"), serverScript], {
      cwd: standaloneDir,
      // The "ipc" channel is what lets server-entry.js notice the app is gone.
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(port),
        HOSTNAME: "localhost",
        VISUAL_BRAIN_DATA_DIR: dataDir,
      },
    });
  }

  serverProcess.on("error", (err) => {
    console.error("Failed to start Next.js server:", err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "Visual Brain",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Links to other sites (an item's source URL, the Anthropic Console,
  // the Ollama download page) open in the system browser, not a bare app
  // window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(appUrl)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(appUrl);
  mainWindow.on("closed", () => (mainWindow = null));
}

function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  try {
    if (!app.isPackaged && process.platform !== "win32") process.kill(-serverProcess.pid);
    else serverProcess.kill();
  } catch {
    // already gone
  }
}

// Checks GitHub Releases (the "publish" config in package.json) for a newer
// version, downloads it in the background, shows a system notification, and
// installs it the next time the app quits. Skipped on macOS until builds are
// signed and notarized — unsigned Mac apps can't install updates.
function checkForUpdates() {
  if (!app.isPackaged || process.platform === "darwin") return;
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("Update check failed:", err);
  });
}

app.whenReady().then(async () => {
  if (!app.hasSingleInstanceLock()) return;

  checkForUpdates();

  const port = await findFreePort();
  appUrl = `http://localhost:${port}`;
  startServer(port);
  waitForServer(appUrl, createWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      waitForServer(appUrl, createWindow);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopServer);

// Signals (e.g. the AppImage runtime being killed) skip before-quit.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopServer();
    app.exit(0);
  });
}
