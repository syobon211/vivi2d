import { defineConfig } from "@playwright/test";

export const viewerApiBrowserSamplePort = 5177;

export default defineConfig({
  reporter: "list",
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${viewerApiBrowserSamplePort}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${viewerApiBrowserSamplePort}`,
    cwd: ".",
    reuseExistingServer: false,
    timeout: 60_000,
    url: `http://127.0.0.1:${viewerApiBrowserSamplePort}`,
  },
});
