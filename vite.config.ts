import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { makeAliases } from "./vite.aliases";

const publicProfileStubs =
  process.env.VIVI2D_PRIVATE_DEFORMATION_AUTHORING !== "1";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: makeAliases(__dirname, { publicProfileStubs }),
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  worker: {
    format: "es",
  },
  build: {
    // Split large vendor families into stable chunks for better cache reuse.
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("node_modules/pixi.js")) return "vendor-pixi";
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          )
            return "vendor-react";
          if (id.includes("node_modules/ag-psd")) return "vendor-psd";
          if (
            id.includes("node_modules/zustand") ||
            id.includes("node_modules/immer")
          )
            return "vendor-state";
          if (id.includes("node_modules/@msgpack/msgpack"))
            return "vendor-msgpack";
          if (id.includes("node_modules/zod")) return "vendor-zod";
          if (id.includes("node_modules/delaunator"))
            return "vendor-delaunator";
          return undefined;
        },
      },
    },
  },
});
