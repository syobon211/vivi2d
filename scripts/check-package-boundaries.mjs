import fs from "node:fs";
import { exists, readJson, resolveRepoPath } from "./lib/repo.mjs";

const failures = [];

function flattenExportTargets(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenExportTargets);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenExportTargets);
  }
  return [];
}

function collectPackageJsonFiles() {
  const packagesDir = resolveRepoPath("packages");
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/package.json`)
    .filter((relativePath) => exists(relativePath));
}

function checkRuntimeWasmPublicationGuard(pkg) {
  if (pkg.name !== "@vivi2d/runtime-wasm") return;
  const exportTargets = flattenExportTargets(pkg.exports);
  const exportsSource = exportTargets.some((target) => target.includes("/src/"));
  if (!exportsSource) return;
  if (pkg.private !== true || pkg.vivi2d?.publication !== "internal") {
    failures.push(
      "@vivi2d/runtime-wasm may export src/index.ts only while private and vivi2d.publication is internal.",
    );
  }
}

function checkRuntimePackageDistExports(pkg) {
  if (pkg.name !== "@vivi2d/runtime") return;
  if (pkg.private !== true || pkg.vivi2d?.publication !== "internal") {
    failures.push(
      "@vivi2d/runtime must remain private/internal until runtime release gates pass.",
    );
  }
  const exportTargets = flattenExportTargets(pkg.exports);
  const exportsSource = exportTargets.some((target) => target.includes("/src/"));
  const rootExport = pkg.exports?.["."];
  if (exportsSource) {
    failures.push("@vivi2d/runtime must export generated dist files, not src/*.");
  }
  if (!pkg.types || !pkg.files?.includes("dist")) {
    failures.push("@vivi2d/runtime must declare dist types and a dist files allowlist.");
  }
  if (
    !rootExport ||
    typeof rootExport !== "object" ||
    rootExport.types !== "./dist/index.d.ts" ||
    rootExport.import !== "./dist/index.js"
  ) {
    failures.push(
      "@vivi2d/runtime must expose only the generated dist index through package exports.",
    );
  }
  if (pkg.main || pkg.module) {
    failures.push(
      "@vivi2d/runtime is ESM-only and must rely on package exports instead of legacy main/module entrypoints.",
    );
  }
}

function checkWebPackageExports(pkg) {
  if (pkg.name !== "@vivi2d/web") return;
  // Keep this package-surface contract aligned with check-web-sdk-unlock.mjs.
  if (pkg.vivi2d?.publication !== "experimental") {
    failures.push("@vivi2d/web must remain experimental until SDK gates pass.");
  }
  const rootExport = pkg.exports?.["."];
  const autoRegisterExport = pkg.exports?.["./auto-register"];
  const umdExport = pkg.exports?.["./umd"];
  if (pkg.main || pkg.module) {
    failures.push(
      "@vivi2d/web must use package exports instead of legacy main/module entrypoints.",
    );
  }
  if (rootExport?.require) {
    failures.push("@vivi2d/web must not expose a browser UMD bundle through require.");
  }
  if (
    !rootExport ||
    rootExport.types !== "./dist/index.d.ts" ||
    rootExport.import !== "./dist/vivi2d.es.js"
  ) {
    failures.push("@vivi2d/web root export must expose only dist ESM and types.");
  }
  if (
    !autoRegisterExport ||
    autoRegisterExport.types !== "./dist/auto-register.d.ts" ||
    autoRegisterExport.import !== "./dist/auto-register.js"
  ) {
    failures.push(
      "@vivi2d/web must expose guarded custom-element registration through ./auto-register.",
    );
  }
  if (!umdExport || umdExport.default !== "./dist/vivi2d.umd.js") {
    failures.push("@vivi2d/web UMD bundle must be isolated behind ./umd.");
  }
  if (umdExport?.require) {
    failures.push("@vivi2d/web UMD subpath must not expose a Node require condition.");
  }
  const sideEffects = pkg.sideEffects;
  if (
    !Array.isArray(sideEffects) ||
    sideEffects.length !== 2 ||
    !sideEffects.includes("./dist/auto-register.js") ||
    !sideEffects.includes("./dist/vivi2d.umd.js")
  ) {
    failures.push(
      "@vivi2d/web sideEffects must be limited to auto-register and UMD bundles.",
    );
  }
}

function checkProviderSdkPublicationGuard(pkg) {
  if (pkg.name !== "@vivi2d/provider-sdk") return;
  if (pkg.private !== true || pkg.vivi2d?.publication !== "internal") {
    failures.push(
      "@vivi2d/provider-sdk must remain private/internal until provider contracts have external review feedback.",
    );
  }
  const rootExport = pkg.exports?.["."];
  const artifactPolicyExport = pkg.exports?.["./artifact-policy"];
  const invocationExport = pkg.exports?.["./invocation"];
  const testingExport = pkg.exports?.["./testing"];
  for (const [label, entry, expected] of [
    ["root", rootExport, "./dist/index.js"],
    ["artifact-policy", artifactPolicyExport, "./dist/artifact-policy.js"],
    ["invocation", invocationExport, "./dist/invocation.js"],
    ["testing", testingExport, "./dist/testing.js"],
  ]) {
    if (!entry || entry.import !== expected || !entry.types?.startsWith("./dist/")) {
      failures.push(
        `@vivi2d/provider-sdk ${label} export must point to dist ESM and dist declarations.`,
      );
    }
    if (entry?.require) {
      failures.push(
        `@vivi2d/provider-sdk ${label} export must not expose a CommonJS require condition during preview.`,
      );
    }
  }
  if (!pkg.types || !pkg.files?.includes("dist")) {
    failures.push("@vivi2d/provider-sdk must declare dist types and a dist files allowlist.");
  }
  if (pkg.main || pkg.module) {
    failures.push(
      "@vivi2d/provider-sdk must use package exports instead of legacy main/module entrypoints.",
    );
  }
  if (pkg.sideEffects !== false) {
    failures.push("@vivi2d/provider-sdk must remain side-effect free.");
  }
}

function checkViewerApiClientPublicationGuard(pkg) {
  if (pkg.name !== "@vivi2d/viewer-api-client") return;
  if (pkg.private !== true || pkg.vivi2d?.publication !== "internal") {
    failures.push(
      "@vivi2d/viewer-api-client must remain private/internal until Viewer API client scopes, pairing, samples, and contract gates are stable.",
    );
  }
  const rootExport = pkg.exports?.["."];
  const nodeExport = pkg.exports?.["./node"];
  const browserExport = pkg.exports?.["./browser"];
  const testingExport = pkg.exports?.["./testing"];
  for (const [label, entry, expected] of [
    ["root", rootExport, "./dist/index.js"],
    ["node", nodeExport, "./dist/node.js"],
    ["browser", browserExport, "./dist/browser.js"],
    ["testing", testingExport, "./dist/testing.js"],
  ]) {
    if (!entry || entry.import !== expected || !entry.types?.startsWith("./dist/")) {
      failures.push(
        `@vivi2d/viewer-api-client ${label} export must point to dist ESM and dist declarations.`,
      );
    }
    if (entry?.require) {
      failures.push(
        `@vivi2d/viewer-api-client ${label} export must not expose a CommonJS require condition during preview.`,
      );
    }
  }
}

function checkPackage(relativePath) {
  const pkg = readJson(relativePath);
  const packageName = pkg.name ?? relativePath;
  const publication = pkg.vivi2d?.publication;
  const exportTargets = flattenExportTargets(pkg.exports);
  const exportsSource = exportTargets.some((target) => target.includes("/src/"));

  checkRuntimeWasmPublicationGuard(pkg);
  checkRuntimePackageDistExports(pkg);
  checkWebPackageExports(pkg);
  checkProviderSdkPublicationGuard(pkg);
  checkViewerApiClientPublicationGuard(pkg);

  if (pkg.private === true) {
    if (!["internal", "internal-app"].includes(publication)) {
      failures.push(
        `${packageName} is private and must declare vivi2d.publication as internal or internal-app.`,
      );
    }
    if (exportsSource && publication !== "internal") {
      failures.push(
        `${packageName} exports src/* and must explicitly remain an internal workspace package.`,
      );
    }
    return;
  }

  if (!["experimental", "public"].includes(publication)) {
    failures.push(`${packageName} must declare vivi2d.publication before publishing.`);
  }
  if (!pkg.license) {
    failures.push(`${packageName} is public-facing and must declare a license.`);
  }
  if (exportsSource) {
    failures.push(`${packageName} must export built dist files instead of src/*.`);
  }
  if (!pkg.files?.includes("dist")) {
    failures.push(`${packageName} must limit published files to dist.`);
  }
  if (!pkg.types && !exportTargets.some((target) => target.endsWith(".d.ts"))) {
    failures.push(`${packageName} must expose declaration files.`);
  }
}

for (const relativePath of collectPackageJsonFiles()) {
  checkPackage(relativePath);
}

if (failures.length > 0) {
  console.error("[package-boundaries] failed:");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("[package-boundaries] passed");
