import { defineConfig } from "@playwright/test";

const port = 5176;

export default defineConfig({
  reporter: "list",
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx vite --config examples/web-sdk-basic/vite.config.ts --host 127.0.0.1 --port ${port}`,
    cwd: "../..",
    reuseExistingServer: false,
    timeout: 60_000,
    url: `http://127.0.0.1:${port}`,
  },
});
