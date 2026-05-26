import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoWebDist = path.resolve(
  __dirname,
  "../../packages/web/dist/vivi2d.es.js",
);

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: existsSync(monorepoWebDist)
      ? {
          "@vivi2d/web": monorepoWebDist,
        }
      : {},
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
