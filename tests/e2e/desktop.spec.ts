import { _electron as electron, expect, test } from "@playwright/test";
import { FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const executable = path.join(process.cwd(), "out/Margin Reader-darwin-arm64/Margin Reader.app/Contents/MacOS/Margin Reader");

test("sandboxed desktop app imports and restores a local EPUB", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "margin-reader-e2e-"));
  const application = await electron.launch({ args: [path.join(process.cwd(), ".vite/build/main.js"), `--user-data-dir=${userData}`], env: { ...process.env, MARGIN_READER_TEST_OLLAMA_UNAVAILABLE: "1", MARGIN_READER_SQLITE_BINDING_OVERRIDE: path.join(process.cwd(), "out/Margin Reader-darwin-arm64/Margin Reader.app/Contents/Resources/better_sqlite3.node") } });
  application.process().stdout?.pipe(process.stdout);
  application.process().stderr?.pipe(process.stderr);
  try {
    const page = await application.firstWindow();
    await expect(page.getByRole("heading", { name: "Pages worth returning to." })).toBeVisible();
    expect(await page.evaluate(() => ({ process: typeof process, require: typeof require, api: typeof window.marginReader }))).toEqual({ process: "undefined", require: "undefined", api: "object" });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    const ollamaProvider = settings.getByRole("button", { name: /Local on this Mac Ollama/ });
    await expect(ollamaProvider).toHaveAttribute("aria-pressed", "true");
    await expect(settings.getByText("Not detected at 127.0.0.1:11434")).toBeVisible();
    await expect(settings.getByText("Install or open Ollama first.")).toBeVisible();
    await expect(settings.getByText(/macOS Sonoma 14/)).toBeVisible();
    await expect(settings.getByRole("button", { name: "Open official Ollama download" })).toBeVisible();
    await settings.getByRole("button", { name: /Gemini/ }).click();
    await expect(settings.getByLabel("Gemini API key")).toBeVisible();
    await ollamaProvider.click();
    await settings.getByRole("button", { name: "Close settings" }).click();
    await expect(page.getByText("Install or open Ollama to use local AI.")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles("public/books/alice.epub");
    await expect(page.getByText("Ready to read", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByText("Ready to read", { exact: true }).click();
    await expect(page.locator("[data-testid=epub-view] iframe")).toBeVisible();
    const bookParagraphs = page.frameLocator("[data-testid=epub-view] iframe").locator("article > p");
    await expect(bookParagraphs.first()).toHaveCSS("text-align", "justify");
    await expect(bookParagraphs.first()).toHaveCSS("text-align-last", "left");
    await expect(bookParagraphs.first()).toHaveCSS("hyphens", "auto");

    const reader = page.locator(".reader-shell");
    await expect(reader).toHaveAttribute("data-reader-theme", "paper");
    await page.getByRole("button", { name: "Reading appearance" }).click();
    const appearance = page.getByRole("dialog", { name: "Reading appearance" });
    await expect(appearance).toBeVisible();
    await expectReadable(appearance.getByRole("heading", { name: "Reading appearance" }), "appearance heading");
    await expectReadable(appearance.getByText("Text size", { exact: false }), "text-size label");
    await expectReadable(appearance.locator("label span").first(), "text-size value");
    await expectReadable(appearance.getByRole("button", { name: "Serif" }), "font choice");
    await expect(appearance.getByRole("button", { name: "Serif" })).toHaveAttribute("aria-pressed", "true");

    const chromeBeforeThemeChange = await reader.locator(":scope > header").evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
      border: getComputedStyle(element).borderBottomColor,
    }));

    await appearance.getByRole("button", { name: "Light theme" }).click();
    await expect(reader).toHaveAttribute("data-reader-theme", "light");
    await expect(reader).toHaveCSS("background-color", "rgb(251, 250, 247)");
    await expect(page.frameLocator("[data-testid=epub-view] iframe").locator("body")).toHaveCSS("background-color", "rgb(251, 250, 247)");
    await appearance.getByRole("button", { name: "Paper theme" }).click();
    await expect(reader).toHaveAttribute("data-reader-theme", "paper");
    await expect(reader).toHaveCSS("background-color", "rgb(245, 240, 231)");
    await appearance.getByRole("button", { name: "Dark theme" }).click();
    await expect(reader).toHaveAttribute("data-reader-theme", "dark");
    await expect(reader).toHaveCSS("background-color", "rgb(32, 33, 31)");
    await expect(page.frameLocator("[data-testid=epub-view] iframe").locator("body")).toHaveCSS("background-color", "rgb(32, 33, 31)");
    await expect.poll(() => reader.locator(":scope > header").evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
      border: getComputedStyle(element).borderBottomColor,
    }))).toEqual(chromeBeforeThemeChange);
    await expect(appearance.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
    await expectReadable(appearance.getByRole("button", { name: "Dark theme" }), "dark-theme choice");
    await expectReadable(page.locator(".native-titlebar"), "native title bar");
    await appearance.getByRole("button", { name: "Close reading appearance" }).click();

    await expectReadable(reader.locator(":scope > header p"), "reader header");
    await expectReadable(page.getByRole("tab", { name: "Contents" }), "contents tab");
    await expectReadable(page.getByRole("navigation", { name: "Book navigation" }).locator("ol button").first(), "contents entry");
    await expectReadable(page.getByRole("button", { name: "Previous page" }), "previous-page control");
    await expectReadable(page.getByRole("button", { name: "Next page" }), "next-page control");

    await page.getByRole("button", { name: "Search book" }).click();
    const searchDialog = page.getByRole("dialog", { name: "Search book" });
    await expectReadable(searchDialog.getByRole("textbox", { name: "Search chapter titles" }), "search input");
    const searchResults = searchDialog.getByLabel("Search results");
    const firstResult = searchResults.locator("button").first();
    await expectReadable(firstResult, "search result");
    const firstChapterTitle = (await firstResult.innerText()).trim();
    await searchDialog.getByRole("textbox", { name: "Search chapter titles" }).fill(firstChapterTitle);
    await expect(searchResults.getByRole("button", { name: firstChapterTitle, exact: true })).toBeVisible();
    await searchResults.getByRole("button", { name: firstChapterTitle, exact: true }).click();
    await expect(searchDialog).toBeHidden();
    await page.getByRole("button", { name: "Search book" }).click();
    await page.keyboard.press("Escape");
    await expect(searchDialog).toBeHidden();

    await page.getByRole("button", { name: "Toggle intelligent margin" }).click();
    const intelligentMargin = page.getByRole("complementary", { name: "Intelligent margin" });
    await expect(intelligentMargin).toBeVisible();
    await expectReadable(intelligentMargin.getByText("Intelligent margin", { exact: true }), "intelligent-margin heading");
    await expectReadable(intelligentMargin.getByText(/Grounded in/), "intelligent-margin subtitle");
    await expectReadable(intelligentMargin.getByLabel("Scope"), "scope control");
    await expectReadable(intelligentMargin.getByRole("heading", { name: /A little help/ }), "intelligent-margin empty state");
    await expect(intelligentMargin.getByText("Permitted excerpts go only to Ollama on this Mac.")).toBeVisible();
    await intelligentMargin.getByRole("button", { name: "Close intelligent margin" }).click();

    await page.getByRole("link", { name: "Back to library" }).click();
    await expect(page.getByRole("heading", { name: "Pages worth returning to." })).toBeVisible();
    await page.getByText("Ready to read", { exact: true }).click();
    await expect(page.locator("[data-testid=epub-view] iframe")).toBeVisible();
    await expect(page.locator(".reader-shell")).toHaveAttribute("data-reader-theme", "dark");

    const compactWindow = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(480, 700);
      return { minimum: window.getMinimumSize(), bounds: window.getBounds() };
    });
    expect(compactWindow).toEqual({ minimum: [480, 560], bounds: expect.objectContaining({ width: 480, height: 700 }) });
    await page.getByRole("button", { name: "Open table of contents" }).click();
    const contentsSheet = page.getByRole("dialog", { name: "Contents" });
    await expectReadable(contentsSheet.getByRole("heading", { name: "Contents" }), "compact contents heading");
    await expectReadable(contentsSheet.getByRole("tab", { name: "Contents" }), "compact contents tab");
    await contentsSheet.locator("ol button").first().click();
    await expect(contentsSheet).toBeHidden();
    await page.getByRole("button", { name: "Reading appearance" }).click();
    const compactAppearance = page.getByRole("dialog", { name: "Reading appearance" });
    await expect(compactAppearance).toBeVisible();
    await expectReadable(compactAppearance.getByRole("heading", { name: "Reading appearance" }), "compact appearance heading");
    await expectReadable(compactAppearance.getByRole("button", { name: "Paginated" }), "compact page-flow choice");
    await compactAppearance.getByRole("button", { name: "Close reading appearance" }).click();
    await expect(page.locator(".reader-shell")).toHaveAttribute("data-reader-theme", "dark");
    await expect.poll(() => page.evaluate(() => ({ innerWidth, scrollWidth: document.documentElement.scrollWidth }))).toEqual({ innerWidth: 480, scrollWidth: 480 });
    const restoredParagraphs = page.frameLocator("[data-testid=epub-view] iframe").locator("article > p");
    await expect(restoredParagraphs.first()).toBeVisible();
    await expect.poll(() => restoredParagraphs.evaluateAll((paragraphs) => paragraphs.every((paragraph) => paragraph.scrollWidth <= paragraph.clientWidth))).toBe(true);

    await selectBookText(page, 0, 8, 52);
    const selectionToolbar = page.getByRole("toolbar", { name: "Selected text actions" });
    await expect(selectionToolbar).toBeVisible();
    for (const action of ["Highlight", "Note", "Explain", "Define", "Translate", "Ask"]) {
      await expect(selectionToolbar.getByRole("button", { name: action, exact: true })).toBeVisible();
    }
    await expect(selectionToolbar.getByRole("button", { name: "Close selected text actions" })).toBeVisible();
    expect(await selectionToolbar.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll("button")];
      return {
        withinViewport: bounds.left >= 12 && bounds.right <= innerWidth - 12 && bounds.top >= 12 && bounds.bottom <= innerHeight - 12,
        noHorizontalOverflow: element.scrollWidth <= element.clientWidth,
        everyControlContained: buttons.every((button) => {
          const control = button.getBoundingClientRect();
          return control.left >= bounds.left && control.right <= bounds.right;
        }),
      };
    })).toEqual({ withinViewport: true, noHorizontalOverflow: true, everyControlContained: true });

    await selectionToolbar.getByRole("button", { name: "Note", exact: true }).click();
    const noteEditor = selectionToolbar.getByRole("textbox", { name: "Note on this passage" });
    await expect(noteEditor).toBeFocused();
    await noteEditor.fill("A note that makes the command bar taller.");
    await expect(selectionToolbar).toBeVisible();
    await expect(selectionToolbar.getByRole("button", { name: "Close selected text actions" })).toBeVisible();
    await selectionToolbar.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(selectionToolbar.getByRole("button", { name: "Explain", exact: true })).toBeVisible();
    expect(await selectedBookText(page)).not.toBe("");

    const bookBody = page.frameLocator("[data-testid=epub-view] iframe").locator("body");
    await bookBody.click({ position: { x: 8, y: 8 } });
    await expect(selectionToolbar).toBeHidden();
    await expect.poll(() => selectedBookText(page)).toBe("");

    await selectBookText(page, 0, 4, 36);
    await expect(selectionToolbar).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(selectionToolbar).toBeHidden();
    await expect.poll(() => selectedBookText(page)).toBe("");

    await selectBookText(page, 0, 12, 46);
    await expect(selectionToolbar).toBeVisible();
    await selectionToolbar.getByRole("button", { name: "Close selected text actions" }).click();
    await expect(selectionToolbar).toBeHidden();
    await expect.poll(() => selectedBookText(page)).toBe("");

    await selectBookText(page, 0, 2, 26);
    const firstPassage = await selectedBookText(page);
    await selectBookText(page, 1, 5, 42);
    const replacementPassage = await selectedBookText(page);
    expect(replacementPassage).not.toBe(firstPassage);
    await expect(selectionToolbar).toHaveCount(1);

    await bookBody.click({ button: "right", position: { x: 8, y: 8 } });
    await expect(selectionToolbar).toBeHidden();
    await expect.poll(() => selectedBookText(page)).toBe("");
    expect(await bookBody.evaluate((body) => body.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 })))).toBe(true);
  } finally {
    await closeApplication(application);
    rmSync(userData, { recursive: true, force: true });
  }
});

test("renderer permissions and popups are denied", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "margin-reader-e2e-"));
  const application = await electron.launch({ args: [path.join(process.cwd(), ".vite/build/main.js"), `--user-data-dir=${userData}`], env: { ...process.env, MARGIN_READER_TEST_OLLAMA_UNAVAILABLE: "1", MARGIN_READER_SQLITE_BINDING_OVERRIDE: path.join(process.cwd(), "out/Margin Reader-darwin-arm64/Margin Reader.app/Contents/Resources/better_sqlite3.node") } });
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
  const child = application.process();
  try { await application.evaluate(({ app }) => app.exit(0)); } catch { /* connection closes during exit */ }
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); resolve(); }, 5_000);
    child.once("exit", () => { clearTimeout(timeout); resolve(); });
  });
}

async function selectBookText(page: import("@playwright/test").Page, paragraphIndex: number, start: number, end: number) {
  const paragraph = page.frameLocator("[data-testid=epub-view] iframe").locator("article > p").nth(paragraphIndex);
  await paragraph.evaluate((element, offsets) => {
    const document = element.ownerDocument;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode && !textNode.textContent?.trim()) textNode = walker.nextNode();
    if (!textNode?.textContent) throw new Error("The fixture paragraph has no selectable text.");
    const range = document.createRange();
    range.setStart(textNode, Math.min(offsets.start, textNode.textContent.length - 1));
    range.setEnd(textNode, Math.min(offsets.end, textNode.textContent.length));
    const selection = document.defaultView?.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, { start, end });
}

async function selectedBookText(page: import("@playwright/test").Page) {
  return page.frameLocator("[data-testid=epub-view] iframe").locator("body").evaluate((body) => body.ownerDocument.defaultView?.getSelection()?.toString() ?? "");
}

async function expectReadable(locator: import("@playwright/test").Locator, label: string, minimum = 4.5) {
  const result = await locator.evaluate((element) => {
    type Color = { red: number; green: number; blue: number; alpha: number };
    const parse = (value: string): Color => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      if (value.startsWith("color(")) {
        return { red: (channels[0] ?? 0) * 255, green: (channels[1] ?? 0) * 255, blue: (channels[2] ?? 0) * 255, alpha: channels[3] ?? 1 };
      }
      return { red: channels[0] ?? 0, green: channels[1] ?? 0, blue: channels[2] ?? 0, alpha: channels[3] ?? 1 };
    };
    const composite = (top: Color, bottom: Color): Color => {
      const alpha = top.alpha + bottom.alpha * (1 - top.alpha);
      if (!alpha) return { red: 0, green: 0, blue: 0, alpha: 0 };
      return {
        red: (top.red * top.alpha + bottom.red * bottom.alpha * (1 - top.alpha)) / alpha,
        green: (top.green * top.alpha + bottom.green * bottom.alpha * (1 - top.alpha)) / alpha,
        blue: (top.blue * top.alpha + bottom.blue * bottom.alpha * (1 - top.alpha)) / alpha,
        alpha,
      };
    };
    let background: Color = { red: 0, green: 0, blue: 0, alpha: 0 };
    let current: Element | null = element;
    const backgroundLayers: string[] = [];
    while (current && background.alpha < 0.999) {
      const layer = getComputedStyle(current).backgroundColor;
      backgroundLayers.push(layer);
      background = composite(background, parse(layer));
      current = current.parentElement;
    }
    const foregroundColor = getComputedStyle(element).color;
    const foreground = composite(parse(foregroundColor), background);
    const luminance = (color: Color) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue);
    };
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return { ratio: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05), foregroundColor, backgroundLayers };
  });
  expect(result.ratio, `${label} contrast ratio (${result.foregroundColor} on ${result.backgroundLayers.join(" over ")})`).toBeGreaterThanOrEqual(minimum);
}

test("packaged app has the production security fuses", async () => {
  const fuses = await getCurrentFuseWire(executable);
  expect(fuses[FuseV1Options.RunAsNode]).toBe(48);
  expect(fuses[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(48);
  expect(fuses[FuseV1Options.EnableNodeCliInspectArguments]).toBe(48);
  expect(fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(49);
  expect(fuses[FuseV1Options.OnlyLoadAppFromAsar]).toBe(49);
});
