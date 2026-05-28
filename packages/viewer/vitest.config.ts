import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "../../src"),
      "@vivi2d/core": resolve(__dirname, "../core/src"),
      "@vivi2d/model": resolve(__dirname, "../model/src"),
      "@vivi2d/renderer-pixi": resolve(__dirname, "../renderer-pixi/src"),
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: [resolve(__dirname, "../../src/test/setup.ts")],
    include: [
      "src/__tests__/**/*.test.{ts,tsx}",
    ],
    exclude: [
      "**/node_modules/**",
      "**/e2e/**",
      "**/*.spec.ts",
    ],
    testTimeout: 10_000,
    clearMocks: true,
  },
});
