import { app, autoUpdater, BrowserWindow, dialog, ipcMain, Menu, protocol, safeStorage, session, shell, utilityProcess, type IpcMainInvokeEvent, type UtilityProcess } from "electron";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { aiChunkSchema, credentialInputSchema, credentialStatusSchema, importProgressSchema, requestSchemas, updateStatusSchema, type AiChunk, type ImportProgress, type UpdateStatus, type UtilityOperation } from "@/shared/ipc";

protocol.registerSchemesAsPrivileged([{ scheme: "margin-reader", privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: false, stream: true } }]);

type RpcResponse = { id: string; ok: true; result: unknown } | { id: string; ok: false; error: string };
type UtilityEvent = { type: "event"; channel: "ai" | "import"; payload: AiChunk | ImportProgress };

let mainWindow: BrowserWindow | null = null;
let utility: UtilityProcess | null = null;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const activeAiByWindow = new Map<number, string>();
const aiStartsByWindow = new Map<number, number[]>();
let updateTimer: ReturnType<typeof setInterval> | undefined;

const appProtocolRoot = () => path.join(__dirname, "../renderer/main_window");
const credentialPath = () => path.join(app.getPath("userData"), "credentials.bin");

app.setName("Margin Reader");

app.whenReady().then(async () => {
  registerProtocol();
  lockDownSession();
  startUtility();
  registerIpc();
  createMenu();
  createWindow();
  configureUpdates();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow?.show();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (updateTimer) clearInterval(updateTimer);
  utility?.kill();
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 480,
    minHeight: 560,
    show: false,
    backgroundColor: "#f3eee3",
    title: "Margin Reader",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  mainWindow = window;
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; activeAiByWindow.delete(window.webContents.id); });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isApplicationUrl(url)) event.preventDefault();
  });
  const devUrl = process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL;
  if (!app.isPackaged && devUrl) void window.loadURL(devUrl);
  else void window.loadURL("margin-reader://app/library");
}

function registerProtocol() {
  protocol.handle("margin-reader", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== "app") return new Response("Not found", { status: 404 });
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes("\0") || decoded.split("/").some((part) => part === "..")) return new Response("Invalid path", { status: 400 });
      const bookMatch = /^\/books\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/original\.epub$/i.exec(decoded);
      if (bookMatch) {
        const file = path.join(app.getPath("userData"), "books", bookMatch[1], "original.epub");
        if (!existsSync(file)) return new Response("Book not found", { status: 404 });
        return new Response(readFileSync(file), { headers: securityHeaders("application/epub+zip") });
      }
      const root = appProtocolRoot();
      const requested = decoded === "/" ? "index.html" : decoded.slice(1);
      let file = path.resolve(root, requested);
      if (!file.startsWith(`${path.resolve(root)}${path.sep}`) && file !== path.resolve(root, "index.html")) return new Response("Invalid path", { status: 400 });
      if (!existsSync(file) || !path.extname(file)) file = path.join(root, "index.html");
      return new Response(readFileSync(file), { headers: securityHeaders(contentType(file)) });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function securityHeaders(type: string) {
  return {
    "content-type": type,
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  };
}

function contentType(file: string) {
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" } as Record<string, string>)[path.extname(file)] ?? "application/octet-stream";
}

function lockDownSession() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const allowed = url.protocol === "margin-reader:" || (!app.isPackaged && process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL?.startsWith(url.origin));
    callback({ cancel: !allowed });
  });
}

function startUtility() {
  const script = path.join(__dirname, "utility.js");
  const nativeBinding = process.env.MARGIN_READER_SQLITE_BINDING_OVERRIDE ?? (app.isPackaged ? path.join(process.resourcesPath, "better_sqlite3.node") : path.join(process.cwd(), "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"));
  utility = utilityProcess.fork(script, [], { env: { ...process.env, MARGIN_READER_USER_DATA: app.getPath("userData"), MARGIN_READER_SQLITE_BINDING: nativeBinding }, stdio: "pipe", serviceName: "Margin Reader Local Service" });
  utility.stdout?.on("data", (data: Buffer) => console.info(`[local-service] ${data.toString().trim()}`));
  utility.stderr?.on("data", (data: Buffer) => console.error(`[local-service] ${data.toString().trim()}`));
  utility.on("message", (raw) => {
    const message = raw as RpcResponse | UtilityEvent;
    if ("type" in message && message.type === "event") {
      if (message.channel === "ai") {
        const chunk = aiChunkSchema.parse(message.payload);
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send("margin:ai-chunk", chunk);
        if (chunk.type === "done" || chunk.type === "error") {
          for (const [windowId, requestId] of activeAiByWindow) if (requestId === chunk.requestId) activeAiByWindow.delete(windowId);
        }
      } else {
        const progress = importProgressSchema.parse(message.payload);
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send("margin:import-progress", progress);
      }
      return;
    }
    const rpc = message as RpcResponse;
    const waiter = pending.get(rpc.id);
    if (!waiter) return;
    pending.delete(rpc.id);
    if (rpc.ok) waiter.resolve(rpc.result); else waiter.reject(new Error(rpc.error));
  });
  utility.on("exit", (code) => {
    console.error(`[local-service] exited with code ${code}`);
    utility = null;
    for (const waiter of pending.values()) waiter.reject(new Error(`Local service stopped (${code}).`));
    pending.clear();
  });
}

function utilityCall(operation: UtilityOperation, payload: unknown) {
  if (!utility) return Promise.reject(new Error("Local service is not ready."));
  const id = crypto.randomUUID();
  return new Promise<unknown>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    utility!.postMessage({ id, operation, payload });
  });
}

function registerIpc() {
  const forwarded: UtilityOperation[] = ["library.list", "library.get", "library.import", "library.delete", "reader.getProgress", "reader.saveProgress", "highlights.list", "highlights.create", "highlights.update", "highlights.delete", "conversations.load", "conversations.save", "conversations.delete"];
  ipcMain.handle("margin:invoke", async (event, operation: UtilityOperation, raw: unknown) => {
    assertTrusted(event);
    if (!forwarded.includes(operation)) throw new Error("Operation is not available.");
    return utilityCall(operation, requestSchemas[operation].parse(raw));
  });
  ipcMain.handle("margin:choose-import", async (event, sourcePath?: string) => {
    assertTrusted(event);
    let selectedPath = sourcePath;
    if (!selectedPath) {
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, { title: "Add an EPUB", properties: ["openFile"], filters: [{ name: "EPUB books", extensions: ["epub"] }] });
      if (result.canceled) return null;
      selectedPath = result.filePaths[0];
    }
    return utilityCall("library.import", requestSchemas["library.import"].parse({ path: selectedPath }));
  });
  ipcMain.handle("margin:export-notes", async (event, raw: unknown) => {
    assertTrusted(event);
    const input = requestSchemas["notes.export"].parse(raw);
    const exported = await utilityCall("notes.export", input) as { content: string; suggestedName: string };
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, { defaultPath: exported.suggestedName });
    if (result.canceled || !result.filePath) return false;
    writeFileSync(result.filePath, exported.content, { mode: 0o600 });
    return true;
  });
  ipcMain.handle("margin:credentials-status", (event) => {
    assertTrusted(event);
    return credentialStatusSchema.parse({ configured: existsSync(credentialPath()), encryptionAvailable: safeStorage.isEncryptionAvailable() });
  });
  ipcMain.handle("margin:credentials-set", (event, apiKey: string) => {
    assertTrusted(event);
    if (!safeStorage.isEncryptionAvailable()) throw new Error("macOS Keychain encryption is unavailable. The key was not saved.");
    const validatedKey = credentialInputSchema.parse(apiKey);
    writeFileSync(credentialPath(), safeStorage.encryptString(validatedKey), { mode: 0o600 });
  });
  ipcMain.handle("margin:credentials-clear", (event) => {
    assertTrusted(event);
    if (existsSync(credentialPath())) unlinkSync(credentialPath());
  });
  ipcMain.handle("margin:credentials-test", async (event) => {
    assertTrusted(event);
    const apiKey = readCredential();
    return utilityCall("credentials.test", { apiKey });
  });
  ipcMain.handle("margin:ai-start", async (event, raw: unknown) => {
    assertTrusted(event);
    const request = requestSchemas["ai.start"].omit({ apiKey: true }).parse(raw);
    const windowId = event.sender.id;
    if (activeAiByWindow.has(windowId)) throw new Error("Finish or cancel the current answer first.");
    const starts = aiStartsByWindow.get(windowId) ?? [];
    const recent = starts.filter((time) => time > Date.now() - 60_000);
    if (recent.length >= 20) throw new Error("AI request limit reached. Please wait a moment.");
    recent.push(Date.now());
    aiStartsByWindow.set(windowId, recent);
    const apiKey = readCredential();
    activeAiByWindow.set(windowId, request.requestId);
    try { return await utilityCall("ai.start", { ...request, apiKey }); }
    catch (error) { activeAiByWindow.delete(windowId); throw error; }
  });
  ipcMain.handle("margin:ai-cancel", async (event, raw: unknown) => {
    assertTrusted(event);
    const input = requestSchemas["ai.cancel"].parse(raw);
    if (activeAiByWindow.get(event.sender.id) !== input.requestId) return;
    await utilityCall("ai.cancel", input);
    activeAiByWindow.delete(event.sender.id);
  });
  ipcMain.handle("margin:updates-check", async (event) => { assertTrusted(event); await checkForUpdates(); });
  ipcMain.handle("margin:updates-install", (event) => { assertTrusted(event); autoUpdater.quitAndInstall(); });
}

function readCredential() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("macOS Keychain encryption is unavailable.");
  if (!existsSync(credentialPath())) throw new Error("Add your Gemini API key in Settings first.");
  const encrypted = readFileSync(credentialPath());
  if (!encrypted.byteLength) throw new Error("Add your Gemini API key in Settings first.");
  return safeStorage.decryptString(encrypted);
}

function assertTrusted(event: IpcMainInvokeEvent) {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame || !isApplicationUrl(frame.url)) throw new Error("Untrusted IPC sender.");
}

function isApplicationUrl(value: string) {
  if (value.startsWith("margin-reader://app/")) return true;
  const devUrl = process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL;
  return !app.isPackaged && Boolean(devUrl && value.startsWith(devUrl));
}

function isAllowedExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith("/lichen0114/margin-reader");
  } catch { return false; }
}

function createMenu() {
  const sendCommand = (command: "import" | "settings" | "search") => mainWindow?.webContents.send("margin:command", command);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Margin Reader", submenu: [{ role: "about" }, { type: "separator" }, { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => sendCommand("settings") }, { type: "separator" }, { role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] },
    { label: "File", submenu: [{ label: "Add EPUB…", accelerator: "CmdOrCtrl+O", click: () => sendCommand("import") }, { type: "separator" }, { role: "close" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }, { type: "separator" }, { label: "Search", accelerator: "CmdOrCtrl+K", click: () => sendCommand("search") }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }] }
  ]));
}

function configureUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.setFeedURL({ url: `https://update.electronjs.org/lichen0114/margin-reader/darwin-arm64/${app.getVersion()}` });
  autoUpdater.on("checking-for-update", () => updateStatus({ state: "checking" }));
  autoUpdater.on("update-available", () => updateStatus({ state: "available" }));
  autoUpdater.on("update-not-available", () => updateStatus({ state: "not-available" }));
  autoUpdater.on("update-downloaded", (_event, _notes, version) => updateStatus({ state: "downloaded", version }));
  autoUpdater.on("error", (error) => updateStatus({ state: "error", message: error.message.slice(0, 300) }));
  setTimeout(() => void checkForUpdates(), 15_000);
  updateTimer = setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1_000);
}

async function checkForUpdates() {
  if (!app.isPackaged) { updateStatus({ state: "not-available", message: "Updates are checked in packaged builds." }); return; }
  autoUpdater.checkForUpdates();
}

function updateStatus(status: UpdateStatus) {
  const validated = updateStatusSchema.parse(status);
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("margin:update-status", validated);
}
