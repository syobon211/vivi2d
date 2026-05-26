import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const npmCommand = "npm";

const packages = [
  "@vivi2d/web",
  "@vivi2d/viewer-api-client",
  "@vivi2d/provider-sdk",
];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function packageDir(packageName) {
  return path.join(repoRoot, "packages", packageName.replace("@vivi2d/", ""));
}

function tarballName(packageName) {
  const packageJson = readJson(path.join(packageDir(packageName), "package.json"));
  return `${packageJson.name.replace(/^@/, "").replace("/", "-")}-${packageJson.version}.tgz`;
}

function fileDependency(fromDir, filePath) {
  return `file:${path.relative(fromDir, filePath).replaceAll(path.sep, "/")}`;
}

function run(command, args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  console.log(`[sdk-external-consumer] ${command} ${args.join(" ")}`);
  const useWindowsCommandShim = process.platform === "win32" && command === npmCommand;
  const spawnCommand = useWindowsCommandShim
    ? (process.env.ComSpec ?? "cmd.exe")
    : command;
  const spawnArgs = useWindowsCommandShim
    ? ["/d", "/s", "/c", command, ...args]
    : args;
  return new Promise((resolve, reject) => {
    const child = spawn(spawnCommand, spawnArgs, {
      cwd,
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }`,
        ),
      );
    });
  });
}

async function writeConsumerProject(appDir, packDir) {
  const rootPackage = readJson(path.join(repoRoot, "package.json"));
  const typeScriptVersion = rootPackage.devDependencies.typescript ?? "^5.9.3";
  const viteVersion = rootPackage.devDependencies.vite ?? "^6.4.2";

  await writeFile(
    path.join(appDir, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        scripts: {
          typecheck: "tsc -p tsconfig.json",
          build: "vite build --logLevel warn",
        },
        dependencies: {
          "@vivi2d/web": fileDependency(
            appDir,
            path.join(packDir, tarballName("@vivi2d/web")),
          ),
          "@vivi2d/viewer-api-client": fileDependency(
            appDir,
            path.join(packDir, tarballName("@vivi2d/viewer-api-client")),
          ),
          "@vivi2d/provider-sdk": fileDependency(
            appDir,
            path.join(packDir, tarballName("@vivi2d/provider-sdk")),
          ),
        },
        devDependencies: {
          typescript: typeScriptVersion,
          vite: viteVersion,
        },
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    path.join(appDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    path.join(appDir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Vivi2D external consumer smoke</title>
  </head>
  <body>
    <canvas id="vivi-canvas" width="320" height="240"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
  );

  await writeFile(
    path.join(appDir, "src", "main.ts"),
    `import {
  createViviWebPlayer,
  isViviWebError,
  loadViviWebModel,
  type ViviWebPlayer,
} from "@vivi2d/web";
import { createMemoryTokenStore } from "@vivi2d/viewer-api-client";
import {
  createViviViewerClient as createBrowserViewerClient,
  parseViewerEndpoint as parseBrowserViewerEndpoint,
} from "@vivi2d/viewer-api-client/browser";
import {
  createProviderResult,
  defineViviProvider,
  VIVI_PROVIDER_CAPABILITIES,
  VIVI_PROVIDER_SDK_VERSION,
} from "@vivi2d/provider-sdk";
import { invokeProvider } from "@vivi2d/provider-sdk/invocation";

export async function mountVivi(
  canvas: HTMLCanvasElement,
  source: string | File,
): Promise<ViviWebPlayer | null> {
  try {
    const model = await loadViviWebModel(source);
    const player = await createViviWebPlayer({
      autoStart: false,
      canvas,
      model,
      strictInputs: true,
    });
    player.resize(canvas.width, canvas.height);
    player.update(0);
    player.render();
    return player;
  } catch (error) {
    if (isViviWebError(error)) {
      console.info({ code: error.code });
      return null;
    }
    throw error;
  }
}

export function createExternalBrowserViewerClient() {
  void parseBrowserViewerEndpoint("ws://127.0.0.1:58720");
  return createBrowserViewerClient({
    endpoint: "ws://127.0.0.1:58720",
    appName: "External Consumer Smoke",
    scopes: ["read:state"],
    tokenStore: createMemoryTokenStore(),
  });
}

const provider = defineViviProvider({
  manifest: {
    id: "external-consumer-provider",
    displayName: "External Consumer Provider",
    version: "0.1.0",
    sdkVersion: VIVI_PROVIDER_SDK_VERSION,
    capabilities: [
      {
        id: VIVI_PROVIDER_CAPABILITIES.maskProposal,
        version: "1.0.0",
        inputKinds: ["inputImage"],
        outputKinds: ["maskProposal"],
        maxInputBytes: 1024,
        maxOutputBytes: 1024,
        timeoutMs: 1000,
      },
    ],
  },
  async invoke(request) {
    return createProviderResult(provider.manifest, request, [
      {
        id: "mask",
        kind: "maskProposal",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([0, 255, 255, 0]).buffer,
        metadata: {
          schema: "vivi2d.provider.maskProposalMetadata.v1",
          semantic: "hair",
          confidence: 0.75,
          provenance: "providerProposal",
        },
      },
    ]);
  },
});

export async function runProviderSmoke() {
  const result = await invokeProvider(provider, {
    requestId: "request-1",
    capabilityId: VIVI_PROVIDER_CAPABILITIES.maskProposal,
    inputArtifacts: [
      {
        id: "source",
        kind: "inputImage",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([1, 2, 3, 4]).buffer,
      },
    ],
  });
  return result.artifacts.length;
}
`,
  );

  await writeFile(
    path.join(appDir, "src", "node-entry.ts"),
    `import {
  createViviViewerClient,
  parseViewerEndpoint,
} from "@vivi2d/viewer-api-client/node";
import {
  createMockWebSocketFactory,
  makeViewerApiResponse,
  readSentMessage,
} from "@vivi2d/viewer-api-client/testing";
import {
  createFakeProvider,
  runViviProviderConformance,
} from "@vivi2d/provider-sdk/testing";

export async function createNodeClientForExternalTests() {
  const { factory, sockets } = createMockWebSocketFactory();
  const client = createViviViewerClient({
    endpoint: "ws://127.0.0.1:58720",
    appName: "External Consumer Node Smoke",
    scopes: ["read:state"],
    webSocketFactory: factory,
  });
  const endpoint = await parseViewerEndpoint("ws://127.0.0.1:58720");
  void makeViewerApiResponse(undefined, "viewer.test", true);
  return { client, endpoint, readSentMessage, sockets };
}

export async function runProviderConformanceSmoke() {
  const provider = createFakeProvider();
  return runViviProviderConformance(provider, [
    {
      name: "empty result",
      request: {
        requestId: "request-1",
        capabilityId: provider.manifest.capabilities[0]?.id ?? "missing",
        inputArtifacts: [],
      },
      expectArtifactKinds: [],
    },
  ]);
}
`,
  );
}

async function main() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "vivi2d-sdk-consumer-"));
  const packDir = path.join(tempRoot, "packs");
  const appDir = path.join(tempRoot, "consumer");

  try {
    await run(npmCommand, ["run", "build:packages"]);
    await mkdir(packDir, { recursive: true });
    await mkdir(path.join(appDir, "src"), { recursive: true });
    for (const packageName of packages) {
      await run(npmCommand, [
        "pack",
        "--workspace",
        packageName,
        "--pack-destination",
        packDir,
      ]);
    }
    await writeConsumerProject(appDir, packDir);
    await run(npmCommand, ["install", "--ignore-scripts"], { cwd: appDir });
    await run(npmCommand, ["run", "typecheck"], { cwd: appDir });
    await run(npmCommand, ["run", "build"], { cwd: appDir });
    console.log(`[sdk-external-consumer] passed (${appDir})`);
  } finally {
    if (process.env.VIVI_KEEP_EXTERNAL_CONSUMER_SMOKE !== "1") {
      await rm(tempRoot, { force: true, recursive: true });
    } else {
      console.log(`[sdk-external-consumer] kept temp directory: ${tempRoot}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
