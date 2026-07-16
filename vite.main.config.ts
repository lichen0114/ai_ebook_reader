import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ["better-sqlite3"]
    }
  }
});
