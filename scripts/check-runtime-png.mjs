import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const nativeManifest = path.join(root, "packages/runtime-native/Cargo.toml");
const headerPath = path.join(root, "packages/runtime-c-abi/include/vivi_png.h");
const layoutPath = path.join(root, "packages/runtime-c-abi/tests/png-header-layout.c");
const fixturePath = path.join(
  root,
  "packages/runtime-native/crates/vivi-png-ref/tests/fixtures/png-rgba8-v1.json",
);
const libraryBaseName = "vivi_runtime_native_c_abi";
const tmpRoot = path.join(root, "tmp");

const v01Exports = [
  "vivi_get_abi_version",
  "vivi_get_runtime_version",
  "vivi_get_supported_spec_version_range",
  "vivi_runtime_create",
  "vivi_runtime_destroy",
  "vivi_runtime_last_error_message",
  "vivi_model_last_error_message",
  "vivi_model_load",
  "vivi_model_destroy",
  "vivi_model_get_spec_version",
  "vivi_model_set_input",
  "vivi_model_get_input",
  "vivi_model_update",
  "vivi_model_play_clip",
  "vivi_model_stop_clip",
  "vivi_model_seek_clip",
  "vivi_model_set_state_machine_state",
  "vivi_model_get_state_machine_state",
  "vivi_model_parameter_count",
  "vivi_model_parameter_info",
  "vivi_model_texture_count",
  "vivi_model_texture_snapshot",
  "vivi_model_expression_preset_count",
  "vivi_model_expression_preset_info",
  "vivi_model_expression_preset_value",
  "vivi_model_apply_expression_preset",
  "vivi_model_mesh_count",
  "vivi_model_mesh_snapshot",
  "vivi_model_mesh_snapshot_by_id",
  "vivi_model_hit_test",
  "vivi_model_get_playback_state",
];
const v02Exports = [
  "vivi_model_draw_command_count",
  "vivi_model_draw_commands",
  "vivi_model_generations",
  "vivi_model_render_mesh_count_v2",
  "vivi_model_render_mesh_snapshot_v2",
  "vivi_model_required_render_features",
];
const pngExports = ["vivi_png_decode", "vivi_png_inspect"];
const editorOnlyExports = ["vivi_model_load_evaluation"];

const expectedRustClosure = [
  dependency(
    "adler2",
    "2.0.1",
    "0BSD OR MIT OR Apache-2.0",
    "320119579fcad9c21884f5c4861d16174d0e06250625266f50fe6898340abefa",
  ),
  dependency(
    "block-buffer",
    "0.10.4",
    "MIT OR Apache-2.0",
    "3078c7629b62d3f0439517fa394996acacc5cbc91c5a20d8c658e77abd503a71",
  ),
  dependency(
    "cfg-if",
    "1.0.4",
    "MIT OR Apache-2.0",
    "9330f8b2ff13f34540b44e946ef35111825727b38d33286ef986142615121801",
  ),
  dependency(
    "cpufeatures",
    "0.2.17",
    "MIT OR Apache-2.0",
    "59ed5838eebb26a2bb2e58f6d5b5316989ae9d08bab10e0e6d103e656d1b0280",
  ),
  dependency(
    "crypto-common",
    "0.1.7",
    "MIT OR Apache-2.0",
    "78c8292055d1c1df0cce5d180393dc8cce0abec0a7102adb6c7b1eef6016d60a",
  ),
  dependency(
    "digest",
    "0.10.7",
    "MIT OR Apache-2.0",
    "9ed9a281f7bc9b7576e61468ba615a66a5c8cfdff42420a70aa82701a3b1e292",
  ),
  dependency(
    "generic-array",
    "0.14.7",
    "MIT",
    "85649ca51fd72272d7821adaf274ad91c288277713d9c18820d8499a7ff69e9a",
  ),
  dependency(
    "libc",
    "0.2.189",
    "MIT OR Apache-2.0",
    "3eaf3ede3fee6db1a4c2ee091bf8a8b4dccdc6d17f656fb07896ee72867612f2",
  ),
  dependency(
    "miniz_oxide",
    "0.8.9",
    "MIT OR Zlib OR Apache-2.0",
    "1fa76a2c86f704bdb222d66965fb3d63269ce38518b83cb0575fca855ebb6316",
  ),
  dependency(
    "sha2",
    "0.10.9",
    "MIT OR Apache-2.0",
    "a7507d819769d01a365ab707794a4084392c824f54a7a6a7862f8c3d0892b283",
  ),
  dependency(
    "typenum",
    "1.20.1",
    "MIT OR Apache-2.0",
    "b6f5e870be6c3b371b77fe0ee0bafb859fa4964b4404c27de1d380043c4dda20",
  ),
  dependency(
    "version_check",
    "0.9.5",
    "MIT/Apache-2.0",
    "0b928f33d975fc6ad9f86c8f283853ad26bdd5b10b7f1542aa2fa15e2289105a",
  ),
  {
    name: "vivi-png-ref",
    version: "0.1.0",
    license: "Apache-2.0",
    source: null,
    checksum: null,
  },
];

const expectedRustDevClosure = [
  dependency(
    "base64",
    "0.22.1",
    "MIT OR Apache-2.0",
    "72b3254f16251a8381aa12e40e3c4d2f0199f8c6508fbecb9d91f575e0fbb8c6",
  ),
  dependency(
    "itoa",
    "1.0.18",
    "MIT OR Apache-2.0",
    "8f42a60cbdf9a97f5d2305f08a87dc4e09308d1276d28c869c684d7777685682",
  ),
  dependency(
    "memchr",
    "2.8.0",
    "Unlicense OR MIT",
    "f8ca58f447f06ed17d5fc4043ce1b10dd205e060fb3ce5b979b8ed8e59ff3f79",
  ),
  dependency(
    "proc-macro2",
    "1.0.106",
    "MIT OR Apache-2.0",
    "8fd00f0bb2e90d81d1044c2b32617f68fcb9fa3bb7640c23e9c748e53fb30934",
  ),
  dependency(
    "quote",
    "1.0.45",
    "MIT OR Apache-2.0",
    "41f2619966050689382d2b44f664f4bc593e129785a36d6ee376ddf37259b924",
  ),
  dependency(
    "serde",
    "1.0.228",
    "MIT OR Apache-2.0",
    "9a8e94ea7f378bd32cbbd37198a4a91436180c5bb472411e48b5ec2e2124ae9e",
  ),
  dependency(
    "serde_core",
    "1.0.228",
    "MIT OR Apache-2.0",
    "41d385c7d4ca58e59fc732af25c3983b67ac852c1a25000afe1175de458b67ad",
  ),
  dependency(
    "serde_derive",
    "1.0.228",
    "MIT OR Apache-2.0",
    "d540f220d3187173da220f885ab66608367b6574e925011a9353e4badda91d79",
  ),
  dependency(
    "serde_json",
    "1.0.149",
    "MIT OR Apache-2.0",
    "83fc039473c5595ace860d8c4fafa220ff474b3fc6bfdb4293327f1a37e94d86",
  ),
  dependency(
    "syn",
    "2.0.117",
    "MIT OR Apache-2.0",
    "e665b8803e7b1d2a727f4023456bbbbe74da67099c585258af0ad9c5013b9b99",
  ),
  dependency(
    "unicode-ident",
    "1.0.24",
    "(MIT OR Apache-2.0) AND Unicode-3.0",
    "e6e4313cd5fcd3dad5cafa179702e2b244f760991f45397d14d4ebf38247da75",
  ),
  dependency(
    "zmij",
    "1.0.21",
    "MIT",
    "b8848ee67ecc8aedbaf3e4122217aff892639231befc6a1b58d29fff4c2cabaa",
  ),
];

mkdirSync(tmpRoot, { recursive: true });
const tmpDir = mkdtempSync(path.join(tmpRoot, "runtime-png-"));

try {
  const fixture = assertPinnedInputs();
  fixture.legacy = assertLegacyCorpus();
  assertPrivatePackInventory();
  assertRustDependencyClosure();
  compileHeaderLayouts();

  const configurations = [
    {
      label: "default ABI 0.1",
      slug: "default",
      features: [],
      expected: v01Exports,
      forbidden: [...v02Exports, ...pngExports, ...editorOnlyExports],
    },
    {
      label: "feature ABI 0.2",
      slug: "abi-v02",
      features: ["abi-v02"],
      expected: [...v01Exports, ...v02Exports],
      forbidden: [...pngExports, ...editorOnlyExports],
    },
    {
      label: "PNG ABI on ABI 0.1",
      slug: "png-v1",
      features: ["png-v1"],
      expected: [...v01Exports, ...pngExports],
      forbidden: [...v02Exports, ...editorOnlyExports],
    },
    {
      label: "PNG ABI on ABI 0.2",
      slug: "abi-v02-png-v1",
      features: ["abi-v02", "png-v1"],
      expected: [...v01Exports, ...v02Exports, ...pngExports],
      forbidden: editorOnlyExports,
    },
  ];

  let pngArtifacts;
  for (const configuration of configurations) {
    const artifacts = buildCAbiArtifacts(configuration);
    assertExactDynamicExports(
      artifacts.dynamicLibrary,
      configuration.expected,
      configuration.label,
      configuration.forbidden,
    );
    if (configuration.slug === "png-v1") pngArtifacts = artifacts;
  }
  if (!pngArtifacts) throw new Error("PNG feature artifacts were not built");

  runNativeHosts(pngArtifacts, fixture);
  console.log(
    "[runtime-png] passed (header/fixture/dependencies/pack, exact exports, C11/C++17 dynamic+static hosts)",
  );
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

function dependency(name, version, license, checksum) {
  return {
    name,
    version,
    license,
    source: "registry+https://github.com/rust-lang/crates.io-index",
    checksum,
  };
}

function assertPinnedInputs() {
  assertFilePin(
    headerPath,
    6_749,
    "69f2e75c9386725223417f92c3987ee4a3c1af69ccb11b2e2e45cd98941ca958",
  );
  assertFilePin(
    fixturePath,
    8_547,
    "ce24e9fc5daef4aa5584ec5bb54892ba87c16b368001da8453a65f836cbc5956",
  );
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  if (fixture.schema !== "vivi2d.contractFreeze.pngRgba8Fixtures.v1") {
    throw new Error(`unexpected PNG fixture schema: ${fixture.schema}`);
  }
  const accept = fixture.accept.find(
    (entry) => entry.id === "rgba-alpha-zero-preserves-rgb",
  );
  const malformed = fixture.reject.find((entry) => entry.id === "bad-crc");
  const unsupported = fixture.reject.find((entry) => entry.id === "adam7-interlace");
  if (!accept || !malformed || !unsupported) {
    throw new Error("PNG host vectors are missing from the tracked fixture copy");
  }
  for (const vector of [accept, malformed, unsupported]) {
    const bytes = Buffer.from(vector.base64, "base64");
    if (sha256(bytes) !== vector.expectedSha256) {
      throw new Error(`${vector.id}: fixture raw PNG SHA-256 drift`);
    }
  }
  if (
    accept.expected.width !== 1 ||
    accept.expected.height !== 1 ||
    accept.expected.rgbaHex !== "12345600" ||
    malformed.expectedError !== "malformed" ||
    unsupported.expectedError !== "unsupported"
  ) {
    throw new Error("PNG host vector expectations drifted");
  }
  return { accept, malformed, unsupported };
}

function assertLegacyCorpus() {
  const expectedFiles = [
    {
      path: "examples/web-sdk-basic/public/generated-avatar.vivi",
      bytes: 1_540,
      sha256: "0c99679e479d1b8daf008852e1e8e59b8205a9793f8c10d0f7b90bb3347da24f",
    },
    {
      path: "packages/viewer/e2e/fixtures/test-large.vivi",
      bytes: 19_628,
      sha256: "3f2c6c82c40fa450f3c6daa10d318cad02536a9646462708ec9713bbf0740621",
    },
    {
      path: "packages/viewer/e2e/fixtures/test.vivi",
      bytes: 1_462,
      sha256: "07790a13453d417b573957ab56732f5fac14e71ba199f5355d6e3613be1b42ff",
    },
  ];
  const tracked = runCapture("git", ["ls-files", "-z", "--", "*.vivi", "*.vivb"])
    .split("\0")
    .filter(Boolean)
    .sort();
  assertExactList(
    tracked,
    expectedFiles.map((entry) => entry.path).sort(),
    "tracked legacy .vivi/.vivb corpus inventory",
  );

  return expectedFiles.map((entry) => {
    const filePath = path.join(root, entry.path);
    assertFilePin(filePath, entry.bytes, entry.sha256);
    const project = JSON.parse(readFileSync(filePath, "utf8"));
    if (!Array.isArray(project.atlases) || project.atlases.length !== 1) {
      throw new Error(`${entry.path}: expected exactly one legacy atlas`);
    }
    const atlas = project.atlases[0];
    const png = Buffer.from(atlas.image, "base64");
    if (
      atlas.width !== 50 ||
      atlas.height !== 50 ||
      png.length !== 124 ||
      sha256(png) !== "e96718c2446ee1508c58808d15b103b9c2dfc93a53952ca0164b1b9a16179859"
    ) {
      throw new Error(`${entry.path}: legacy PNG 50x50/124-byte/SHA pin drifted`);
    }
    return { path: entry.path, png, width: atlas.width, height: atlas.height };
  });
}

function assertFilePin(filePath, expectedBytes, expectedSha256) {
  const bytes = readFileSync(filePath);
  if (bytes.length !== expectedBytes || sha256(bytes) !== expectedSha256) {
    throw new Error(
      `${path.relative(root, filePath)} pin mismatch: bytes=${bytes.length}, sha256=${sha256(bytes)}`,
    );
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertPrivatePackInventory() {
  const output = runCapture("npm", [
    "pack",
    "--workspace",
    "@vivi2d/runtime-c-abi",
    "--json",
    "--dry-run",
  ]);
  const pack = JSON.parse(output);
  const actual = (pack[0]?.files ?? []).map((file) => file.path).sort();
  const expected = [
    "include/vivi_runtime.h",
    "package.json",
    "samples/minimal-host.c",
    "tests/header-layout.c",
  ].sort();
  assertExactList(actual, expected, "@vivi2d/runtime-c-abi dry-run pack inventory");
}

function assertRustDependencyClosure() {
  const metadata = readCargoMetadata();
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const rootPackage = metadata.packages.find((pkg) => pkg.name === "vivi-png-ref");
  if (!rootPackage) throw new Error("cargo metadata omitted vivi-png-ref");

  assertRustFeatureGraph(metadata, rootPackage);

  const productionClosure = new Set();
  visitDependency(rootPackage.id, nodes, productionClosure, new Set([null, "build"]));
  const devClosure = new Set();
  for (const dependencyEdge of nodes.get(rootPackage.id)?.deps ?? []) {
    if (dependencyEdge.dep_kinds.some((kind) => kind.kind === "dev")) {
      visitDependency(dependencyEdge.pkg, nodes, devClosure, new Set([null, "build"]));
    }
  }
  for (const productionId of productionClosure) devClosure.delete(productionId);
  const lockPackages = readCargoLockPackages();
  const actualProduction = dependencyInventory(productionClosure, packages, lockPackages);
  const actualDev = dependencyInventory(devClosure, packages, lockPackages);
  assertDependencyInventory(
    actualProduction,
    expectedRustClosure,
    "vivi-png-ref production/build",
  );
  assertDependencyInventory(actualDev, expectedRustDevClosure, "vivi-png-ref dev-only");

  const reviewedLicenses = new Set([
    "Apache-2.0",
    "MIT",
    "MIT OR Apache-2.0",
    "0BSD OR MIT OR Apache-2.0",
    "MIT OR Zlib OR Apache-2.0",
    "Unlicense OR MIT",
    "(MIT OR Apache-2.0) AND Unicode-3.0",
    // crates.io version_check 0.9.5 retains this legacy pre-SPDX spelling.
    "MIT/Apache-2.0",
  ]);
  for (const pkg of [...actualProduction, ...actualDev]) {
    if (!reviewedLicenses.has(pkg.license)) {
      throw new Error(
        `${pkg.name}@${pkg.version}: unreviewed Rust license ${pkg.license}`,
      );
    }
  }
}

function readCargoMetadata(features = []) {
  const args = [
    "metadata",
    "--locked",
    "--format-version=1",
    "--manifest-path",
    nativeManifest,
    "--no-default-features",
  ];
  if (features.length > 0) {
    args.push(
      "--features",
      features.map((feature) => `vivi-runtime-native-c-abi/${feature}`).join(","),
    );
  }
  return JSON.parse(runCapture("cargo", args));
}

function assertRustFeatureGraph(metadata, pngPackage) {
  const expectedPngManifest = path.join(
    root,
    "packages/runtime-native/crates/vivi-png-ref/Cargo.toml",
  );
  if (
    pngPackage.version !== "0.1.0" ||
    JSON.stringify(pngPackage.publish) !== "[]" ||
    JSON.stringify(pngPackage.features) !== "{}" ||
    path.resolve(pngPackage.manifest_path) !== path.resolve(expectedPngManifest)
  ) {
    throw new Error("vivi-png-ref identity, publish=false, or feature surface drifted");
  }

  const cAbiPackage = metadata.packages.find(
    (pkg) => pkg.name === "vivi-runtime-native-c-abi",
  );
  if (!cAbiPackage) throw new Error("cargo metadata omitted C ABI crate");
  if (
    JSON.stringify(cAbiPackage.features.default) !== "[]" ||
    JSON.stringify(cAbiPackage.features["png-v1"]) !==
      JSON.stringify(["dep:vivi-png-ref"])
  ) {
    throw new Error("C ABI default/png-v1 feature graph drifted");
  }

  const pngFeatureReferences = Object.entries(cAbiPackage.features).filter(
    ([, members]) => members.some((member) => member.includes("vivi-png-ref")),
  );
  if (
    JSON.stringify(pngFeatureReferences) !==
    JSON.stringify([["png-v1", ["dep:vivi-png-ref"]]])
  ) {
    throw new Error("vivi-png-ref must be reachable only through C ABI png-v1");
  }

  const optionalDependencies = cAbiPackage.dependencies.filter(
    (dependency) => dependency.optional,
  );
  const pngDependency = optionalDependencies[0];
  const expectedPngPath = path.join(root, "packages/runtime-native/crates/vivi-png-ref");
  if (
    optionalDependencies.length !== 1 ||
    pngDependency.name !== "vivi-png-ref" ||
    pngDependency.kind !== null ||
    pngDependency.source !== null ||
    path.resolve(pngDependency.path) !== path.resolve(expectedPngPath)
  ) {
    throw new Error("C ABI vivi-png-ref optional path dependency edge drifted");
  }

  const expectedDirectDependencies = new Map([
    ["miniz_oxide", "^0.8.9"],
    ["sha2", "^0.10"],
  ]);
  const actualDirectDependencies = pngPackage.dependencies.filter(
    (dependency) => dependency.kind === null,
  );
  if (
    actualDirectDependencies.length !== expectedDirectDependencies.size ||
    actualDirectDependencies.some(
      (dependency) =>
        expectedDirectDependencies.get(dependency.name) !== dependency.req ||
        dependency.optional ||
        dependency.uses_default_features ||
        dependency.features.length !== 0,
    )
  ) {
    throw new Error("vivi-png-ref direct dependencies/default-feature isolation drifted");
  }

  assertCAbiResolveFeatures(metadata, [], false);
  assertCAbiResolveFeatures(readCargoMetadata(["abi-v02"]), ["abi-v02"], false);
  assertCAbiResolveFeatures(readCargoMetadata(["png-v1"]), ["png-v1"], true);
}

function assertCAbiResolveFeatures(metadata, expectedFeatures, expectPngEdge) {
  const cAbiPackage = metadata.packages.find(
    (pkg) => pkg.name === "vivi-runtime-native-c-abi",
  );
  const cAbiNode = metadata.resolve.nodes.find((node) => node.id === cAbiPackage?.id);
  if (!cAbiPackage || !cAbiNode) {
    throw new Error("cargo resolve omitted C ABI crate");
  }
  if (JSON.stringify(cAbiNode.features) !== JSON.stringify(expectedFeatures)) {
    throw new Error(
      `C ABI resolved features drifted: ${JSON.stringify(cAbiNode.features)}`,
    );
  }
  const resolvedDependencyNames = cAbiNode.deps.map(
    (dependency) => metadata.packages.find((pkg) => pkg.id === dependency.pkg)?.name,
  );
  if (resolvedDependencyNames.includes("vivi-png-ref") !== expectPngEdge) {
    throw new Error("default/abi-v02/png-v1 decoder edge isolation drifted");
  }

  for (const name of ["miniz_oxide", "sha2"]) {
    const dependencyPackage = metadata.packages.find((pkg) => pkg.name === name);
    const dependencyNode = metadata.resolve.nodes.find(
      (node) => node.id === dependencyPackage?.id,
    );
    if (!dependencyPackage || !dependencyNode || dependencyNode.features.length !== 0) {
      throw new Error(`${name}: resolved default features must remain disabled`);
    }
  }
}

function visitDependency(id, nodes, closure, followedKinds) {
  if (closure.has(id)) return;
  closure.add(id);
  for (const dependencyEdge of nodes.get(id)?.deps ?? []) {
    if (dependencyEdge.dep_kinds.some((kind) => followedKinds.has(kind.kind))) {
      visitDependency(dependencyEdge.pkg, nodes, closure, followedKinds);
    }
  }
}

function dependencyInventory(closure, packages, lockPackages) {
  return [...closure]
    .map((id) => {
      const pkg = packages.get(id);
      const lockKey = `${pkg.name}@${pkg.version}`;
      return {
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        source: pkg.source,
        checksum: lockPackages.get(lockKey)?.checksum ?? null,
      };
    })
    .sort(compareDependencies);
}

function assertDependencyInventory(actual, expectedInventory, label) {
  const expected = [...expectedInventory].sort(compareDependencies);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} dependency/license/lock closure drifted\nexpected=${JSON.stringify(expected, null, 2)}\nactual=${JSON.stringify(actual, null, 2)}`,
    );
  }
}

function readCargoLockPackages() {
  const lock = readFileSync(
    path.join(root, "packages/runtime-native/Cargo.lock"),
    "utf8",
  );
  const packages = new Map();
  for (const block of lock.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = /^name = "([^"]+)"$/m.exec(block)?.[1];
    const version = /^version = "([^"]+)"$/m.exec(block)?.[1];
    const checksum = /^checksum = "([^"]+)"$/m.exec(block)?.[1] ?? null;
    if (name && version) packages.set(`${name}@${version}`, { checksum });
  }
  return packages;
}

function compareDependencies(left, right) {
  return left.name.localeCompare(right.name) || left.version.localeCompare(right.version);
}

function compileHeaderLayouts() {
  if (process.platform === "win32") {
    const compiler = findMsvcCompiler();
    if (!compiler) throw new Error("MSVC is required for the Windows PNG ABI gate");
    for (const [standard, mode] of [
      ["/std:c11", "/TC"],
      ["/std:c++17", "/TP"],
    ]) {
      runMsvc(compiler, [
        "/nologo",
        standard,
        "/W4",
        "/WX",
        "/utf-8",
        mode,
        `/I${path.dirname(headerPath)}`,
        "/Zs",
        layoutPath,
      ]);
    }
    return;
  }
  for (const [compiler, standard, language] of [
    [requiredCommand([process.env.CC, "cc", "gcc", "clang"]), "c11", "c"],
    [requiredCommand([process.env.CXX, "c++", "g++", "clang++"]), "c++17", "c++"],
  ]) {
    run(compiler, [
      `-std=${standard}`,
      "-Wall",
      "-Wextra",
      "-Wpedantic",
      "-Werror",
      "-x",
      language,
      `-I${path.dirname(headerPath)}`,
      "-fsyntax-only",
      layoutPath,
    ]);
  }
}

function buildCAbiArtifacts(configuration) {
  const targetDir = path.join(tmpDir, "cargo-target", configuration.slug);
  const args = [
    "build",
    "--locked",
    "--manifest-path",
    nativeManifest,
    "-p",
    "vivi-runtime-native-c-abi",
    "--no-default-features",
  ];
  if (configuration.features.length > 0) {
    args.push("--features", configuration.features.join(","));
  }
  args.push("--message-format=json-render-diagnostics");
  const result = spawnSync("cargo", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CARGO_TARGET_DIR: targetDir },
    windowsHide: true,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    throw new Error(`${configuration.label} cargo build failed`);
  }

  const filenames = new Set();
  for (const line of (result.stdout ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      message.reason !== "compiler-artifact" ||
      message.target?.name !== libraryBaseName ||
      !String(message.package_id).includes("vivi-runtime-native-c-abi")
    ) {
      continue;
    }
    for (const filename of message.filenames ?? []) {
      filenames.add(path.resolve(root, filename));
    }
  }
  const artifacts = [...filenames].filter(existsSync);
  const dynamicLibrary = artifacts.find((filename) =>
    /(?:\.dll|\.dylib|\.so)$/i.test(filename),
  );
  const importLibrary = artifacts.find((filename) => /\.dll\.(?:lib|a)$/i.test(filename));
  const staticLibrary = artifacts.find((filename) => {
    const base = path.basename(filename).toLowerCase();
    return (
      !base.endsWith(".dll.lib") &&
      !base.endsWith(".dll.a") &&
      (base === `${libraryBaseName}.lib` || base === `lib${libraryBaseName}.a`)
    );
  });
  if (!dynamicLibrary || !staticLibrary) {
    throw new Error(
      `${configuration.label}: Cargo did not report both cdylib and staticlib (${artifacts.join(", ")})`,
    );
  }
  return {
    ...configuration,
    targetDir,
    dynamicLibrary,
    importLibrary,
    staticLibrary,
  };
}

function assertExactDynamicExports(dynamicLibrary, expected, label, explicitlyForbidden) {
  const output = readDynamicExports(dynamicLibrary);
  const actual = [
    ...new Set(
      [...output.matchAll(/\b_?(vivi_[A-Za-z0-9_]+)\b/g)].map((match) => match[1]),
    ),
  ]
    .filter((name) => name !== libraryBaseName)
    .sort();
  assertExactList(actual, [...expected].sort(), `${label} dynamic exports`);
  const forbidden = explicitlyForbidden.filter((name) => actual.includes(name));
  if (forbidden.length > 0) {
    throw new Error(`${label} contains forbidden exports: ${forbidden.join(", ")}`);
  }
}

function assertExactList(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter((entry) => !actual.includes(entry));
    const unexpected = actual.filter((entry) => !expected.includes(entry));
    throw new Error(
      `${label} drifted; expected=${expected.length}, actual=${actual.length}, missing=${missing.join(",") || "none"}, unexpected=${unexpected.join(",") || "none"}`,
    );
  }
}

function readDynamicExports(dynamicLibrary) {
  if (process.platform === "win32") {
    if (commandExists("dumpbin")) {
      return runCapture("dumpbin", ["/nologo", "/exports", dynamicLibrary]);
    }
    const vcvars = findVcvars64();
    if (!vcvars) throw new Error("dumpbin is required for Windows export checks");
    const commandPath = path.join(tmpDir, "inspect-exports.cmd");
    writeFileSync(
      commandPath,
      `@echo off\r\ncall "${vcvars}" >nul\r\ndumpbin /nologo /exports "${dynamicLibrary}"\r\n`,
    );
    return runCapture("cmd.exe", ["/d", "/c", commandPath]);
  }
  const nm = requiredCommand(["nm"]);
  return process.platform === "darwin"
    ? runCapture(nm, ["-gU", dynamicLibrary])
    : runCapture(nm, ["-D", "--defined-only", dynamicLibrary]);
}

function runNativeHosts(artifacts, fixture) {
  const dynamicDir = path.join(tmpDir, "png-dynamic");
  mkdirSync(dynamicDir, { recursive: true });
  copyFileSync(
    artifacts.dynamicLibrary,
    path.join(dynamicDir, path.basename(artifacts.dynamicLibrary)),
  );
  let importLibrary;
  if (process.platform === "win32") {
    if (!artifacts.importLibrary) {
      throw new Error("Cargo omitted the Windows PNG DLL import library");
    }
    importLibrary = path.join(dynamicDir, `${libraryBaseName}.lib`);
    copyFileSync(artifacts.importLibrary, importLibrary);
  }

  const source = pngHostSource(fixture);
  const cSource = path.join(tmpDir, "png-host.c");
  const cppSource = path.join(tmpDir, "png-host.cpp");
  writeFileSync(cSource, source);
  writeFileSync(cppSource, source);
  const staticLinkArgs = nativeStaticLinkArgs(artifacts);

  if (process.platform === "win32") {
    const compiler = findMsvcCompiler();
    if (!compiler) throw new Error("MSVC is required for Windows PNG hosts");
    for (const [language, sourcePath, standard, mode] of [
      ["c", cSource, "/std:c11", "/TC"],
      ["cpp", cppSource, "/std:c++17", "/TP"],
    ]) {
      compileMsvcHost(
        compiler,
        `${language}-dynamic`,
        sourcePath,
        standard,
        mode,
        ["/DVIVI_RUNTIME_SHARED"],
        [importLibrary],
        dynamicDir,
      );
      compileMsvcHost(
        compiler,
        `${language}-static`,
        sourcePath,
        standard,
        mode,
        [],
        [artifacts.staticLibrary, ...staticLinkArgs],
        null,
      );
    }
    return;
  }

  for (const [language, compiler, sourcePath, standard] of [
    ["c", requiredCommand([process.env.CC, "cc", "gcc", "clang"]), cSource, "c11"],
    [
      "cpp",
      requiredCommand([process.env.CXX, "c++", "g++", "clang++"]),
      cppSource,
      "c++17",
    ],
  ]) {
    const common = [
      `-std=${standard}`,
      "-Wall",
      "-Wextra",
      "-Wpedantic",
      "-Werror",
      `-I${path.dirname(headerPath)}`,
      sourcePath,
    ];
    const dynamicExe = path.join(tmpDir, `png-host-${language}-dynamic`);
    const rpath = process.platform === "darwin" ? "@loader_path" : "$ORIGIN";
    run(compiler, [
      ...common,
      "-DVIVI_RUNTIME_SHARED",
      `-L${dynamicDir}`,
      `-l${libraryBaseName}`,
      `-Wl,-rpath,${rpath}`,
      "-o",
      dynamicExe,
    ]);
    runHost(dynamicExe, dynamicDir);

    const staticExe = path.join(tmpDir, `png-host-${language}-static`);
    run(compiler, [
      ...common,
      artifacts.staticLibrary,
      ...staticLinkArgs,
      "-o",
      staticExe,
    ]);
    runHost(staticExe);
  }
}

function compileMsvcHost(
  compiler,
  label,
  sourcePath,
  standard,
  mode,
  compileArgs,
  linkArgs,
  runtimeDirectory,
) {
  const exePath = path.join(tmpDir, executableName(`png-host-${label}`));
  runMsvc(compiler, [
    "/nologo",
    standard,
    "/W4",
    "/WX",
    "/MD",
    "/utf-8",
    mode,
    `/I${path.dirname(headerPath)}`,
    sourcePath,
    `/Fe:${exePath}`,
    `/Fo:${path.join(tmpDir, `png-host-${label}.obj`)}`,
    ...compileArgs,
    "/link",
    "/WX",
    ...linkArgs,
  ]);
  runHost(exePath, runtimeDirectory);
}

function nativeStaticLinkArgs(artifacts) {
  const args = [
    "rustc",
    "--locked",
    "--manifest-path",
    nativeManifest,
    "-p",
    "vivi-runtime-native-c-abi",
    "--no-default-features",
    "--features",
    "png-v1",
    "--lib",
    "--",
    "--print",
    "native-static-libs",
  ];
  const result = spawnSync("cargo", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CARGO_TARGET_DIR: artifacts.targetDir },
    windowsHide: true,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0) {
    throw new Error(`cargo rustc --print native-static-libs failed\n${output}`);
  }
  const matches = [...output.matchAll(/native-static-libs:\s*(.+)$/gm)];
  const value = matches.at(-1)?.[1]?.trim();
  if (!value) throw new Error(`Cargo did not report native static libraries\n${output}`);
  return value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(unquote) ?? [];
}

function unquote(value) {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function pngHostSource(fixture) {
  const acceptBytes = Buffer.from(fixture.accept.base64, "base64");
  const malformedBytes = Buffer.from(fixture.malformed.base64, "base64");
  const unsupportedBytes = Buffer.from(fixture.unsupported.base64, "base64");
  const acceptHash = Buffer.from(fixture.accept.expectedSha256, "hex");
  const malformedHash = Buffer.from(fixture.malformed.expectedSha256, "hex");
  const unsupportedHash = Buffer.from(fixture.unsupported.expectedSha256, "hex");
  const expectedRgba = Buffer.from(fixture.accept.expected.rgbaHex, "hex");
  const legacyHash = Buffer.from(
    "e96718c2446ee1508c58808d15b103b9c2dfc93a53952ca0164b1b9a16179859",
    "hex",
  );
  const legacyDefinitions = fixture.legacy
    .map(
      (entry, index) =>
        `static const uint8_t legacy_png_${index}[] = { ${cBytes(entry.png)} };\nstatic const uint8_t legacy_hash_${index}[32] = { ${cBytes(legacyHash)} };`,
    )
    .join("\n");
  const legacyPointers = fixture.legacy
    .map((_, index) => `legacy_png_${index}`)
    .join(", ");
  const legacySizes = fixture.legacy
    .map((_, index) => `sizeof(legacy_png_${index})`)
    .join(", ");
  const legacyHashes = fixture.legacy
    .map((_, index) => `legacy_hash_${index}`)
    .join(", ");
  return `#include "vivi_png.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CHECK(condition) do { if (!(condition)) { fprintf(stderr, "PNG host check failed at line %d\\n", __LINE__); return __LINE__; } } while (0)

static const uint8_t accept_png[] = { ${cBytes(acceptBytes)} };
static const uint8_t accept_hash[32] = { ${cBytes(acceptHash)} };
static const uint8_t expected_rgba[] = { ${cBytes(expectedRgba)} };
static const uint8_t malformed_png[] = { ${cBytes(malformedBytes)} };
static const uint8_t malformed_hash[32] = { ${cBytes(malformedHash)} };
static const uint8_t unsupported_png[] = { ${cBytes(unsupportedBytes)} };
static const uint8_t unsupported_hash[32] = { ${cBytes(unsupportedHash)} };
${legacyDefinitions}
static const uint8_t* const legacy_pngs[] = { ${legacyPointers} };
static const size_t legacy_png_sizes[] = { ${legacySizes} };
static const uint8_t* const legacy_hashes[] = { ${legacyHashes} };

static int all_bytes(const uint8_t* bytes, size_t len, uint8_t expected) {
  size_t index;
  for (index = 0; index < len; ++index) {
    if (bytes[index] != expected) return 0;
  }
  return 1;
}

static int run_contract(void) {
  ViviPngInfo info;
  ViviPngInfo before;
  union AlignedInfoBuffer {
    ViviPngInfo alignment;
    uint8_t bytes[sizeof(accept_png) + 1u];
  } overlap_storage, unaligned_storage;
  uint8_t output[12];
  uint8_t overlap_before[sizeof(accept_png)];
  uint8_t alias_output[40];
  uint8_t alias_before[40];
  const uint8_t zero_hash[32] = { 0 };
  uint8_t legacy_output[10000];
  size_t legacy_index;
  size_t pixel_index;
  const uint32_t valid_info_size = (uint32_t)sizeof(ViviPngInfo);
  uint8_t* oversized;

  memset(&info, 0xA5, sizeof(info));
  info.struct_size = (uint32_t)sizeof(info);
  CHECK(vivi_png_inspect(accept_png, sizeof(accept_png), 1u, 1u, &info) == VIVI_PNG_OK);
  CHECK(info.struct_size == sizeof(info));
  CHECK(info.width == 1u && info.height == 1u);
  CHECK(info._reserved0 == 0u && info.required_output_bytes == 4u);

  before = info;
  CHECK(vivi_png_inspect(accept_png, sizeof(accept_png), 2u, 1u, &info) == VIVI_PNG_ERR_DIMENSION);
  CHECK(memcmp(&before, &info, sizeof(info)) == 0);
  CHECK(vivi_png_inspect(malformed_png, sizeof(malformed_png), 1u, 1u, &info) == VIVI_PNG_ERR_MALFORMED);
  CHECK(memcmp(&before, &info, sizeof(info)) == 0);

  info.struct_size = (uint32_t)sizeof(info) - 1u;
  CHECK(vivi_png_inspect(accept_png, sizeof(accept_png), 1u, 1u, &info) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  CHECK(info.width == before.width && info.required_output_bytes == before.required_output_bytes);
  info.struct_size = (uint32_t)sizeof(info);
  CHECK(vivi_png_inspect(NULL, 0u, 1u, 1u, &info) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  CHECK(vivi_png_inspect(accept_png, sizeof(accept_png), 1u, 1u, NULL) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  CHECK(vivi_png_inspect((const uint8_t*)(uintptr_t)(UINTPTR_MAX - 3u), 8u, 1u, 1u, &info) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  memset(unaligned_storage.bytes, 0, sizeof(unaligned_storage.bytes));
  memcpy(unaligned_storage.bytes + 1, &valid_info_size, sizeof(valid_info_size));
  CHECK(vivi_png_inspect(accept_png, sizeof(accept_png), 1u, 1u, (ViviPngInfo*)(void*)(unaligned_storage.bytes + 1)) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  memcpy(overlap_storage.bytes, accept_png, sizeof(accept_png));
  overlap_storage.alignment.struct_size = (uint32_t)sizeof(ViviPngInfo);
  memcpy(overlap_before, overlap_storage.bytes, sizeof(overlap_before));
  CHECK(vivi_png_inspect(overlap_storage.bytes, sizeof(accept_png), 1u, 1u, &overlap_storage.alignment) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  CHECK(memcmp(overlap_storage.bytes, overlap_before, sizeof(overlap_before)) == 0);

  memset(output, 0xA5, sizeof(output));
  CHECK(vivi_png_decode(accept_png, sizeof(accept_png), accept_hash, 1u, 1u, output, sizeof(output)) == VIVI_PNG_OK);
  CHECK(memcmp(output, expected_rgba, sizeof(expected_rgba)) == 0);
  CHECK(all_bytes(output + sizeof(expected_rgba), sizeof(output) - sizeof(expected_rgba), 0xA5u));

  memset(output, 0xA5, sizeof(output));
  CHECK(vivi_png_decode(accept_png, sizeof(accept_png), accept_hash, 1u, 1u, output, 3u) == VIVI_PNG_ERR_LIMIT);
  CHECK(all_bytes(output, sizeof(output), 0xA5u));
  CHECK(vivi_png_decode(accept_png, sizeof(accept_png), zero_hash, 1u, 1u, output, sizeof(output)) == VIVI_PNG_ERR_CONTENT_HASH_MISMATCH);
  CHECK(all_bytes(output, sizeof(output), 0xA5u));
  CHECK(vivi_png_decode(malformed_png, sizeof(malformed_png), malformed_hash, 1u, 1u, output, sizeof(output)) == VIVI_PNG_ERR_MALFORMED);
  CHECK(all_bytes(output, sizeof(output), 0xA5u));
  CHECK(vivi_png_decode(unsupported_png, sizeof(unsupported_png), unsupported_hash, 1u, 1u, output, sizeof(output)) == VIVI_PNG_ERR_UNSUPPORTED);
  CHECK(all_bytes(output, sizeof(output), 0xA5u));
  CHECK(vivi_png_decode(accept_png, sizeof(accept_png), accept_hash, 2u, 1u, output, sizeof(output)) == VIVI_PNG_ERR_DIMENSION);
  CHECK(all_bytes(output, sizeof(output), 0xA5u));

  CHECK(vivi_png_decode(NULL, 0u, accept_hash, 1u, 1u, output, sizeof(output)) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  CHECK(vivi_png_decode(accept_png, sizeof(accept_png), NULL, 1u, 1u, output, sizeof(output)) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  CHECK(vivi_png_decode(accept_png, sizeof(accept_png), accept_hash, 1u, 1u, NULL, 0u) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  CHECK(vivi_png_decode((const uint8_t*)(uintptr_t)(UINTPTR_MAX - 3u), 8u, accept_hash, 1u, 1u, output, sizeof(output)) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  CHECK(vivi_png_decode(accept_png, sizeof(accept_png), accept_hash, 1u, 1u, (uint8_t*)(uintptr_t)(UINTPTR_MAX - 3u), 8u) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  CHECK(all_bytes(output, sizeof(output), 0xA5u));

  memcpy(overlap_storage.bytes, accept_png, sizeof(accept_png));
  CHECK(vivi_png_decode(overlap_storage.bytes, sizeof(accept_png), accept_hash, 1u, 1u, overlap_storage.bytes, sizeof(expected_rgba)) == VIVI_PNG_ERR_INVALID_ARGUMENT);
  CHECK(memcmp(overlap_storage.bytes, accept_png, sizeof(accept_png)) == 0);

  memcpy(alias_output, accept_hash, sizeof(accept_hash));
  memset(alias_output + sizeof(accept_hash), 0xA5, sizeof(alias_output) - sizeof(accept_hash));
  memcpy(alias_before, alias_output, sizeof(alias_output));
  CHECK(vivi_png_decode(accept_png, sizeof(accept_png), alias_output, 1u, 1u, alias_output, sizeof(alias_output)) == VIVI_PNG_OK);
  CHECK(memcmp(alias_output, expected_rgba, sizeof(expected_rgba)) == 0);
  CHECK(memcmp(alias_output + sizeof(expected_rgba), alias_before + sizeof(expected_rgba), sizeof(alias_output) - sizeof(expected_rgba)) == 0);

  for (legacy_index = 0; legacy_index < sizeof(legacy_pngs) / sizeof(legacy_pngs[0]); ++legacy_index) {
    memset(&info, 0xA5, sizeof(info));
    info.struct_size = (uint32_t)sizeof(info);
    CHECK(vivi_png_inspect(legacy_pngs[legacy_index], legacy_png_sizes[legacy_index], 50u, 50u, &info) == VIVI_PNG_OK);
    CHECK(info.width == 50u && info.height == 50u && info.required_output_bytes == sizeof(legacy_output));
    memset(legacy_output, 0xA5, sizeof(legacy_output));
    CHECK(vivi_png_decode(legacy_pngs[legacy_index], legacy_png_sizes[legacy_index], legacy_hashes[legacy_index], 50u, 50u, legacy_output, sizeof(legacy_output)) == VIVI_PNG_OK);
    for (pixel_index = 0; pixel_index < sizeof(legacy_output); pixel_index += 4u) {
      CHECK(legacy_output[pixel_index] == 0xFFu);
      CHECK(legacy_output[pixel_index + 1u] == 0x00u);
      CHECK(legacy_output[pixel_index + 2u] == 0x00u);
      CHECK(legacy_output[pixel_index + 3u] == 0xFFu);
    }
  }

  oversized = (uint8_t*)malloc((size_t)VIVI_PNG_RGBA8_V1_MAX_INPUT_BYTES + 1u);
  CHECK(oversized != NULL);
  memset(oversized, 0, (size_t)VIVI_PNG_RGBA8_V1_MAX_INPUT_BYTES + 1u);
  memset(output, 0xA5, sizeof(output));
  CHECK(vivi_png_decode(oversized, VIVI_PNG_RGBA8_V1_MAX_INPUT_BYTES + 1u, accept_hash, 1u, 1u, output, sizeof(output)) == VIVI_PNG_ERR_LIMIT);
  CHECK(all_bytes(output, sizeof(output), 0xA5u));
  free(oversized);
  return 0;
}

int main(void) { return run_contract(); }
`;
}

function cBytes(bytes) {
  return [...bytes].map((value) => `0x${value.toString(16).padStart(2, "0")}`).join(", ");
}

function findMsvcCompiler() {
  if (commandExists("cl")) return { command: "cl", vcvars: null };
  const vcvars = findVcvars64();
  return vcvars ? { command: "cl", vcvars } : null;
}

function findVcvars64() {
  if (process.platform !== "win32") return null;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (!programFilesX86) return null;
  const visualStudioRoot = path.join(programFilesX86, "Microsoft Visual Studio");
  if (!existsSync(visualStudioRoot)) return null;
  for (const year of safeReaddir(visualStudioRoot)) {
    if (!year.isDirectory()) continue;
    const yearPath = path.join(visualStudioRoot, year.name);
    for (const edition of safeReaddir(yearPath)) {
      if (!edition.isDirectory()) continue;
      const candidate = path.join(
        yearPath,
        edition.name,
        "VC",
        "Auxiliary",
        "Build",
        "vcvars64.bat",
      );
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function safeReaddir(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function requiredCommand(candidates) {
  for (const candidate of candidates) {
    const command = candidate?.trim();
    if (command && commandExists(command)) return command;
  }
  throw new Error(`required command not found: ${candidates.filter(Boolean).join(", ")}`);
}

function commandExists(command) {
  const result =
    process.platform === "win32"
      ? spawnSync("where.exe", [command], { stdio: "ignore" })
      : spawnSync("command", ["-v", command], { shell: true, stdio: "ignore" });
  return result.status === 0;
}

function runMsvc(compiler, args) {
  if (!compiler.vcvars) {
    run(compiler.command, args);
    return;
  }
  const commandPath = path.join(tmpDir, `msvc-${Date.now()}.cmd`);
  writeFileSync(
    commandPath,
    `@echo off\r\ncall "${compiler.vcvars}" >nul\r\n${compiler.command} ${args.map(quoteCmdArg).join(" ")}\r\n`,
  );
  run("cmd.exe", ["/d", "/c", commandPath]);
}

function runHost(exePath, libraryDirectory = null) {
  const env = { ...process.env };
  if (libraryDirectory) {
    if (process.platform === "win32") {
      env.PATH = `${libraryDirectory};${env.PATH ?? ""}`;
    } else if (process.platform === "darwin") {
      env.DYLD_LIBRARY_PATH = `${libraryDirectory}:${env.DYLD_LIBRARY_PATH ?? ""}`;
    } else {
      env.LD_LIBRARY_PATH = `${libraryDirectory}:${env.LD_LIBRARY_PATH ?? ""}`;
    }
  }
  run(exePath, [], { env });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function runCapture(command, args) {
  const npmCli = command === "npm" ? process.env.npm_execpath?.trim() : null;
  const executable = npmCli ? process.execPath : command;
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32" && command === "npm" && !npmCli,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status ?? "unknown"}: ${result.stderr}`,
    );
  }
  return result.stdout ?? "";
}

function executableName(baseName) {
  return process.platform === "win32" ? `${baseName}.exe` : baseName;
}

function quoteCmdArg(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
