import { getConfig } from "@/lib/config";
import { LocalObjectStore } from "./local-store";
import { VercelBlobStore } from "./vercel-blob-store";

export function getObjectStore() {
  const { BLOB_READ_WRITE_TOKEN } = getConfig();
  return BLOB_READ_WRITE_TOKEN ? new VercelBlobStore(BLOB_READ_WRITE_TOKEN) : new LocalObjectStore();
}
