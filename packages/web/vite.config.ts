import { resolve } from "node:path";
import { defineConfig } from "vite";
import { makeAliases } from "../../vite.aliases";

const buildTarget = process.env.VIVI_WEB_BUILD_TARGET ?? "es";
const rootDir = resolve(__dirname, "../..");
const sourceDir = resolve(__dirname, "src");

export default defineConfig({
  resolve: {
    alias: makeAliases(rootDir),
  },
  build: {
    emptyOutDir: buildTarget === "es",
    lib:
      buildTarget === "umd"
        ? {
            entry: resolve(sourceDir, "auto-register.ts"),
            name: "Vivi2D",
            formats: ["umd"],
            fileName: () => "vivi2d.umd.js",
          }
        : {
            entry: {
              index: resolve(sourceDir, "index.ts"),
              "auto-register": resolve(sourceDir, "auto-register.ts"),
            },
            formats: ["es"],
            fileName: (_format, entryName) =>
              entryName === "index" ? "vivi2d.es.js" : `${entryName}.js`,
          },
    sourcemap: true,
    minify: "esbuild",
  },
});
