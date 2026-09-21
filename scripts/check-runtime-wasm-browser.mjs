import path from "node:path";
import { chromium, firefox, webkit } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const checkPagePath = "/__runtime-wasm-browser-check.html";
const requestedBrowsers = parseBrowserArg(process.argv);
const pngMode = process.argv.includes("--png-v1");
const evaluationMode = process.argv.includes("--evaluation-v1");
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
        viteServer.middlewares.use(checkPagePath, (_request, response, next) => {
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

  const hex = (bytes) => Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  const fromHex = (value) => Uint8Array.from(value.match(/../g), (part) => Number.parseInt(part, 16));
  const fromBase64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  const sha256 = async (bytes) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));

  async function checkNativePng() {
    const { createNativePngDecoder } = await import("@vivi2d/runtime-wasm/internal/png-rgba8-v1");
    const { validateProjectV11WithNativePng } = await import("/src/lib/project-v11-native-png.ts");
    const response = await fetch("/tests/conformance/project-embedded-round-trip-v11/manifest.json");
    if (!response.ok) throw new Error("PNG conformance fixture unavailable");
    const manifest = await response.json();
    const initialized = await createNativePngDecoder();
    if (!initialized.ok) throw new Error("Real PNG WASM unavailable");
    let retained;
    let retainedHex;
    try {
      for (const fixture of manifest.pngCases) {
        const result = initialized.decoder.decode({
          bytes: fromBase64(fixture.base64), expectedSha256: fromHex(fixture.sha256),
          width: fixture.width, height: fixture.height,
        });
        if (fixture.native.status === "ok") {
          if (!result.ok || result.profile !== "vivi2d.png.rgba8.v1" ||
              result.width !== fixture.width || result.height !== fixture.height ||
              result.rowStride !== fixture.width * 4 || hex(result.rgba) !== fixture.native.rgbaHex) {
            throw new Error("Real PNG pixels/profile mismatch: " + fixture.id);
          }
          retained = result.rgba;
          retainedHex = fixture.native.rgbaHex;
        } else {
          const status = { unsupported: 2, malformed: 3, limit: 4, dimension: 5 }[fixture.native.status];
          if (result.ok || result.kind !== "png" || result.status !== status) {
            throw new Error("Real PNG rejection mismatch: " + fixture.id);
          }
        }
      }
    } finally {
      initialized.decoder.dispose();
    }
    if (!retained || hex(retained) !== retainedHex) throw new Error("PNG ownership after dispose failed");
    const document = manifest.documents.find((fixture) => fixture.operation === "validate");
    if (!document) throw new Error("Project conformance fixture missing");
    const project = await validateProjectV11WithNativePng(new TextEncoder().encode(document.inputUtf8), sha256);
    if (!project.ok || project.documentId !== document.documentId ||
        new TextDecoder().decode(project.canonicalUtf8) !== document.canonicalUtf8 ||
        project.images.length !== document.pngSha256s.length ||
        project.images.some((image, index) => image.sha256 !== document.pngSha256s[index])) {
      throw new Error("Real native Project PNG integration failed");
    }
    return { nativePngCases: manifest.pngCases.length, nativeProjectDocuments: 1 };
  }

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

      const png = ${pngMode} ? await checkNativePng() : {};
      const evaluation = ${evaluationMode}
        ? await (await import("/packages/renderer-pixi/src/__tests__/fixtures/evaluation-runtime-pixels.ts")).runEvaluationRuntimePixels()
        : {};

      window.__runtimeWasmBrowserResult = {
        backend,
        meshCount: renderList.length,
        vertexFloatCount: mesh.vertices.length,
        ...png,
        ...evaluation,
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
        });
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

    const browser = await browserType.launch(
      evaluationMode && browserName === "chromium"
        ? {
            args: [
              "--enable-webgl",
              "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader",
            ],
          }
        : {},
    );
    try {
      const page = await browser.newPage();
      await page.goto(new URL("__runtime-wasm-browser-check.html", baseUrl).href);
      await page.waitForFunction(() => {
        return Boolean(
          window.__runtimeWasmBrowserResult || window.__runtimeWasmBrowserError,
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
          `${result.vertexFloatCount} vertex floats` +
          (pngMode
            ? `; ${result.nativePngCases} real PNG cases, ${result.nativeProjectDocuments} native Project document`
            : ""),
      );
      if (evaluationMode) {
        console.log(
          `[runtime-wasm-browser] ${browserName} evaluation-v1: ${JSON.stringify({
            realWebGL: result.realWebGL,
            nestedInvertPixels: result.nestedInvertPixels,
            sameSealRetry: result.sameSealRetry,
            sessionDisposed: result.sessionDisposed,
            initialDynamic: result.initialDynamic,
            explicitUpdate: result.explicitUpdate,
            publicationEvents: result.publicationEvents,
            lastPrepareFailurePreservedIncumbent:
              result.lastPrepareFailurePreservedIncumbent,
            enteredRenderAbortStopped: result.enteredRenderAbortStopped,
            actualApplicationRecovery: result.actualApplicationRecovery,
          })}`,
        );
      }
    } finally {
      console.log(`[runtime-wasm-browser] closing ${browserName}`);
      await browser.close();
      console.log(`[runtime-wasm-browser] closed ${browserName}`);
    }
  }
} finally {
  console.log("[runtime-wasm-browser] closing Vite");
  await server.close();
  console.log("[runtime-wasm-browser] closed Vite");
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
