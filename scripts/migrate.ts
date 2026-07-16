import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const migration = await readFile(path.join(process.cwd(), "drizzle", "0000_margin_reader.sql"), "utf8");
  if (!migration.includes("vector(1536)") || !migration.includes("book_chunks")) throw new Error("Migration integrity check failed.");
  if (!process.env.DATABASE_URL) {
    console.log("Migration SQL validated. DATABASE_URL is unset, so no PostgreSQL server was changed.");
    return;
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  await sql.unsafe(migration);
  await sql.end();
  console.log("Applied drizzle/0000_margin_reader.sql successfully.");
}

main().catch((error: unknown) => { console.error(error); process.exit(1); });
