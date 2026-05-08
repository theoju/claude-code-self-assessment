import { test, expect } from "@playwright/test";

test.describe("Self-Assessment dashboard", () => {
  test("home page renders header, radar, and priority actions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Claude Code Self-Assessment/i).first()).toBeVisible();
    await expect(page.locator("svg").first()).toBeVisible();
    // Priority actions section heading
    await expect(page.getByRole("heading", { name: /priority actions/i })).toBeVisible();
  });

  test("12 dimension articles render in the detailed readout", async ({ page }) => {
    await page.goto("/");
    const articles = page.locator("article");
    await expect(articles).toHaveCount(12);
  });
});

test.describe("Coverage route", () => {
  test("/coverage renders summary tile and category breakdown", async ({ page }) => {
    await page.goto("/coverage");
    await expect(page.getByText(/Test Coverage/i).first()).toBeVisible();
    // Should show the four core category labels even if "no data yet"
    await expect(page.getByText(/Unit/i).first()).toBeVisible();
    await expect(page.getByText(/Integration/i).first()).toBeVisible();
    await expect(page.getByText(/Performance/i).first()).toBeVisible();
  });
});
