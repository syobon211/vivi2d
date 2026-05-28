import { resolve } from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { makeAliases } from "../../vite.aliases";

export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  resolve: {
    alias: makeAliases(resolve(__dirname, "../..")),
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
