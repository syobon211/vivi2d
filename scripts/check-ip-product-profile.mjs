import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const PUBLICATION_STATUSES = new Set(["experimental", "public"]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".d.ts",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
]);

const DENYLIST = [
  "CorrectiveDeformation",
  "corrective-deformation",
  "correctiveDeformation",
  "evaluateCorrectiveDeformations",
  "BlendShape",
  "blendShape",
  "MorphTarget",
  "morphTarget",
  "blendShapeTracks",
  "meshPoseTrack",
  "meshPoseTracks",
  "MeshPoseTrack",
  "MeshLink",
  "meshLink",
  "mesh-link",
  "LatticeDeformer",
  "latticeDeformer",
  "ArtPathBinding",
  "artPathBinding",
  "formAnimation",
  "FormAnimation",
  "FormPose",
  "LocalMotionDraft",
  "LocalPreviewSolver",
  "LocalMotionApplyPlan",
  "LocalPreviewFrame",
  "BrandedLocalPreviewFrame",
  "EditorOnlyPreview",
  "previewDeformedVertices",
  "guidedPreviewFit",
  "motionStressPreview",
];

const PUBLIC_DOCS = [
  "README.md",
  "docs/developer/quality/public-api-status.md",
  "docs/developer/api/viewer-api.md",
  "docs/developer/quality/public-release-checklist.md",
];

const PUBLIC_APP_SOURCE_PATHS = [
  "src/App.tsx",
  "src/components/MenuBar.tsx",
  "src/components/menu/useMenuQuickActionsRegistration.ts",
  "src/components/properties/MeshProperties.tsx",
  "src/components/properties/useMeshPropertiesActions.ts",
  "src/components/properties/useMeshPropertiesDerivedState.ts",
  "src/hooks/useLayerSync.ts",
  "src/hooks/useOnionSkin.ts",
  "src/hooks/useParameterBinding.ts",
  "src/hooks/usePlayback.ts",
  "src/lib/export/media-exporter.ts",
  "packages/core/src/model.ts",
  "packages/core/src/model/bindings.ts",
  "packages/core/src/model/caches.ts",
  "packages/core/src/model/mesh-compute.ts",
  "packages/core/src/model-animation-step.ts",
  "packages/renderer-pixi/src/editor-layer-sync.ts",
];

const PUBLIC_BUNDLE_RUNTIME_SIGNATURES = [
  "evaluateCorrectiveDeformations",
  "applyBlendShapes",
  "resolveActiveTargets",
  "applyFFDToMesh",
  "applyMeshLinkDeformation",
  "meshLinkOtherScratch",
  "meshPoseVerticesByMeshId",
  "computeLatticeDeltas",
  "applyLatticeDeltas",
];

const PUBLIC_BUNDLE_FILENAME_PATTERN =
  /(?:CorrectiveDeformation|corrective-deformation|BlendShape|MorphTarget|MeshLink|mesh-link|LatticeDeformer|meshPoseTrack|MeshPoseTrack|formAnimation|FormAnimation|FormPose)/;

const PUBLIC_PACKAGE_EXPORT_ALLOWLIST = {
  "@vivi2d/web": {
    files: ["dist"],
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/vivi2d.es.js",
      },
      "./auto-register": {
        types: "./dist/auto-register.d.ts",
        import: "./dist/auto-register.js",
      },
      "./umd": {
        default: "./dist/vivi2d.umd.js",
      },
    },
  },
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function listRepoFiles(...paths) {
  return runGit(["ls-files", "--cached", "--others", "--exclude-standard", ...paths])
    .split(/\r?\n/)
    .filter(Boolean);
}

function collectWorkspacePackages() {
  const packagesDir = path.join(root, "packages");
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const relativePath = `packages/${entry.name}/package.json`;
      if (!fs.existsSync(path.join(root, relativePath))) return null;
      const pkg = readJson(relativePath);
      return { dir: `packages/${entry.name}`, relativePath, pkg };
    })
    .filter(Boolean);
}

function shouldSkipTextPath(relativePath) {
  if (relativePath.startsWith("docs/backlog/")) return true;
  if (relativePath.includes("/__tests__/") || relativePath.includes("\\__tests__\\")) {
    return true;
  }
  if (relativePath.endsWith("ip-product-profile.test.ts")) return true;
  if (relativePath.endsWith("safe-auto-setup-plan.test.ts")) return true;
  if (relativePath.endsWith("check-ip-product-profile.mjs")) return true;
  return false;
}

function scanText(relativePath, text, { allowPolicyDocs = false } = {}) {
  if (shouldSkipTextPath(relativePath)) return;
  if (!TEXT_EXTENSIONS.has(path.extname(relativePath))) return;
  if (allowPolicyDocs && relativePath === "docs/developer/ip/policy.md") return;
  for (const marker of DENYLIST) {
    if (text.includes(marker)) {
      failures.push(`${relativePath}: contains private-profile marker ${marker}`);
    }
  }

  if (/Live2D(?: standard|\u6a19\u6e96)|standard parameter/i.test(text)) {
    failures.push(`${relativePath}: contains third-party standard-parameter phrasing`);
  }

  if (
    /\bMLS\b|\bARAP\b|Moving\s+Least\s+Squares|As[-\s]?Rigid[-\s]?As[-\s]?Possible/i.test(
      text,
    )
  ) {
    failures.push(`${relativePath}: contains local-motion research terminology`);
  }
}

function scanPublicDocs() {
  for (const relativePath of PUBLIC_DOCS) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    scanText(relativePath, fs.readFileSync(absolutePath, "utf8"));
  }
}

function scanPublicExamples() {
  const files = listRepoFiles("examples").filter((file) =>
    file.startsWith("examples/web-sdk-basic/"),
  );
  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    if (
      path.extname(relativePath) !== ".vivi" &&
      !TEXT_EXTENSIONS.has(path.extname(relativePath))
    ) {
      continue;
    }
    scanText(relativePath, fs.readFileSync(absolutePath, "utf8"));
  }
}

function scanPublicAppSourceSurface() {
  for (const relativePath of PUBLIC_APP_SOURCE_PATHS) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`${relativePath}: expected public app source file is missing`);
      continue;
    }
    scanText(relativePath, fs.readFileSync(absolutePath, "utf8"));
  }
}

function scanLocalePublicCopySurface() {
  const files = listRepoFiles("src/lib/i18n", "packages/viewer/src/i18n").filter((file) =>
    /^(?:src\/lib\/i18n\/(?:en|ja|zh-Hans|ko-KR)\/.*\.ts|packages\/viewer\/src\/i18n\/.*\.ts)$/.test(
      file,
    ),
  );

  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    scanText(relativePath, fs.readFileSync(absolutePath, "utf8"));
  }
}

function scanPublicPackageSources(workspaces) {
  for (const workspace of workspaces) {
    const publication = workspace.pkg.vivi2d?.publication;
    if (!PUBLICATION_STATUSES.has(publication)) continue;

    const files = listRepoFiles(workspace.dir).filter(
      (file) =>
        file.startsWith(`${workspace.dir}/src/`) || file === workspace.relativePath,
    );

    for (const relativePath of files) {
      const absolutePath = path.join(root, relativePath);
      if (!fs.existsSync(absolutePath)) continue;
      scanText(relativePath, fs.readFileSync(absolutePath, "utf8"));
    }
  }
}

function isAutoSetupWorkflowPath(relativePath) {
  if (
    relativePath.startsWith("src/lib/auto-setup") ||
    relativePath.startsWith("src/lib/see-through-") ||
    relativePath.startsWith("src/components/AutoSetup") ||
    relativePath.startsWith("src/stores/autoSetup") ||
    relativePath.startsWith("packages/rigging/")
  ) {
    return true;
  }
  if (
    relativePath.startsWith("e2e/") &&
    /auto-setup/i.test(path.basename(relativePath))
  ) {
    return true;
  }
  return false;
}

function scanAutoSetupWorkflowSurface() {
  const files = listRepoFiles("src", "packages", "e2e").filter(isAutoSetupWorkflowPath);

  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    scanText(relativePath, fs.readFileSync(absolutePath, "utf8"));
  }
}

function checkWebEntrypointsUsePublicProfile() {
  const entrypoints = [
    "packages/web/src/vivi-model-element.ts",
    "packages/viewer/src/hooks/useModelSession.ts",
  ];
  for (const relativePath of entrypoints) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    const text = fs.readFileSync(absolutePath, "utf8");
    if (!text.includes('profile: "publicProfileV1"')) {
      failures.push(`${relativePath}: parseViviFile must request publicProfileV1`);
    }
  }
}

function checkExperimentalPackageMetadata(workspaces) {
  for (const workspace of workspaces) {
    const publication = workspace.pkg.vivi2d?.publication;
    if (!PUBLICATION_STATUSES.has(publication)) continue;

    const metadata = [
      workspace.pkg.name,
      workspace.pkg.description,
      ...(workspace.pkg.keywords ?? []),
    ]
      .filter(Boolean)
      .join("\n");
    scanText(workspace.relativePath, metadata);
  }
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function checkPublicPackageExportAllowlist(workspaces) {
  for (const workspace of workspaces) {
    const publication = workspace.pkg.vivi2d?.publication;
    if (!PUBLICATION_STATUSES.has(publication)) continue;

    const allowlist = PUBLIC_PACKAGE_EXPORT_ALLOWLIST[workspace.pkg.name];
    if (!allowlist) {
      failures.push(
        `${workspace.relativePath}: public/experimental package is missing an export allowlist entry`,
      );
      continue;
    }

    if (workspace.pkg.private === true) {
      failures.push(`${workspace.relativePath}: public package must not be private`);
    }

    if (stableJson(workspace.pkg.exports ?? {}) !== stableJson(allowlist.exports)) {
      failures.push(`${workspace.relativePath}: exports do not match allowlist`);
    }

    if (stableJson(workspace.pkg.files ?? []) !== stableJson(allowlist.files)) {
      failures.push(`${workspace.relativePath}: files do not match allowlist`);
    }
  }
}

function scanBundleRuntimeSignatures(distDir, label) {
  if (!fs.existsSync(distDir)) return;

  const stack = [distDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
      if (!TEXT_EXTENSIONS.has(path.extname(relativePath))) continue;
      if (PUBLIC_BUNDLE_FILENAME_PATTERN.test(path.basename(relativePath))) {
        failures.push(
          `${relativePath}: ${label} bundle exposes private feature module name`,
        );
      }
      const text = fs.readFileSync(absolutePath, "utf8");
      for (const signature of PUBLIC_BUNDLE_RUNTIME_SIGNATURES) {
        if (text.includes(signature)) {
          failures.push(
            `${relativePath}: ${label} bundle contains private runtime signature ${signature}`,
          );
        }
      }
    }
  }
}

function scanPublicBundleRuntimeSignatures() {
  scanBundleRuntimeSignatures(path.join(root, "packages/web/dist"), "web package");
  scanBundleRuntimeSignatures(path.join(root, "dist"), "app");
}

const workspaces = collectWorkspacePackages();
scanPublicDocs();
scanPublicExamples();
scanPublicAppSourceSurface();
scanLocalePublicCopySurface();
scanPublicPackageSources(workspaces);
checkWebEntrypointsUsePublicProfile();
checkExperimentalPackageMetadata(workspaces);
checkPublicPackageExportAllowlist(workspaces);
scanAutoSetupWorkflowSurface();
scanPublicBundleRuntimeSignatures();

if (failures.length > 0) {
  console.error("[ip-product-profile] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[ip-product-profile] passed");
