import { defineConfig, devices } from "@playwright/test";

const PORT = 3737;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  reporter: [
    ["list"],
    ["json", { outputFile: "./coverage/playwright.json" }],
    ["html", { open: "never", outputFolder: "./playwright-report" }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
});
