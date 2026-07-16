import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { sourcemap: true }
});
