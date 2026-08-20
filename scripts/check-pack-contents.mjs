import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const failures = [];

const PUBLICATION_STATUSES = new Set(["experimental", "public"]);
const KNOWN_PUBLICATION_STATUSES = new Set([
  ...PUBLICATION_STATUSES,
  "internal",
  "internal-app",
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".d.ts",
  ".html",
  ".js",
  ".json",
  ".map",
  ".md",
  ".mjs",
  ".svg",
  ".txt",
]);
const FORBIDDEN_PUBLIC_TEXT_PATTERNS = [
  {
    label: "Windows user path",
    pattern: /[A-Za-z]:[\\/]+Users[\\/]+(?![\\/]*User(?:[\\/]|$))[^\\/]+[\\/]/,
  },
  { label: "POSIX home path", pattern: /\/home\/[^/"'\s]+/ },
  { label: "local backlog path", pattern: /docs[\\/]+backlog/ },
  { label: "dev server env name", pattern: /VITE_DEV_SERVER_URL/ },
  { label: "Vite dev port", pattern: /localhost:1420|127\.0\.0\.1:1420/ },
  {
    label: "secret-looking token",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|bearer[_-]?token|bearer\s+[A-Za-z0-9._~+/=-]{12,}|client[_-]?secret|secret[_-]?key|private[_-]?key|password[_-]?(?:token|secret|hash)|credential[_-]?(?:token|secret|key))\b/i,
  },
  { label: "Zundamon review marker", pattern: /zunmon|zunda|ずんだもん/i },
  {
    label: "local motion private marker",
    pattern:
      /LocalMotionDraft|LocalPreviewSolver|LocalMotionApplyPlan|LocalPreviewFrame|BrandedLocalPreviewFrame|EditorOnlyPreview|previewOnly|previewDeformedVertices|guidedPreviewFit|motionStressPreview|\bMLS\b|\bARAP\b|Moving\s+Least\s+Squares|As[-\s]?Rigid[-\s]?As[-\s]?Possible/i,
  },
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
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

function flattenExportTargets(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenExportTargets);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenExportTargets);
  }
  return [];
}

function runNpmPack() {
  const args = ["pack", "--workspaces", "--dry-run", "--json"];
  const command =
    process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const commandArgs =
    process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr ||
        result.error?.message ||
        "npm pack --workspaces --dry-run --json failed",
    );
  }
  return JSON.parse(result.stdout);
}

function normalizeTarget(target) {
  return target.replace(/^\.\//, "");
}

function isAllowedPublicFile(filePath) {
  return (
    filePath === "package.json" ||
    filePath === "README.md" ||
    filePath === "LICENSE" ||
    filePath.startsWith("dist/")
  );
}

function findForbiddenPackEntryLabels(filePath) {
  const labels = [];
  if (filePath === "demo.html" || filePath === "packages/web/demo.html") {
    labels.push("demo.html");
  }
  if (filePath.startsWith("examples/") || filePath.includes("/examples/")) {
    labels.push("examples/**");
  }
  return labels;
}

function assertPackContentRuleSmoke() {
  const smokeCases = [
    { expectedLabel: "examples/**", filePath: "examples/web-sdk-basic/README.md" },
    {
      expectedLabel: "examples/**",
      filePath: "examples/web-sdk-basic/public/generated-avatar.vivi",
    },
    { expectedLabel: "demo.html", filePath: "demo.html" },
    { expectedLabel: "demo.html", filePath: "packages/web/demo.html" },
  ];
  for (const testCase of smokeCases) {
    const labels = findForbiddenPackEntryLabels(testCase.filePath);
    if (!labels.includes(testCase.expectedLabel)) {
      failures.push(
        `pack-content smoke did not detect ${testCase.expectedLabel} for ${testCase.filePath}.`,
      );
    }
  }
  const allowedLabels = findForbiddenPackEntryLabels("dist/index.js");
  if (allowedLabels.length > 0) {
    failures.push(
      `pack-content smoke unexpectedly rejected dist/index.js: ${allowedLabels.join(", ")}.`,
    );
  }
}

function checkPublicPackage(workspace, packInfo) {
  const packageName = workspace.pkg.name;
  const files = new Set(packInfo.files.map((file) => file.path));
  const declaredTargets = [
    workspace.pkg.main,
    workspace.pkg.module,
    workspace.pkg.types,
    ...flattenExportTargets(workspace.pkg.exports),
  ]
    .filter(Boolean)
    .map(normalizeTarget);

  for (const target of declaredTargets) {
    if (!files.has(target)) {
      failures.push(
        `${packageName} declares ${target}, but it is missing from npm pack.`,
      );
    }
  }
  for (const requiredFile of ["LICENSE", "README.md", "package.json"]) {
    if (!files.has(requiredFile)) {
      failures.push(`${packageName} npm pack is missing ${requiredFile}.`);
    }
  }

  for (const file of files) {
    for (const label of findForbiddenPackEntryLabels(file)) {
      failures.push(
        `${packageName} packs ${label}; keep demos and examples outside npm tarballs.`,
      );
    }
    if (!isAllowedPublicFile(file)) {
      failures.push(`${packageName} packs non-release file: ${file}`);
    }
    if (/(^|\/)(src|e2e|__tests__|tests?)\//.test(file)) {
      failures.push(`${packageName} packs source or test path: ${file}`);
    }
    if (/\.tsx?$/.test(file) && !file.endsWith(".d.ts")) {
      failures.push(`${packageName} packs TypeScript source: ${file}`);
    }
    for (const privateWorkspace of workspaces) {
      if (privateWorkspace.dir === workspace.dir) continue;
      const privatePublication = privateWorkspace.pkg.vivi2d?.publication;
      if (PUBLICATION_STATUSES.has(privatePublication)) continue;
      const privateDistPrefix = `dist/${path.basename(privateWorkspace.dir)}/`;
      if (file.startsWith(privateDistPrefix)) {
        failures.push(`${packageName} packs internal workspace declarations: ${file}`);
      }
    }

    const extension = path.extname(file);
    const fullPath = path.join(root, workspace.dir, file);
    if (TEXT_EXTENSIONS.has(extension) && fs.existsSync(fullPath)) {
      const text = fs.readFileSync(fullPath, "utf8");
      for (const rule of FORBIDDEN_PUBLIC_TEXT_PATTERNS) {
        if (rule.pattern.test(text)) {
          failures.push(`${packageName} packs ${rule.label} in ${file}`);
        }
      }
    }
  }

  for (const dependencyField of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const dependencyName of Object.keys(workspace.pkg[dependencyField] ?? {})) {
      const dependency = workspacesByName.get(dependencyName);
      if (!dependency) continue;
      const dependencyPublication = dependency.pkg.vivi2d?.publication;
      if (
        dependencyPublication === "internal" ||
        dependencyPublication === "internal-app"
      ) {
        failures.push(
          `${packageName} ${dependencyField} references private workspace ${dependencyName}; bundle it or make the dependency public first.`,
        );
      }
    }
  }
}

function assertProjectFormatV11InternalBoundary(packByName) {
  const model = workspacesByName.get("@vivi2d/model");
  if (!model) {
    failures.push("@vivi2d/model workspace is missing.");
    return;
  }

  const internalExportName = "./internal/project-format-v11";
  const internalExportTarget = "./src/internal/project-format-v11.ts";
  const requiredPackFiles = [
    "src/internal/project-format-v11.ts",
    "src/internal/generated/project-format-v11-validator.mjs",
    "src/internal/generated/project-format-v11-validator.d.mts",
    "src/project-format-v11/codec.ts",
    "src/project-format-v11/errors.ts",
    "src/project-format-v11/json-contract.ts",
    "src/project-format-v11/portable-primitives.ts",
    "src/project-format-v11/project-format-v11.schema.json",
    "src/project-format-v11/schema.ts",
    "src/project-format-v11/semantic.ts",
    "src/project-format-v11/types.ts",
  ];
  const exports = model.pkg.exports ?? {};
  if (Object.hasOwn(model.pkg.dependencies ?? {}, "ajv")) {
    failures.push(
      "@vivi2d/model must not declare Ajv as a runtime dependency after validator precompilation.",
    );
  }
  const packageRoot = path.resolve(root, model.dir);
  const internalCodecRoot = path.join(packageRoot, "src", "project-format-v11");
  const generatedValidator = path.join(
    packageRoot,
    "src",
    "internal",
    "generated",
    "project-format-v11-validator.mjs",
  );
  const friendEntrypoint = path.join(
    packageRoot,
    "src",
    "internal",
    "project-format-v11.ts",
  );

  if (exports[internalExportName] !== internalExportTarget) {
    failures.push(
      `@vivi2d/model must expose the Project Format v11 codec only at ${internalExportName} -> ${internalExportTarget}.`,
    );
  }

  if (!fs.existsSync(friendEntrypoint) || !fs.statSync(friendEntrypoint).isFile()) {
    failures.push("The Project Format v11 friend entrypoint is missing.");
  } else if (
    !fs.existsSync(generatedValidator) ||
    !fs.statSync(generatedValidator).isFile() ||
    !moduleGraphReachesDirectory(friendEntrypoint, packageRoot, internalCodecRoot) ||
    !moduleGraphReachesDirectory(friendEntrypoint, packageRoot, generatedValidator)
  ) {
    failures.push(
      "The Project Format v11 friend entrypoint does not transitively reach its codec and generated validator.",
    );
  } else {
    for (const [exportName, exportTarget] of Object.entries(exports)) {
      if (exportName === internalExportName) continue;
      for (const target of flattenExportTargets(exportTarget)) {
        const absoluteTarget = path.resolve(packageRoot, target);
        if (!fs.existsSync(absoluteTarget) || !fs.statSync(absoluteTarget).isFile()) {
          continue;
        }
        if (
          moduleGraphReachesDirectory(absoluteTarget, packageRoot, friendEntrypoint) ||
          moduleGraphReachesDirectory(absoluteTarget, packageRoot, internalCodecRoot) ||
          moduleGraphReachesDirectory(absoluteTarget, packageRoot, generatedValidator)
        ) {
          failures.push(
            `@vivi2d/model entry ${exportName} reaches the internal Project Format v11 codec; only ${internalExportName} may reach it.`,
          );
        }
      }
    }
  }

  const packInfo = packByName.get(model.pkg.name);
  if (!packInfo) return;
  const files = new Set(packInfo.files.map((file) => file.path));
  for (const requiredFile of requiredPackFiles) {
    if (!files.has(requiredFile)) {
      failures.push(
        `@vivi2d/model npm pack is missing internal Project Format v11 file ${requiredFile}.`,
      );
    }
  }
}

function assertModelTestsAreExcludedFromPack(packByName) {
  const model = workspacesByName.get("@vivi2d/model");
  if (!model) return;
  const packInfo = packByName.get(model.pkg.name);
  if (!packInfo) return;
  for (const file of packInfo.files) {
    if (file.path.startsWith("src/__tests__/")) {
      failures.push(
        `@vivi2d/model npm pack includes internal test artifact ${file.path}.`,
      );
    }
  }
}

function assertEvaluationPayloadV1InternalBoundary(packByName) {
  const model = workspacesByName.get("@vivi2d/model");
  if (!model) {
    failures.push("@vivi2d/model workspace is missing.");
    return;
  }

  const internalExportName = "./internal/evaluation-payload-v1";
  const internalExportTarget = "./src/internal/evaluation-payload-v1.ts";
  const requiredPackFiles = [
    "src/internal/evaluation-payload-v1.ts",
    "src/internal/generated/evaluation-v1-validators.mjs",
    "src/internal/generated/evaluation-v1-validators.d.mts",
    "src/evaluation-payload-v1.ts",
    "src/evaluation-payload-v1/schema.ts",
    "src/evaluation-payload-v1/evaluation-payload-v1.schema.json",
    "src/evaluation-payload-v1/evaluation-texture-plan-v1.schema.json",
  ];
  const forbiddenPackFiles = [
    "src/__tests__/evaluation-payload-v1.test.ts",
    "src/__tests__/evaluation-vertical-spike.test.ts",
  ];
  const exports = model.pkg.exports ?? {};
  const packageRoot = path.resolve(root, model.dir);
  const friendEntrypoint = path.join(
    packageRoot,
    "src",
    "internal",
    "evaluation-payload-v1.ts",
  );
  const builderEntrypoint = path.join(packageRoot, "src", "evaluation-payload-v1.ts");
  const schemaValidator = path.join(
    packageRoot,
    "src",
    "evaluation-payload-v1",
    "schema.ts",
  );
  const generatedValidator = path.join(
    packageRoot,
    "src",
    "internal",
    "generated",
    "evaluation-v1-validators.mjs",
  );

  if (exports[internalExportName] !== internalExportTarget) {
    failures.push(
      `@vivi2d/model must expose the Evaluation Payload v1 builder only at ${internalExportName} -> ${internalExportTarget}.`,
    );
  }

  if (!fs.existsSync(friendEntrypoint) || !fs.statSync(friendEntrypoint).isFile()) {
    failures.push("The Evaluation Payload v1 friend entrypoint is missing.");
  } else if (
    !fs.existsSync(builderEntrypoint) ||
    !fs.statSync(builderEntrypoint).isFile() ||
    !fs.existsSync(schemaValidator) ||
    !fs.statSync(schemaValidator).isFile() ||
    !fs.existsSync(generatedValidator) ||
    !fs.statSync(generatedValidator).isFile() ||
    !moduleGraphReachesDirectory(friendEntrypoint, packageRoot, builderEntrypoint) ||
    !moduleGraphReachesDirectory(friendEntrypoint, packageRoot, schemaValidator) ||
    !moduleGraphReachesDirectory(friendEntrypoint, packageRoot, generatedValidator)
  ) {
    failures.push(
      "The Evaluation Payload v1 friend entrypoint does not transitively reach its builder, schema validator, and generated validator.",
    );
  } else {
    for (const [exportName, exportTarget] of Object.entries(exports)) {
      if (exportName === internalExportName) continue;
      for (const target of flattenExportTargets(exportTarget)) {
        const absoluteTarget = path.resolve(packageRoot, target);
        if (!fs.existsSync(absoluteTarget) || !fs.statSync(absoluteTarget).isFile()) {
          continue;
        }
        if (
          moduleGraphReachesDirectory(absoluteTarget, packageRoot, friendEntrypoint) ||
          moduleGraphReachesDirectory(absoluteTarget, packageRoot, builderEntrypoint) ||
          moduleGraphReachesDirectory(absoluteTarget, packageRoot, schemaValidator) ||
          moduleGraphReachesDirectory(absoluteTarget, packageRoot, generatedValidator)
        ) {
          failures.push(
            `@vivi2d/model entry ${exportName} reaches the internal Evaluation Payload v1 builder; only ${internalExportName} may reach it.`,
          );
        }
      }
    }
  }

  const packInfo = packByName.get(model.pkg.name);
  if (!packInfo) return;
  const files = new Set(packInfo.files.map((file) => file.path));
  for (const requiredFile of requiredPackFiles) {
    if (!files.has(requiredFile)) {
      failures.push(
        `@vivi2d/model npm pack is missing internal Evaluation Payload v1 file ${requiredFile}.`,
      );
    }
  }
  for (const forbiddenFile of forbiddenPackFiles) {
    if (files.has(forbiddenFile)) {
      failures.push(
        `@vivi2d/model npm pack includes excluded Evaluation Payload v1 test artifact ${forbiddenFile}.`,
      );
    }
  }
}

function assertEditorHostInternalBoundary(packByName) {
  const editorHost = workspacesByName.get("@vivi2d/editor-host");
  if (!editorHost) {
    failures.push("@vivi2d/editor-host workspace is missing.");
    return;
  }

  if (
    editorHost.pkg.private !== true ||
    editorHost.pkg.vivi2d?.publication !== "internal"
  ) {
    failures.push("@vivi2d/editor-host must remain private/internal.");
  }

  const exports = editorHost.pkg.exports ?? {};
  const exportNames = Object.keys(exports);
  if (
    exportNames.length !== 1 ||
    exportNames[0] !== "." ||
    exports["."] !== "./src/index.ts"
  ) {
    failures.push(
      "@vivi2d/editor-host must expose only its reviewed read-only root entry at . -> ./src/index.ts.",
    );
  }

  const dependencyNames = [
    ...Object.keys(editorHost.pkg.dependencies ?? {}),
    ...Object.keys(editorHost.pkg.optionalDependencies ?? {}),
    ...Object.keys(editorHost.pkg.peerDependencies ?? {}),
  ].sort();
  if (dependencyNames.length !== 1 || dependencyNames[0] !== "@vivi2d/model") {
    failures.push(
      "@vivi2d/editor-host production dependencies must contain only @vivi2d/model.",
    );
  }

  const packageRoot = path.resolve(root, editorHost.dir);
  const rootEntrypoint = path.join(packageRoot, "src", "index.ts");
  const readOnlyHostSource = path.join(packageRoot, "src", "read-only-authoring-host.ts");
  const requiredPackFiles = [
    "portability/evaluation-payload-v1.d.ts",
    "portability/project-format-v11.d.ts",
    "src/index.ts",
    "src/read-only-authoring-host.ts",
    "tsconfig.portability.json",
  ];
  const productionFiles = collectEditorHostProductionFiles(packageRoot);
  const allowedModelFriends = new Set([
    "@vivi2d/model/internal/evaluation-payload-v1",
    "@vivi2d/model/internal/project-format-v11",
  ]);
  const observedModelFriends = new Set();

  for (const relativePath of productionFiles) {
    if (!/\.(?:c|m)?(?:j|t)sx?$/.test(relativePath)) continue;
    const absolutePath = path.join(packageRoot, relativePath);
    assertEditorHostSourceImports(
      absolutePath,
      packageRoot,
      allowedModelFriends,
      observedModelFriends,
    );
  }

  for (const friend of allowedModelFriends) {
    if (!observedModelFriends.has(friend)) {
      failures.push(
        `@vivi2d/editor-host must import the reviewed model friend ${friend}.`,
      );
    }
  }

  if (!fs.existsSync(rootEntrypoint) || !fs.statSync(rootEntrypoint).isFile()) {
    failures.push("@vivi2d/editor-host read-only root entrypoint is missing.");
  } else {
    const actualRootExports = collectNamedRootExports(rootEntrypoint);
    assertExactEditorHostExports(
      actualRootExports.value,
      new Set(["ReadOnlyAuthoringHostError", "createReadOnlyAuthoringHost"]),
      "runtime value",
    );
    assertExactEditorHostExports(
      actualRootExports.type,
      new Set([
        "AssetReadinessStateV1",
        "AssetReadinessV1",
        "EmbeddedAtlasMaterializationRequestV1",
        "EmbeddedAtlasMaterializerV1",
        "InvalidAuthoringSnapshotV1",
        "MissingAuthoringRequirementV1",
        "ReadOnlyAuthoringGuardsV1",
        "ReadOnlyAuthoringHost",
        "ReadOnlyAuthoringHostErrorCode",
        "ReadOnlyAuthoringHostInitResultV1",
        "ReadOnlyAuthoringHostOptions",
        "ReadOnlyAuthoringSnapshotV1",
        "ReadOnlyRuntimePayloadV1",
        "ReferencedAtlasResolutionRequestV1",
        "ReferencedAtlasResolutionV1",
        "ReferencedAtlasResolverV1",
        "RenderCapableAuthoringSnapshotV1",
        "VerifiedAtlasAssetV1",
      ]),
      "type",
    );
  }

  if (!fs.existsSync(readOnlyHostSource) || !fs.statSync(readOnlyHostSource).isFile()) {
    failures.push("@vivi2d/editor-host read-only host implementation is missing.");
  } else {
    const actualHostMethods = collectInterfaceMemberNames(
      readOnlyHostSource,
      "ReadOnlyAuthoringHost",
    );
    assertExactEditorHostExports(
      actualHostMethods,
      new Set([
        "buildRuntimePayload",
        "dispose",
        "getSnapshot",
        "initJson",
        "initUtf8",
        "serializeLocalDuplicate",
      ]),
      "ReadOnlyAuthoringHost method",
    );
  }

  const packInfo = packByName.get(editorHost.pkg.name);
  if (!packInfo) return;
  const packedFiles = new Set(packInfo.files.map((file) => file.path));
  for (const requiredFile of requiredPackFiles) {
    if (!packedFiles.has(requiredFile)) {
      failures.push(
        `@vivi2d/editor-host npm pack is missing required W7a file ${requiredFile}.`,
      );
    }
  }
  for (const productionFile of productionFiles) {
    if (!packedFiles.has(productionFile)) {
      failures.push(
        `@vivi2d/editor-host npm pack is missing production source ${productionFile}.`,
      );
    }
  }
  for (const packedFile of packedFiles) {
    if (isEditorHostTestPath(packedFile)) {
      failures.push(`@vivi2d/editor-host npm pack includes test artifact ${packedFile}.`);
    }
  }
}

function collectEditorHostProductionFiles(packageRoot) {
  const sourceRoot = path.join(packageRoot, "src");
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    failures.push("@vivi2d/editor-host src directory is missing.");
    return [];
  }

  const pending = [sourceRoot];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = path
        .relative(packageRoot, absolutePath)
        .replaceAll(path.sep, "/");
      if (isEditorHostTestPath(relativePath)) continue;
      if (entry.isDirectory()) pending.push(absolutePath);
      else if (entry.isFile()) files.push(relativePath);
    }
  }
  return files.sort();
}

function isEditorHostTestPath(relativePath) {
  return (
    /(^|\/)(?:__tests__|tests?)(?:\/|$)/.test(relativePath) ||
    /\.(?:test|spec)\.[^/]+$/.test(relativePath)
  );
}

function assertEditorHostSourceImports(
  sourcePath,
  packageRoot,
  allowedModelFriends,
  observedModelFriends,
) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const importedFiles = ts.preProcessFile(source, true, true).importedFiles;
  for (const imported of importedFiles) {
    const specifier = imported.fileName;
    if (specifier.startsWith(".")) {
      const target = path.resolve(path.dirname(sourcePath), specifier);
      if (!isPathInside(target, packageRoot)) {
        failures.push(
          `${path.relative(root, sourcePath)} escapes the @vivi2d/editor-host package through ${specifier}.`,
        );
      } else {
        const relativeTarget = path
          .relative(packageRoot, target)
          .replaceAll(path.sep, "/");
        if (isEditorHostTestPath(relativeTarget)) {
          failures.push(
            `${path.relative(root, sourcePath)} imports editor-host test code through ${specifier}.`,
          );
        }
      }
      continue;
    }
    if (!allowedModelFriends.has(specifier)) {
      failures.push(
        `${path.relative(root, sourcePath)} imports unapproved editor-host upstream ${specifier}.`,
      );
      continue;
    }
    observedModelFriends.add(specifier);
  }

  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      allowedModelFriends.has(statement.moduleSpecifier.text)
    ) {
      failures.push(
        `${path.relative(root, sourcePath)} must consume model friends without re-exporting them.`,
      );
    }
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@vivi2d/model/internal/project-format-v11"
    ) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      failures.push(
        `${path.relative(root, sourcePath)} must use named imports from the Project Format v11 friend.`,
      );
      continue;
    }
    for (const element of namedBindings.elements) {
      const importedName = (element.propertyName ?? element.name).text;
      if (/^serializeProjectFormatV11(?:Ordinary|Public)/.test(importedName)) {
        failures.push(
          `${path.relative(root, sourcePath)} imports forbidden ordinary/public save surface ${importedName}.`,
        );
      }
    }
  }
}

function collectNamedRootExports(entrypoint) {
  const source = fs.readFileSync(entrypoint, "utf8");
  const sourceFile = ts.createSourceFile(
    entrypoint,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const valueExports = new Set();
  const typeExports = new Set();
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      failures.push("@vivi2d/editor-host must not expose a default export.");
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
        failures.push("@vivi2d/editor-host root must not use wildcard exports.");
        continue;
      }
      for (const element of statement.exportClause.elements) {
        const target =
          statement.isTypeOnly || element.isTypeOnly ? typeExports : valueExports;
        target.add(element.name.text);
      }
      continue;
    }

    const modifiers = statement.modifiers ?? [];
    if (!modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      continue;
    }
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      failures.push("@vivi2d/editor-host must not expose a default export.");
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) valueExports.add(declaration.name.text);
        else {
          failures.push(
            "@vivi2d/editor-host root exports must use explicit identifier names.",
          );
        }
      }
    } else if (statement.name && ts.isIdentifier(statement.name)) {
      const target =
        ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
          ? typeExports
          : valueExports;
      target.add(statement.name.text);
    } else {
      failures.push(
        "@vivi2d/editor-host root contains an unsupported exported declaration.",
      );
    }
  }
  return { type: typeExports, value: valueExports };
}

function assertExactEditorHostExports(actual, expected, surfaceLabel) {
  for (const name of expected) {
    if (!actual.has(name)) {
      failures.push(
        `@vivi2d/editor-host ${surfaceLabel} surface is missing reviewed name ${name}.`,
      );
    }
  }
  for (const name of actual) {
    if (!expected.has(name)) {
      failures.push(
        `@vivi2d/editor-host ${surfaceLabel} surface exposes unreviewed name ${name}.`,
      );
    }
  }
}

function collectInterfaceMemberNames(sourcePath, interfaceName) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const declarations = sourceFile.statements.filter(
    (statement) =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === interfaceName,
  );
  if (declarations.length !== 1) {
    failures.push(
      `@vivi2d/editor-host must declare exactly one ${interfaceName} interface.`,
    );
    return new Set();
  }

  const names = new Set();
  for (const member of declarations[0].members) {
    if (
      member.name &&
      (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
    ) {
      names.add(member.name.text);
    } else {
      failures.push(
        `@vivi2d/editor-host ${interfaceName} must use explicit named members only.`,
      );
    }
  }
  return names;
}

function moduleGraphReachesDirectory(entrypoint, packageRoot, targetDirectory) {
  const pending = [entrypoint];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (isPathInside(current, targetDirectory)) return true;

    const source = fs.readFileSync(current, "utf8");
    const imports = ts.preProcessFile(source, true, true).importedFiles;
    for (const imported of imports) {
      if (!imported.fileName.startsWith(".")) continue;
      const resolved = resolveLocalSourceModule(current, imported.fileName);
      if (resolved && isPathInside(resolved, packageRoot)) pending.push(resolved);
    }
  }
  return false;
}

function resolveLocalSourceModule(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    ...[".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"].map(
      (extension) => `${base}${extension}`,
    ),
    ...["index.ts", "index.tsx", "index.mts", "index.js", "index.mjs"].map((filename) =>
      path.join(base, filename),
    ),
  ];
  return candidates.find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
}

function isPathInside(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

const workspaces = collectWorkspacePackages();
const workspacesByName = new Map(
  workspaces.map((workspace) => [workspace.pkg.name, workspace]),
);
assertPackContentRuleSmoke();
const packByName = new Map(runNpmPack().map((entry) => [entry.name, entry]));
assertProjectFormatV11InternalBoundary(packByName);
assertEvaluationPayloadV1InternalBoundary(packByName);
assertModelTestsAreExcludedFromPack(packByName);
assertEditorHostInternalBoundary(packByName);

for (const workspace of workspaces) {
  const publication = workspace.pkg.vivi2d?.publication;
  const packInfo = packByName.get(workspace.pkg.name);
  if (!packInfo) {
    failures.push(`${workspace.pkg.name} is missing from npm pack dry-run output.`);
    continue;
  }

  if (!KNOWN_PUBLICATION_STATUSES.has(publication)) {
    failures.push(
      `${workspace.pkg.name} has missing or unknown vivi2d.publication status.`,
    );
  } else if (PUBLICATION_STATUSES.has(publication)) {
    checkPublicPackage(workspace, packInfo);
  } else if (workspace.pkg.private !== true) {
    failures.push(
      `${workspace.pkg.name} is marked ${publication} but package.json private is not true.`,
    );
  }
}

if (failures.length > 0) {
  console.error("[pack-contents] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[pack-contents] passed");
