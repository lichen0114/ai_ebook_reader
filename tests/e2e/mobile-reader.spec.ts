import { expect, test } from "@playwright/test";

test("mobile reader uses sheets and has no horizontal overflow", async ({ page }) => {
  await page.goto("/reader/alice-in-wonderland");
  await expect(page.frameLocator("iframe").getByRole("heading", { name: "I. Down the Rabbit-Hole" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Open table of contents" }).click();
  await expect(page.getByRole("dialog", { name: "Contents" })).toBeVisible();
});
