import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const pagePath = "/__editor-v11-mask-pixels.html";
const server = await createServer({
  configFile: path.join(process.cwd(), "vite.config.ts"),
  plugins: [
    {
      name: "editor-v11-mask-pixels",
      configureServer(vite) {
        vite.middlewares.use(pagePath, (_request, response, next) => {
          void vite
            .transformIndexHtml(
              pagePath,
              `<!doctype html><title>V11 mask pixels</title>
<script type="module">
import { runEditorV11MaskPixels } from "/packages/renderer-pixi/src/__tests__/fixtures/editor-v11-mask-pixels.ts";
try { window.__maskResult = await runEditorV11MaskPixels(); }
catch (error) { window.__maskError = error instanceof Error ? error.message : "Pixel gate failed"; }
</script>`,
            )
            .then((html) => {
              response.setHeader("Content-Type", "text/html; charset=utf-8");
              response.end(html);
            }, next);
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error("Pixel gate server unavailable");
  browser = await chromium.launch({
    args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  await page.goto(new URL(pagePath, base).href);
  await page.waitForFunction(() => window.__maskResult || window.__maskError, undefined, {
    timeout: 60_000,
  });
  const outcome = await page.evaluate(() => ({
    result: window.__maskResult,
    error: window.__maskError,
  }));
  if (outcome.error) throw new Error(outcome.error);
  console.log(
    `[editor-v11-masks] Chromium WebGL passed: ${JSON.stringify(outcome.result)}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
