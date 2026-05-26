import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const samplesRoot = path.join(repoRoot, "examples");
const browserSampleRoot = path.join(samplesRoot, "viewer-api-browser-client");
const credentialScanRoots = [
  { root: samplesRoot, kind: "examples" },
  { root: path.join(repoRoot, "e2e"), kind: "e2e" },
  { root: path.join(repoRoot, ".tmp-tests"), kind: "tmp" },
];
const errors = [];

await assertNoCommittedSampleSecrets(credentialScanRoots);
await assertBrowserSampleSecurity();
await assertSamplesUseSdk();
await assertNoPrivateSampleImports();
await assertBrowserSampleBuilds();

if (errors.length > 0) {
  for (const error of errors) console.error(`[viewer-api-samples] ${error}`);
  process.exit(1);
}

console.log("[viewer-api-samples] passed");

async function assertNoCommittedSampleSecrets(roots) {
  for (const { root } of roots) {
    for await (const file of walk(root)) {
      const normalized = file.replaceAll(path.sep, "/");
      const basename = path.basename(file).toLowerCase();
      if (isViewerApiCredentialFile({ basename, normalized })) {
        errors.push(
          `viewer API credential-like fixture must not be committed: ${normalized}`,
        );
      }
    }
  }
}

function isViewerApiCredentialFile({ basename, normalized }) {
  if (basename === "token.json") return true;
  if (basename === ".vivi-viewer-api-token.json") return true;
  if (basename.endsWith(".token.json")) return true;
  if (basename.endsWith(".session.json")) return true;
  if (basename.endsWith(".tokens.json")) return true;
  return normalized.includes("/.local-state/");
}

async function assertBrowserSampleSecurity() {
  const htmlPath = path.join(samplesRoot, "viewer-api-browser-client", "index.html");
  const jsPath = path.join(samplesRoot, "viewer-api-browser-client", "src", "client.ts");
  const html = await readFile(htmlPath, "utf8");
  const js = await readFile(jsPath, "utf8");
  if (!html.includes("Content-Security-Policy")) {
    errors.push("browser sample is missing a Content-Security-Policy meta tag");
  }
  const cspMatch = html.match(/Content-Security-Policy"[\s\S]*?content="([^"]+)"/i);
  const csp = cspMatch?.[1] ?? "";
  if (!/connect-src\s+ws:\/\/127\.0\.0\.1:\*/.test(csp)) {
    errors.push("browser sample CSP must restrict connect-src to ws://127.0.0.1:*");
  }
  if (/connect-src[^;]*(https?:|wss:|ws:\/\/(?!127\.0\.0\.1:\*))/i.test(csp)) {
    errors.push("browser sample CSP connect-src must not allow remote endpoints");
  }
  if (html.includes("'unsafe-inline'")) {
    errors.push("browser sample CSP must not allow unsafe-inline");
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) {
    errors.push("browser sample must not use inline script tags");
  }
  if (/\son[a-z]+\s*=/i.test(html)) {
    errors.push("browser sample must not use inline event handlers");
  }
  if (js.includes("localStorage")) {
    errors.push("browser sample must use sessionStorage, not localStorage");
  }
  if (
    js.includes("packages/viewer-api-client") ||
    js.includes("@vivi2d/viewer-api-client/dist")
  ) {
    errors.push(
      "browser sample must import the public viewer-api-client browser entrypoint.",
    );
  }
  if (!js.includes("@vivi2d/viewer-api-client/browser")) {
    errors.push("browser sample must import @vivi2d/viewer-api-client/browser.");
  }
  if (/https?:\/\/(?!127\.0\.0\.1|localhost)/i.test(`${html}\n${js}`)) {
    errors.push("browser sample must not reference remote HTTP(S) assets");
  }
}

async function assertSamplesUseSdk() {
  const sampleFiles = [
    path.join(samplesRoot, "viewer-api-node-client", "client.mjs"),
    path.join(samplesRoot, "viewer-api-browser-client", "src", "client.ts"),
  ];
  for (const file of sampleFiles) {
    const source = await readFile(file, "utf8");
    const relative = path.relative(repoRoot, file);
    if (!usesViewerApiClientSdk(source)) {
      errors.push(
        `${relative} must use @vivi2d/viewer-api-client instead of hand-written protocol RPC.`,
      );
    }
    for (const marker of ["createViviViewerClient", "ViviViewerApiClientError"]) {
      if (!source.includes(marker)) {
        errors.push(`${relative} is missing SDK marker: ${marker}`);
      }
    }
    for (const forbidden of [
      "createRpc",
      'ViviViewerApi",',
      "viewer.auth.challenge",
      "viewer.auth.authenticate",
    ]) {
      if (source.includes(forbidden)) {
        errors.push(
          `${relative} must not send raw Viewer API protocol messages (${forbidden}).`,
        );
      }
    }
  }
}

function usesViewerApiClientSdk(source) {
  return (
    source.includes("@vivi2d/viewer-api-client") ||
    source.includes("packages/viewer-api-client/dist/browser.js")
  );
}

async function assertNoPrivateSampleImports() {
  const fixedFiles = [
    {
      file: path.join(samplesRoot, "viewer-api-node-client", "client.mjs"),
      root: path.join(samplesRoot, "viewer-api-node-client"),
      allowedBareImports: new Set([
        "@vivi2d/viewer-api-client/node",
        "node:fs/promises",
        "node:os",
        "node:path",
        "node:url",
        "ws",
      ]),
    },
  ];

  for (const fileConfig of fixedFiles) {
    await assertImportSpecifiers(fileConfig);
  }

  for await (const file of walk(browserSampleRoot)) {
    if (!/\.(?:ts|tsx|js|mjs)$/.test(file)) continue;
    await assertImportSpecifiers({
      file,
      root: browserSampleRoot,
      allowedBareImports: allowedBrowserSampleImports(file),
    });
  }
}

async function assertImportSpecifiers({ file, root, allowedBareImports }) {
  const source = await readFile(file, "utf8");
  for (const specifier of extractImportSpecifiers(source)) {
    const relativeFile = path.relative(repoRoot, file);
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      const resolved = path.resolve(path.dirname(file), specifier);
      const relativeToRoot = path.relative(root, resolved);
      if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
        errors.push(
          `${relativeFile} must not import files outside its example directory (${specifier}).`,
        );
      }
      continue;
    }
    if (!allowedBareImports.has(specifier)) {
      errors.push(
        `${relativeFile} imports ${specifier}; examples must use only public SDK entries and approved dev dependencies.`,
      );
    }
  }
}

function allowedBrowserSampleImports(file) {
  const normalized = file.replaceAll(path.sep, "/");
  if (normalized.endsWith("/src/client.ts")) {
    return new Set(["@vivi2d/viewer-api-client/browser"]);
  }
  if (normalized.endsWith("/vite.config.ts")) {
    return new Set(["vite"]);
  }
  if (normalized.endsWith("/playwright.config.ts")) {
    return new Set(["@playwright/test"]);
  }
  if (normalized.includes("/e2e/")) {
    return new Set(["@playwright/test", "ws"]);
  }
  return new Set();
}

function extractImportSpecifiers(source) {
  const specifiers = [];
  const importFromPattern = /\bimport\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(importFromPattern)) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(dynamicImportPattern)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

async function assertBrowserSampleBuilds() {
  run("npm", ["run", "build", "--workspace", "@vivi2d/viewer-api-client"]);
  run("npm", ["run", "typecheck", "--prefix", browserSampleRoot]);
  run("npm", ["run", "build", "--prefix", browserSampleRoot]);
}

function run(command, args) {
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].map(quoteShellArg).join(" "), {
          cwd: repoRoot,
          encoding: "utf8",
          shell: true,
          stdio: "inherit",
        })
      : spawnSync(command, args, {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "inherit",
        });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

async function* walk(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    if ((await stat(fullPath)).isFile()) yield fullPath;
  }
}
