import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/editor-host/src/__tests__/**/*.test.ts"],
  },
});
