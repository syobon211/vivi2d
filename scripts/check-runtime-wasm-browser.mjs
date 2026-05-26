import { chromium, firefox, webkit } from "@playwright/test";
import { createServer } from "vite";
import path from "node:path";

const root = process.cwd();
const checkPagePath = "/__runtime-wasm-browser-check.html";
const requestedBrowsers = parseBrowserArg(process.argv);
const browserTypes = {
  chromium,
  firefox,
  webkit,
};

const server = await createServer({
  configFile: path.join(root, "vite.config.ts"),
  plugins: [
    {
      name: "runtime-wasm-browser-check-page",
      configureServer(viteServer) {
        viteServer.middlewares.use(
          checkPagePath,
          (request, response, next) => {
            void (async () => {
              const html = await viteServer.transformIndexHtml(
                checkPagePath,
                `<!doctype html>
<title>Runtime WASM Browser Check</title>
<script type="module">
  import {
    VIVI_RUNTIME_ABI_VERSION,
    createViviWasmRuntime,
  } from "@vivi2d/runtime-wasm";

  async function runRuntimeWasmBrowserCheck() {
    try {
      const fixtureResponse = await fetch(
        "/tests/conformance/runtime-v1/basic-mesh.fixture.json",
      );
      if (!fixtureResponse.ok) {
        throw new Error(
          "failed to fetch runtime conformance fixture: " +
            fixtureResponse.status,
        );
      }

      const fixture = await fixtureResponse.json();
      const runtime = await createViviWasmRuntime({ backend: "native" });
      const backend = runtime.getBackendInfo();
      if (backend.abiVersion !== VIVI_RUNTIME_ABI_VERSION) {
        throw new Error("runtime-wasm ABI version mismatch");
      }
      if (backend.selectedBackend !== "native" || backend.evaluator !== "native-rust") {
        throw new Error(
          "native runtime-wasm browser smoke did not select native-rust: " +
            JSON.stringify(backend),
        );
      }

      const model = runtime.load(fixture.fileData);
      model.setInput("vivi.head.yaw", 0.5);
      model.update(1 / 60);
      const renderList = model.getRenderList();
      const expectedMesh = fixture.expect.renderList[0];
      const mesh = renderList.find((entry) => entry.id === expectedMesh.id);
      if (!mesh) {
        throw new Error("runtime-wasm browser render snapshot is missing");
      }
      if (renderList.length !== fixture.expect.renderList.length) {
        throw new Error("runtime-wasm browser mesh count mismatch");
      }
      if (mesh.vertices.length !== expectedMesh.vertices.length) {
        throw new Error("runtime-wasm browser vertex count mismatch");
      }
      for (const value of mesh.vertices) {
        if (!Number.isFinite(value)) {
          throw new Error("runtime-wasm browser snapshot contains non-finite data");
        }
      }
      const expectedHit = fixture.expect.hitTests[0];
      const hit = model.hitTest(expectedHit.x, expectedHit.y);
      if (hit?.colliderId !== expectedHit.hit.colliderId) {
        throw new Error(
          "runtime-wasm browser hit-test mismatch for fixture " +
            fixture.name,
        );
      }

      window.__runtimeWasmBrowserResult = {
        backend,
        meshCount: renderList.length,
        vertexFloatCount: mesh.vertices.length,
      };
    } catch (error) {
      window.__runtimeWasmBrowserError =
        error instanceof Error ? error.stack || error.message : String(error);
    } finally {
      window.dispatchEvent(new Event("runtime-wasm-browser-check:done"));
    }
  }

  runRuntimeWasmBrowserCheck();
</script>`,
              );
            response.statusCode = 200;
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end(html);
          })().catch(next);
          },
        );
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 0,
  },
});

try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0];
  if (!baseUrl) {
    throw new Error("Vite server did not expose a local URL");
  }

  for (const browserName of requestedBrowsers) {
    const browserType = browserTypes[browserName];
    if (!browserType) {
      throw new Error(`Unsupported browser: ${browserName}`);
    }

    const browser = await browserType.launch();
    try {
      const page = await browser.newPage();
      await page.goto(new URL("__runtime-wasm-browser-check.html", baseUrl).href);
      await page.waitForFunction(() => {
        return Boolean(
          window.__runtimeWasmBrowserResult ||
            window.__runtimeWasmBrowserError,
        );
      });
      const checkState = await page.evaluate(() => ({
        error: window.__runtimeWasmBrowserError,
        result: window.__runtimeWasmBrowserResult,
      }));
      if (checkState.error) {
        throw new Error(checkState.error);
      }
      const result = checkState.result;
      console.log(
        `[runtime-wasm-browser] ${browserName} passed: ` +
          `${result.backend.evaluator}, ${result.meshCount} mesh, ` +
          `${result.vertexFloatCount} vertex floats`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

function parseBrowserArg(argv) {
  const browserArg = argv.find((arg) => arg.startsWith("--browser="));
  if (!browserArg) return ["chromium", "firefox", "webkit"];
  return browserArg
    .slice("--browser=".length)
    .split(",")
    .map((browser) => browser.trim())
    .filter(Boolean);
}
