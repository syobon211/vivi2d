import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, loadConfigFromFile } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = await loadConfigFromFile(
  { command: "build", mode: "production" },
  path.join(root, "vite.config.ts"),
);
if (!config) throw new Error("Missing application build configuration.");
for (const entry of ["local-exchange-host", "local-asset-copy"])
  await build({
    configFile: false,
    root,
    resolve: { alias: config.config.resolve.alias },
    build: {
      target: "node22",
      ssr: path.join(root, `electron/${entry}.ts`),
      outDir: path.join(root, "electron/generated"),
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        external: [
          "electron",
          ...builtinModules,
          ...builtinModules.map((name) => `node:${name}`),
        ],
        output: {
          format: "cjs",
          entryFileNames: `${entry}.cjs`,
          inlineDynamicImports: true,
        },
      },
    },
    ssr: { noExternal: true },
  });
