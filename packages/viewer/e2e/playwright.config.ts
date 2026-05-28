import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  projects: [
    { name: "viewer-launch", testMatch: /viewer-launch\.spec\.ts/ },
    { name: "viewer-model", testMatch: /viewer-model-load\.spec\.ts/ },
    { name: "viewer-settings", testMatch: /viewer-settings\.spec\.ts/ },
    { name: "viewer-actions", testMatch: /viewer-interaction\.spec\.ts/ },
    { name: "viewer-props", testMatch: /viewer-new-features\.spec\.ts/ },
    { name: "viewer-calibration", testMatch: /viewer-workflow\.spec\.ts/ },
    {
      name: "viewer-api",
      testMatch: /viewer-(?:script-sandbox|api-workflow)\.spec\.ts/,
    },
    {
      name: "viewer-resilience",
      testMatch: /viewer-resilience\.spec\.ts/,
      timeout: 60_000,
    },
    {
      name: "viewer-accessibility",
      testMatch: /viewer-accessibility\.spec\.ts/,
      timeout: 60_000,
    },
    {
      name: "viewer-visual",
      testMatch: /viewer-(?:screenshot|i18n|i18n-visual|i18n-regression)\.spec\.ts/,
      timeout: 60_000,
    },
    {
      name: "viewer-perf",
      testMatch: /viewer-performance\.spec\.ts/,
      timeout: 90_000,
    },
  ],
  use: {
    trace: "on-first-retry",
  },
});
