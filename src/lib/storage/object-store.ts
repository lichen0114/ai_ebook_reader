export type StoredObjectMetadata = { key: string; size: number; contentType: string; uploadedAt: Date };
export interface ObjectStore {
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredObjectMetadata>;
  getUrl(key: string): Promise<string>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  metadata(key: string): Promise<StoredObjectMetadata | null>;
}
