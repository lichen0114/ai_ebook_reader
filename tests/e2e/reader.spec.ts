import { expect, test, type Page } from "@playwright/test";

async function openReader(page: Page) {
  await page.goto("/library");
  await page.getByRole("link", { name: /A public-domain edition Alice/ }).click();
  await expect(page.frameLocator("iframe").getByRole("heading", { name: "I. Down the Rabbit-Hole" })).toBeVisible();
}

async function selectWord(page: Page) {
  await page.frameLocator("iframe").getByText(/Once or twice she had peeped/).dblclick();
  await expect(page.getByRole("toolbar", { name: "Selected passage actions" })).toBeVisible();
}

test("library loads the seeded public-domain book", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Pick up where the page left you." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alice’s Adventures in Wonderland", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /A public-domain edition Alice/ })).toContainText("Ready to read");
});

test("a DRM-free EPUB upload advances through processing to ready", async ({ page }) => {
  await page.goto("/library");
  await page.locator('input[type="file"]').setInputFiles("public/books/alice.epub");
  const uploadedBooks = page.getByRole("region", { name: "Uploaded books" });
  const card = uploadedBooks.getByText("AI indexing", { exact: true }).or(uploadedBooks.getByText("Ready to read", { exact: true }));
  await expect(card).toBeVisible();
  const readyBook = uploadedBooks.getByRole("link").filter({ hasText: "Ready to read" });
  await expect(readyBook).toBeVisible();

  const href = await readyBook.getAttribute("href");
  expect(href).toMatch(/^\/reader\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);

  await readyBook.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.frameLocator("iframe").getByRole("heading", { name: "I. Down the Rabbit-Hole" })).toBeVisible();
});

test("an unknown uploaded-book UUID returns 404", async ({ page }) => {
  await page.goto("/reader/11111111-1111-4111-8111-111111111111");
  await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
});

test("reader opens and table-of-contents navigation works", async ({ page }) => {
  await openReader(page);
  await page.getByRole("button", { name: /II\. The Pool of Tears/ }).click();
  await expect(page.frameLocator("iframe").getByRole("heading", { name: "II. The Pool of Tears" })).toBeVisible();
});

test("reading progress restores the exact EPUB location after reload", async ({ page }) => {
  await openReader(page);
  await page.getByRole("button", { name: /III\. A Caucus-Race/ }).click();
  await expect(page.frameLocator("iframe").getByRole("heading", { name: /III\. A Caucus-Race/ })).toBeVisible();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.frameLocator("iframe").getByRole("heading", { name: /III\. A Caucus-Race/ })).toBeVisible();
});

test("selection Explain streams a deterministic answer with typed citations", async ({ page }) => {
  await openReader(page); await selectWord(page);
  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByRole("complementary", { name: "Intelligent margin" })).toBeVisible();
  await expect(page.getByText("Evidence ready")).toBeVisible();
  await expect(page.getByRole("button", { name: /Open source 1/ })).toBeVisible();
  await expect(page.getByText(/Alice is restless with passive reading/)).toBeVisible();
});

test("citation navigation exposes Back to answer and restores the response", async ({ page }) => {
  await openReader(page); await selectWord(page); await page.getByRole("button", { name: "Explain" }).click();
  await page.getByRole("button", { name: /Open source 1/ }).click();
  await expect(page.getByRole("button", { name: "Back to answer" })).toBeVisible();
  await page.getByRole("button", { name: "Back to answer" }).click();
  await expect(page.getByText("What this means")).toBeVisible();
});

test("a highlight persists after reload", async ({ page }) => {
  await openReader(page); await selectWord(page); await Promise.all([page.waitForResponse((response) => response.url().includes("/highlights") && response.request().method() === "POST"), page.getByRole("button", { name: "Highlight", exact: true }).click()]);
  await page.reload(); await expect(page.frameLocator("iframe").getByRole("heading", { name: "I. Down the Rabbit-Hole" })).toBeVisible();
  await page.getByRole("button", { name: "Highlights" }).click();
  await expect(page.getByRole("button", { name: /“what”/ })).toBeVisible();
});

test("whole-book scope displays an explicit spoiler warning", async ({ page }) => {
  await openReader(page); await page.getByRole("button", { name: "Open intelligent margin" }).click();
  await page.getByLabel("Scope").selectOption("whole_book");
  await expect(page.getByText("This answer may reveal material beyond your current position.")).toBeVisible();
});

test("read-so-far refuses a later-chapter answer", async ({ page }) => {
  await openReader(page); await page.getByRole("button", { name: "Open intelligent margin" }).click();
  await page.getByLabel("Ask about the book").fill("What happens to Bill in the chimney later?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText("I can’t support that from the permitted part of this book.")).toBeVisible();
});

test("appearance controls change and persist reading settings", async ({ page }) => {
  await openReader(page); await page.getByRole("button", { name: "Reading appearance" }).click();
  await page.getByRole("button", { name: "Sans" }).click(); await page.getByRole("button", { name: "dark theme" }).click();
  await expect(page.locator("main")).toHaveClass(/bg-\[#20211f\]/);
  await page.reload(); await expect(page.locator("main")).toHaveClass(/bg-\[#20211f\]/);
});
