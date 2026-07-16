import { del, head, put } from "@vercel/blob";
import type { ObjectStore } from "./object-store";

export class VercelBlobStore implements ObjectStore {
  constructor(private readonly token: string) {}
  async put(key: string, data: Uint8Array, contentType: string) {
    await put(key, Buffer.from(data), { access: "public", contentType, token: this.token, addRandomSuffix: false });
    return { key, size: data.byteLength, contentType, uploadedAt: new Date() };
  }
  async getUrl(key: string) { return (await head(key, { token: this.token })).url; }
  async get(key: string) { const response = await fetch(await this.getUrl(key)); return new Uint8Array(await response.arrayBuffer()); }
  async delete(key: string) { await del(key, { token: this.token }); }
  async metadata(key: string) { try { const value = await head(key, { token: this.token }); return { key, size: value.size, contentType: value.contentType, uploadedAt: new Date(value.uploadedAt) }; } catch { return null; } }
}
