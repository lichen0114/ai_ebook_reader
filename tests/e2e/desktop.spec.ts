import { _electron as electron, expect, test } from "@playwright/test";
import { FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const executable = path.join(process.cwd(), "out/Margin Reader-darwin-arm64/Margin Reader.app/Contents/MacOS/Margin Reader");

test("sandboxed desktop app imports and restores a local EPUB", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "margin-reader-e2e-"));
  const application = await electron.launch({ args: [path.join(process.cwd(), ".vite/build/main.js"), `--user-data-dir=${userData}`], env: { ...process.env, MARGIN_READER_SQLITE_BINDING_OVERRIDE: path.join(process.cwd(), "out/Margin Reader-darwin-arm64/Margin Reader.app/Contents/Resources/better_sqlite3.node") } });
  application.process().stdout?.pipe(process.stdout);
  application.process().stderr?.pipe(process.stderr);
  try {
    const page = await application.firstWindow();
    await expect(page.getByRole("heading", { name: "Pages worth returning to." })).toBeVisible();
    expect(await page.evaluate(() => ({ process: typeof process, require: typeof require, api: typeof window.marginReader }))).toEqual({ process: "undefined", require: "undefined", api: "object" });
    await page.locator('input[type="file"]').setInputFiles("public/books/alice.epub");
    await expect(page.getByText("Ready to read", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByText("Ready to read", { exact: true }).click();
    await expect(page.locator("[data-testid=epub-view] iframe")).toBeVisible();
  } finally {
    await closeApplication(application);
    rmSync(userData, { recursive: true, force: true });
  }
});

test("renderer permissions and popups are denied", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "margin-reader-e2e-"));
  const application = await electron.launch({ args: [path.join(process.cwd(), ".vite/build/main.js"), `--user-data-dir=${userData}`], env: { ...process.env, MARGIN_READER_SQLITE_BINDING_OVERRIDE: path.join(process.cwd(), "out/Margin Reader-darwin-arm64/Margin Reader.app/Contents/Resources/better_sqlite3.node") } });
  try {
    const page = await application.firstWindow();
    expect(await page.evaluate(async () => {
      const popup = window.open("https://example.com");
      let permission = "denied";
      try { permission = await navigator.permissions.query({ name: "geolocation" }).then((value) => value.state); } catch { /* denied */ }
      return { popup: popup === null, permission };
    })).toEqual({ popup: true, permission: "denied" });
  } finally {
    await closeApplication(application);
    rmSync(userData, { recursive: true, force: true });
  }
});

async function closeApplication(application: Awaited<ReturnType<typeof electron.launch>>) {
  application.process().kill("SIGTERM");
}

test("packaged app has the production security fuses", async () => {
  const fuses = await getCurrentFuseWire(executable);
  expect(fuses[FuseV1Options.RunAsNode]).toBe(48);
  expect(fuses[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(48);
  expect(fuses[FuseV1Options.EnableNodeCliInspectArguments]).toBe(48);
  expect(fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(49);
  expect(fuses[FuseV1Options.OnlyLoadAppFromAsar]).toBe(49);
});
