import { defineConfig } from "drizzle-kit";

export default defineConfig({ schema: "./src/lib/db/schema.ts", out: "./drizzle", dialect: "sqlite", dbCredentials: { url: process.env.MARGIN_READER_DATABASE ?? "./.margin-reader-dev/library.sqlite" }, strict: true });
