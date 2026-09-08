import { defineConfig, devices } from "@playwright/test";

const useStandalone = process.env.E2E_USE_STANDALONE === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: useStandalone
      ? "node scripts/start-e2e.mjs"
      : "node scripts/start-e2e.mjs --dev",
    url: "http://localhost:3100/login",
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(process.env.E2E_CROSS_BROWSER === "1" ? [
      { name: "firefox", testMatch: "**/restaurant-browser-accessibility.spec.ts", use: { ...devices["Desktop Firefox"] } },
      { name: "webkit", testMatch: "**/restaurant-browser-accessibility.spec.ts", use: { ...devices["Desktop Safari"], baseURL: "https://localhost:3443", ignoreHTTPSErrors: true } },
    ] : []),
  ],
});
