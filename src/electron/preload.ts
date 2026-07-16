import { contextBridge, ipcRenderer, webUtils } from "electron";
import { z } from "zod";
import { aiChunkSchema, aiRequestSchema, aiSettingsSchema, aiStartIpcRequestSchema, appCommandSchema, bookSchema, conversationSchema, credentialInputSchema, credentialStatusSchema, credentialTestResultSchema, highlightSchema, importProgressSchema, ollamaPullProgressSchema, ollamaStatusSchema, progressSchema, responseSchemas, updateStatusSchema, type MarginReaderApi, type UtilityOperation } from "@/shared/ipc";

async function invoke<T>(operation: UtilityOperation, payload: unknown): Promise<T> {
  const result = await ipcRenderer.invoke("margin:invoke", operation, payload);
  return responseSchemas[operation].parse(result) as T;
}

function listen<T>(channel: string, schema: z.ZodType<T>, callback: (value: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, value: unknown) => callback(schema.parse(value));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: MarginReaderApi = {
  library: {
    list: () => invoke("library.list", {}),
    get: (id) => invoke("library.get", { id }),
    importFile: async (file) => {
      const sourcePath = file ? webUtils.getPathForFile(file) : undefined;
      const result = await ipcRenderer.invoke("margin:choose-import", sourcePath);
      return result === null ? null : bookSchema.parse(result);
    },
    delete: async (id) => Boolean((await invoke<{ deleted: boolean }>("library.delete", { id })).deleted)
  },
  reader: {
    getProgress: (bookId) => invoke("reader.getProgress", { bookId }),
    saveProgress: (input) => invoke("reader.saveProgress", progressSchema.omit({ updatedAt: true }).parse(input))
  },
  highlights: {
    list: (bookId) => invoke("highlights.list", { bookId }),
    create: (input) => invoke("highlights.create", highlightSchema.omit({ createdAt: true, updatedAt: true }).parse(input)),
    update: (id, input) => invoke("highlights.update", { id, ...input }),
    delete: async (id) => Boolean((await invoke<{ deleted: boolean }>("highlights.delete", { id })).deleted)
  },
  conversations: {
    load: (bookId) => invoke("conversations.load", { bookId }),
    save: (conversation) => invoke("conversations.save", conversationSchema.parse(conversation)),
    delete: async (id) => Boolean((await invoke<{ deleted: boolean }>("conversations.delete", { id })).deleted)
  },
  notes: { export: async (bookId, format) => z.boolean().parse(await ipcRenderer.invoke("margin:export-notes", { bookId, format })) },
  credentials: {
    status: async () => credentialStatusSchema.parse(await ipcRenderer.invoke("margin:credentials-status")),
    set: async (apiKey) => { await ipcRenderer.invoke("margin:credentials-set", credentialInputSchema.parse(apiKey)); },
    clear: async () => { await ipcRenderer.invoke("margin:credentials-clear"); },
    test: async () => credentialTestResultSchema.parse(await ipcRenderer.invoke("margin:credentials-test"))
  },
  aiSettings: {
    get: async () => aiSettingsSchema.parse(await ipcRenderer.invoke("margin:ai-settings-get")),
    save: async (settings) => aiSettingsSchema.parse(await ipcRenderer.invoke("margin:ai-settings-save", aiSettingsSchema.parse(settings)))
  },
  ollama: {
    status: async () => ollamaStatusSchema.parse(await ipcRenderer.invoke("margin:ollama-status")),
    startPull: async (model) => responseSchemas["ollama.pull.start"].parse(await ipcRenderer.invoke("margin:ollama-pull-start", { model })).requestId,
    cancelPull: async (requestId) => responseSchemas["ollama.pull.cancel"].parse(await ipcRenderer.invoke("margin:ollama-pull-cancel", { requestId })).cancelled,
    deleteModel: async (model) => responseSchemas["ollama.delete"].parse(await ipcRenderer.invoke("margin:ollama-delete", { model })).settings,
    openDownloadPage: async () => { await ipcRenderer.invoke("margin:ollama-open-download"); },
    onPullProgress: (callback) => listen("margin:ollama-pull-progress", ollamaPullProgressSchema, callback)
  },
  ai: {
    start: async (request) => {
      const requestId = crypto.randomUUID();
      await ipcRenderer.invoke("margin:ai-start", aiStartIpcRequestSchema.parse({ ...aiRequestSchema.parse(request), requestId }));
      return requestId;
    },
    cancel: async (requestId) => { await ipcRenderer.invoke("margin:ai-cancel", { requestId }); },
    onChunk: (callback) => listen("margin:ai-chunk", aiChunkSchema, callback)
  },
  imports: { onProgress: (callback) => listen("margin:import-progress", importProgressSchema, callback) },
  updates: {
    check: async () => { await ipcRenderer.invoke("margin:updates-check"); },
    install: async () => { await ipcRenderer.invoke("margin:updates-install"); },
    onStatus: (callback) => listen("margin:update-status", updateStatusSchema, callback)
  },
  app: { onCommand: (callback) => listen("margin:command", appCommandSchema, callback) }
};

contextBridge.exposeInMainWorld("marginReader", Object.freeze(api));
