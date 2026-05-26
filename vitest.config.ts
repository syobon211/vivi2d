import { defineConfig } from "vitest/config";
import { makeAliases } from "./vite.aliases";

export default defineConfig({
  resolve: {
    alias: makeAliases(__dirname),
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["src/test/setup.ts"],
    include: [
      "src/**/__tests__/**/*.test.{ts,tsx}",
      "packages/*/src/__tests__/**/*.test.{ts,tsx}",
      "electron/__tests__/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
    ],
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/e2e/**",
      "**/*.spec.ts",
    ],
    testTimeout: 10_000,
    clearMocks: true,
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**",
        "src/stores/**",
        "src/hooks/**",
        "src/components/**",
        "packages/core/src/**",
        "packages/editor-core/src/**",
        "packages/loader/src/**",
        "packages/model/src/**",
        "packages/runtime/src/**",
        "packages/runtime-wasm/src/**",
        "packages/renderer-pixi/src/**",
        "packages/renderer-three/src/**",
        "packages/renderer-phaser/src/**",
        "packages/provider-comfyui/src/**",
        "packages/viewer/src/**",
        "packages/web/src/**",
        "electron/security.cjs",
      ],
      exclude: [
        "**/__tests__/**",
        "src/test/**",
        "**/*.d.ts",
        "**/*.bench.ts",
        "src/components/Canvas.tsx",
      ],
      thresholds: {
        // Current OSS-readiness baseline refreshed on 2026-05-07. Raise these
        // only after adding tests or excluding code covered by another gate.
        statements: 84,
        branches: 74,
        functions: 87,
        lines: 85,
        "packages/core/src/**": {
          statements: 86,
          branches: 75,
          functions: 89,
          lines: 87,
        },
        "packages/renderer-pixi/src/**": {
          statements: 61,
          branches: 42,
          functions: 71,
          lines: 63,
        },
        "packages/provider-comfyui/src/**": {
          statements: 87,
          branches: 82,
          functions: 87,
          lines: 88,
        },
        "packages/viewer/src/**": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
