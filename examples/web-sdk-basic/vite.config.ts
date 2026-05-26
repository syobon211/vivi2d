import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoWebDist = path.resolve(
  __dirname,
  "../../packages/web/dist/vivi2d.es.js",
);

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    sourcemap: false,
  },
  resolve: {
    alias: existsSync(monorepoWebDist)
      ? {
          "@vivi2d/web": monorepoWebDist,
        }
      : {},
  },
  root: __dirname,
});
