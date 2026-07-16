import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectStore, StoredObjectMetadata } from "./object-store";

export class LocalObjectStore implements ObjectStore {
  constructor(private readonly root = path.join(process.cwd(), "public", "uploads")) {}
  private file(key: string) {
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/\.\./g, "_");
    return path.join(this.root, safe);
  }
  async put(key: string, data: Uint8Array, contentType: string) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return { key, size: data.byteLength, contentType, uploadedAt: new Date() };
  }
  async getUrl(key: string) { return `/uploads/${key.split("/").map(encodeURIComponent).join("/")}`; }
  async get(key: string) { return new Uint8Array(await readFile(this.file(key))); }
  async delete(key: string) { await unlink(this.file(key)).catch(() => undefined); }
  async metadata(key: string): Promise<StoredObjectMetadata | null> {
    try { const value = await stat(this.file(key)); return { key, size: value.size, contentType: "application/epub+zip", uploadedAt: value.birthtime }; } catch { return null; }
  }
}
