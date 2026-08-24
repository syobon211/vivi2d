import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const nativeManifestPath = "packages/runtime-native/Cargo.toml";
const storeRoot = "packages/runtime-native/crates/vivi-asset-store-local";
const storeManifestPath = `${storeRoot}/Cargo.toml`;
const resolverRoot = "packages/runtime-native/crates/vivi-asset-resolver";
const cAbiRoot = "packages/runtime-native/crates/vivi-runtime-native-c-abi";

const expectedStoreFiles = [
  "Cargo.toml",
  "src/error.rs",
  "src/filesystem.rs",
  "src/lib.rs",
  "src/principal.rs",
  "src/schema.rs",
  "src/store.rs",
  "src/tests.rs",
].sort();

const pinnedStoreFiles = [
  ["Cargo.toml", 713, "9ea1dde0d57d7413ed202c9a85751b902e8bf1eb1fda9804da9512fadff83e4e"],
  [
    "src/error.rs",
    2_254,
    "912b097381d4a86b3ca3f18ce29a6b8ce5879538a54283d8b989e3eb5453a3a8",
  ],
  [
    "src/filesystem.rs",
    12_719,
    "a44f61a02b5e6d90f4294f4de079032c2020b59b85ac4b9001862f66d7257cd7",
  ],
  ["src/lib.rs", 469, "ca85a461e3d70f703f7e1d382e1f8122e0d1577a0a5f26254fbcab3d26832489"],
  [
    "src/principal.rs",
    704,
    "c09ae03c9ca21357c2fa4d2aba196aa8363e2aec0dae2f2e84d50466e20b9d70",
  ],
  [
    "src/schema.rs",
    11_507,
    "e803c1eeabe11774491b428f61fc53218f6266cb92ff8b4cba604a7ed98f766a",
  ],
  [
    "src/store.rs",
    17_589,
    "2b74aa7e07c768f3c970d02d0a1ddcb359db87f174ff73bb7b8cdbdf5c061de4",
  ],
  [
    "src/tests.rs",
    31_749,
    "a9efb63003fcbab330a40e90a2d431f45941de9e662fbecb129c197509640c05",
  ],
];

const expectedProductionClosure = [
  registryDependency(
    "adler2",
    "2.0.1",
    "0BSD OR MIT OR Apache-2.0",
    "320119579fcad9c21884f5c4861d16174d0e06250625266f50fe6898340abefa",
  ),
  registryDependency(
    "bitflags",
    "2.13.1",
    "MIT OR Apache-2.0",
    "b588b76d00fde79687d7646a9b5bdf3cc0f655e0bbd080335a95d7e96f3587da",
  ),
  registryDependency(
    "block-buffer",
    "0.10.4",
    "MIT OR Apache-2.0",
    "3078c7629b62d3f0439517fa394996acacc5cbc91c5a20d8c658e77abd503a71",
  ),
  registryDependency(
    "cc",
    "1.4.3",
    "MIT OR Apache-2.0",
    "509591b7bcd67f4ef775afad7662703b4935daaa6ec0e5605cfb1090b32a2b6d",
  ),
  registryDependency(
    "cfg-if",
    "1.0.4",
    "MIT OR Apache-2.0",
    "9330f8b2ff13f34540b44e946ef35111825727b38d33286ef986142615121801",
  ),
  registryDependency(
    "cpufeatures",
    "0.2.17",
    "MIT OR Apache-2.0",
    "59ed5838eebb26a2bb2e58f6d5b5316989ae9d08bab10e0e6d103e656d1b0280",
  ),
  registryDependency(
    "crypto-common",
    "0.1.7",
    "MIT OR Apache-2.0",
    "78c8292055d1c1df0cce5d180393dc8cce0abec0a7102adb6c7b1eef6016d60a",
  ),
  registryDependency(
    "digest",
    "0.10.7",
    "MIT OR Apache-2.0",
    "9ed9a281f7bc9b7576e61468ba615a66a5c8cfdff42420a70aa82701a3b1e292",
  ),
  registryDependency(
    "fallible-iterator",
    "0.3.0",
    "MIT/Apache-2.0",
    "2acce4a10f12dc2fb14a218589d4f1f62ef011b2d0cc4b3cb1bba8e94da14649",
  ),
  registryDependency(
    "fallible-streaming-iterator",
    "0.1.9",
    "MIT/Apache-2.0",
    "7360491ce676a36bf9bb3c56c1aa791658183a54d2744120f27285738d90465a",
  ),
  registryDependency(
    "find-msvc-tools",
    "0.1.11",
    "MIT OR Apache-2.0",
    "d45db016d36b838f563236e9193d0ee6ce38f3f68b6c94e914b4929c96bbb890",
  ),
  registryDependency(
    "generic-array",
    "0.14.7",
    "MIT",
    "85649ca51fd72272d7821adaf274ad91c288277713d9c18820d8499a7ff69e9a",
  ),
  registryDependency(
    "itoa",
    "1.0.18",
    "MIT OR Apache-2.0",
    "8f42a60cbdf9a97f5d2305f08a87dc4e09308d1276d28c869c684d7777685682",
  ),
  registryDependency(
    "libc",
    "0.2.189",
    "MIT OR Apache-2.0",
    "3eaf3ede3fee6db1a4c2ee091bf8a8b4dccdc6d17f656fb07896ee72867612f2",
  ),
  registryDependency(
    "libsqlite3-sys",
    "0.38.2",
    "MIT",
    "f1d20bef17f513b9b3004532233187769cd072d790971f4e4da0e346eb6401e8",
  ),
  registryDependency(
    "memchr",
    "2.8.0",
    "Unlicense OR MIT",
    "f8ca58f447f06ed17d5fc4043ce1b10dd205e060fb3ce5b979b8ed8e59ff3f79",
  ),
  registryDependency(
    "miniz_oxide",
    "0.8.9",
    "MIT OR Zlib OR Apache-2.0",
    "1fa76a2c86f704bdb222d66965fb3d63269ce38518b83cb0575fca855ebb6316",
  ),
  registryDependency(
    "pkg-config",
    "0.3.34",
    "MIT OR Apache-2.0",
    "f6b464fbc74e149a392436b17d523f769e057cb6877f6a5c4618bc6f11800548",
  ),
  registryDependency(
    "proc-macro2",
    "1.0.106",
    "MIT OR Apache-2.0",
    "8fd00f0bb2e90d81d1044c2b32617f68fcb9fa3bb7640c23e9c748e53fb30934",
  ),
  registryDependency(
    "quote",
    "1.0.45",
    "MIT OR Apache-2.0",
    "41f2619966050689382d2b44f664f4bc593e129785a36d6ee376ddf37259b924",
  ),
  registryDependency(
    "rusqlite",
    "0.40.2",
    "MIT",
    "23f2a97da3e3873c73cb2a2e71b35c40ff95e0b1eefa8d72d8499a6928c3b5b3",
  ),
  registryDependency(
    "serde",
    "1.0.228",
    "MIT OR Apache-2.0",
    "9a8e94ea7f378bd32cbbd37198a4a91436180c5bb472411e48b5ec2e2124ae9e",
  ),
  registryDependency(
    "serde_core",
    "1.0.228",
    "MIT OR Apache-2.0",
    "41d385c7d4ca58e59fc732af25c3983b67ac852c1a25000afe1175de458b67ad",
  ),
  registryDependency(
    "serde_derive",
    "1.0.228",
    "MIT OR Apache-2.0",
    "d540f220d3187173da220f885ab66608367b6574e925011a9353e4badda91d79",
  ),
  registryDependency(
    "serde_json",
    "1.0.149",
    "MIT OR Apache-2.0",
    "83fc039473c5595ace860d8c4fafa220ff474b3fc6bfdb4293327f1a37e94d86",
  ),
  registryDependency(
    "sha2",
    "0.10.9",
    "MIT OR Apache-2.0",
    "a7507d819769d01a365ab707794a4084392c824f54a7a6a7862f8c3d0892b283",
  ),
  registryDependency(
    "shlex",
    "2.0.1",
    "MIT OR Apache-2.0",
    "f8fadd59c855ef2080decdef8ff161eb6661b86933c9d82e5ba29dc602a55aba",
  ),
  registryDependency(
    "smallvec",
    "1.15.2",
    "MIT OR Apache-2.0",
    "8ed6a63f02c8539c91a8685a86f4099661ba3da017932f6ebbea6de3f0fa7c90",
  ),
  registryDependency(
    "syn",
    "2.0.117",
    "MIT OR Apache-2.0",
    "e665b8803e7b1d2a727f4023456bbbbe74da67099c585258af0ad9c5013b9b99",
  ),
  registryDependency(
    "typenum",
    "1.20.1",
    "MIT OR Apache-2.0",
    "b6f5e870be6c3b371b77fe0ee0bafb859fa4964b4404c27de1d380043c4dda20",
  ),
  registryDependency(
    "unicode-ident",
    "1.0.24",
    "(MIT OR Apache-2.0) AND Unicode-3.0",
    "e6e4313cd5fcd3dad5cafa179702e2b244f760991f45397d14d4ebf38247da75",
  ),
  registryDependency(
    "vcpkg",
    "0.2.15",
    "MIT/Apache-2.0",
    "accd4ea62f7bb7a82fe23066fb0957d48ef677f6eeb8215f372f52e48bb32426",
  ),
  registryDependency(
    "version_check",
    "0.9.5",
    "MIT/Apache-2.0",
    "0b928f33d975fc6ad9f86c8f283853ad26bdd5b10b7f1542aa2fa15e2289105a",
  ),
  registryDependency(
    "windows-link",
    "0.2.1",
    "MIT OR Apache-2.0",
    "f0805222e57f7521d6a62e36fa9163bc891acd422f971defe97d64e70d0a4fe5",
  ),
  registryDependency(
    "windows-sys",
    "0.61.2",
    "MIT OR Apache-2.0",
    "ae137229bcbd6cdf0f7b80a31df61766145077ddf49416a728b02cb3921ff3fc",
  ),
  workspaceDependency("vivi-asset-resolver"),
  workspaceDependency("vivi-png-ref"),
  registryDependency(
    "zmij",
    "1.0.21",
    "MIT",
    "b8848ee67ecc8aedbaf3e4122217aff892639231befc6a1b58d29fff4c2cabaa",
  ),
];
const expectedDevClosure = [
  registryDependency(
    "base64",
    "0.22.1",
    "MIT OR Apache-2.0",
    "72b3254f16251a8381aa12e40e3c4d2f0199f8c6508fbecb9d91f575e0fbb8c6",
  ),
  registryDependency(
    "errno",
    "0.3.14",
    "MIT OR Apache-2.0",
    "39cab71617ae0d63f51a36d69f866391735b51691dbda63cf6f96d042b63efeb",
  ),
  registryDependency(
    "fastrand",
    "2.5.0",
    "Apache-2.0 OR MIT",
    "da7c62ceae207dd37ea5b845da6a0696c799f85e97da1ab5b7910be3c1c80223",
  ),
  registryDependency(
    "getrandom",
    "0.4.3",
    "MIT OR Apache-2.0",
    "300e883d756b2e4ec94e02791f39b04b522276138852cfc41d9fb7e904106099",
  ),
  registryDependency(
    "linux-raw-sys",
    "0.12.1",
    "Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT",
    "32a66949e030da00e8c7d4434b251670a91556f4144941d37452769c25d58a53",
  ),
  registryDependency(
    "once_cell",
    "1.21.4",
    "MIT OR Apache-2.0",
    "9f7c3e4beb33f85d45ae3e3a1792185706c8e16d043238c593331cc7cd313b50",
  ),
  registryDependency(
    "r-efi",
    "6.0.0",
    "MIT OR Apache-2.0 OR LGPL-2.1-or-later",
    "f8dcc9c7d52a811697d2151c701e0d08956f92b0e24136cf4cf27b57a6a0d9bf",
  ),
  registryDependency(
    "rustix",
    "1.1.4",
    "Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT",
    "b6fe4565b9518b83ef4f91bb47ce29620ca828bd32cb7e408f0062e9930ba190",
  ),
  registryDependency(
    "tempfile",
    "3.27.0",
    "MIT OR Apache-2.0",
    "32497e9a4c7b38532efcdebeef879707aa9f794296a4f0244f6f69e9bc8574bd",
  ),
];

const expectedSchemaSqlSha256 =
  "3beb69a34ef09a6067756c339eed0409cc565979dd89b18360cdcac005cdf186";

const requiredTestNames = [
  "embedded_materialization_survives_restart_and_resolves",
  "manifest_chunks_survive_restart_and_resolve",
  "wrong_principal_is_rejected_before_any_sql",
  "physical_bounds_and_length_first_reads_are_enforced",
  "multiple_media_descriptors_share_one_physical_object",
  "immutable_inserts_are_idempotent_and_never_overwrite",
  "concurrent_first_open_and_same_insert_converge",
  "schema_header_pragmas_and_principal_digest_are_pinned",
  "descriptor_last_requires_an_exact_existing_object",
  "descriptor_schema_enforces_kind_and_size_boundaries",
  "address_size_and_bytes_corruption_never_escape_as_snapshots",
  "malformed_schema_header_wal_and_live_replacement_are_rejected",
  "sqlite_prefix_lookalikes_cannot_hide_extra_schema_objects",
  "sqlite_internal_statistics_cannot_bypass_exact_schema_pin",
  "utf16_exact_schema_is_rejected_before_store_use",
  "genuine_hot_journal_recovers_even_with_a_damaged_main_header",
  "hot_journal_crash_helper",
  "preopen_links_symlinks_and_hostile_journals_are_rejected",
  "live_path_replacement_is_rejected_by_stable_file_identity",
  "windows_reparse_points_are_rejected_when_symlink_creation_is_available",
  "unix_database_parent_and_journal_symlinks_are_rejected",
  "path_sidecar_and_principal_bounds_are_rejected",
  "errors_are_fully_redacted",
  "bundled_sqlite_version_is_exactly_pinned",
  "sqlite_failures_are_classified_without_native_text",
];

try {
  assertResolverFoundationStillGreen();
  assertSourceInventory();
  const metadata = assertCargoBoundary();
  assertDependencyPins(metadata);
  assertBundledSqliteSource(metadata);
  assertSqliteBoundary();
  assertNativeOnlyIsolation(metadata);
  assertToolchainAndGateWiring();
  console.log(
    "[runtime-asset-store-local] passed (SQLite schema/config, dependency pins, native isolation)",
  );
} catch (error) {
  console.error("[runtime-asset-store-local] failed:");
  console.error(`- ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function assertResolverFoundationStillGreen() {
  runCapture(process.execPath, [resolve("scripts/check-runtime-asset-resolver.mjs")]);
}

function assertSourceInventory() {
  const actual = walkInventoryFiles(resolve(storeRoot))
    .map(toRelative)
    .map((relativePath) => relativePath.slice(`${storeRoot}/`.length))
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedStoreFiles)) {
    throw new Error(
      `local Asset store inventory drifted\nexpected=${JSON.stringify(expectedStoreFiles)}\nactual=${JSON.stringify(actual)}`,
    );
  }
  const pinnedPaths = pinnedStoreFiles.map(([relativePath]) => relativePath).sort();
  if (JSON.stringify(pinnedPaths) !== JSON.stringify(expectedStoreFiles)) {
    throw new Error("local Asset store source pins do not cover the exact inventory");
  }
  for (const [relativePath, bytes, expectedHash] of pinnedStoreFiles) {
    const filePath = `${storeRoot}/${relativePath}`;
    const contents = readFileSync(resolve(filePath));
    const actualHash = sha256(contents);
    if (contents.byteLength !== bytes || actualHash !== expectedHash) {
      throw new Error(
        `${filePath} exact source pin drifted: ${contents.byteLength}/${actualHash}`,
      );
    }
  }

  const tests = readText(`${storeRoot}/src/tests.rs`);
  const actualTestNames = [...tests.matchAll(/#\[test\]\s*fn\s+([A-Za-z0-9_]+)\s*\(/g)]
    .map((match) => match[1])
    .sort();
  const expectedTestNames = [...requiredTestNames].sort();
  if (JSON.stringify(actualTestNames) !== JSON.stringify(expectedTestNames)) {
    throw new Error(
      `local Asset store exact Rust test inventory drifted\nexpected=${JSON.stringify(expectedTestNames)}\nactual=${JSON.stringify(actualTestNames)}`,
    );
  }
}

function assertCargoBoundary() {
  const workspaceManifest = readText(nativeManifestPath);
  if (!workspaceManifest.includes('"crates/vivi-asset-store-local"')) {
    throw new Error("runtime-native workspace omits vivi-asset-store-local");
  }
  if (
    !/^rust-version = "1\.89"$/m.test(workspaceManifest) ||
    !/^edition = "2024"$/m.test(workspaceManifest)
  ) {
    throw new Error("runtime-native workspace must pin Rust 1.89 / edition 2024");
  }

  const metadata = readCargoMetadata();
  const storePackage = requirePackage(metadata, "vivi-asset-store-local");
  if (
    storePackage.version !== "0.1.0" ||
    storePackage.edition !== "2024" ||
    storePackage.rust_version !== "1.89" ||
    storePackage.license !== "Apache-2.0" ||
    JSON.stringify(storePackage.publish) !== "[]" ||
    JSON.stringify(storePackage.features) !== "{}" ||
    path.resolve(storePackage.manifest_path) !== resolve(storeManifestPath)
  ) {
    throw new Error(
      "local Asset store identity, license, Rust version, feature surface, or publish=false drifted",
    );
  }
  const libraryTargets = storePackage.targets.filter((target) =>
    target.kind.includes("lib"),
  );
  if (
    libraryTargets.length !== 1 ||
    libraryTargets[0].name !== "vivi_asset_store_local" ||
    JSON.stringify(libraryTargets[0].crate_types) !== JSON.stringify(["lib"])
  ) {
    throw new Error("local Asset store must remain a Rust-only rlib");
  }

  const expectedDirect = [
    directDependency("base64", "^0.22", "dev", true, []),
    directDependency("rusqlite", "=0.40.2", "normal", false, ["bundled", "limits"]),
    directDependency("sha2", "^0.10", "normal", false, []),
    directDependency("tempfile", "^3", "dev", true, []),
    directDependency("vivi-asset-resolver", "*", "normal", false, [], "path"),
    directDependency(
      "windows-sys",
      "=0.61.2",
      "normal",
      false,
      ["Win32_Foundation", "Win32_Storage_FileSystem"],
      "registry",
      "cfg(windows)",
    ),
  ];
  const actualDirect = storePackage.dependencies
    .map((dependency) => ({
      name: dependency.name,
      req: dependency.req,
      kind: dependency.kind ?? "normal",
      usesDefaultFeatures: dependency.uses_default_features,
      features: [...dependency.features].sort(),
      sourceKind: dependency.source === null ? "path" : "registry",
      target: dependency.target ?? null,
      optional: dependency.optional,
    }))
    .sort(compareDirectDependencies);
  if (
    JSON.stringify(actualDirect) !==
    JSON.stringify([...expectedDirect].sort(compareDirectDependencies))
  ) {
    throw new Error(
      `local Asset store direct dependency/default-feature isolation drifted\nactual=${JSON.stringify(actualDirect, null, 2)}`,
    );
  }

  const storeNode = metadata.resolve.nodes.find((node) => node.id === storePackage.id);
  if (!storeNode || JSON.stringify(storeNode.features) !== "[]") {
    throw new Error("local Asset store resolved feature surface must remain empty");
  }
  return metadata;
}

function assertDependencyPins(metadata) {
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const storePackage = requirePackage(metadata, "vivi-asset-store-local");
  const productionClosure = new Set();
  for (const dependencyEdge of nodes.get(storePackage.id)?.deps ?? []) {
    if (
      dependencyEdge.dep_kinds.some((kind) => kind.kind === null || kind.kind === "build")
    ) {
      visitDependency(
        dependencyEdge.pkg,
        nodes,
        productionClosure,
        new Set([null, "build"]),
      );
    }
  }
  const devClosure = new Set();
  for (const dependencyEdge of nodes.get(storePackage.id)?.deps ?? []) {
    if (dependencyEdge.dep_kinds.some((kind) => kind.kind === "dev")) {
      visitDependency(dependencyEdge.pkg, nodes, devClosure, new Set([null, "build"]));
    }
  }
  for (const productionId of productionClosure) devClosure.delete(productionId);

  const lockPackages = readCargoLockPackages();
  assertDependencyInventory(
    dependencyInventory(productionClosure, packages, lockPackages),
    expectedProductionClosure,
    "local Asset store production/build",
  );
  assertDependencyInventory(
    dependencyInventory(devClosure, packages, lockPackages),
    expectedDevClosure,
    "local Asset store dev-only",
  );
}

function assertBundledSqliteSource(metadata) {
  const rusqlitePackage = requirePackage(metadata, "rusqlite");
  const rusqliteNode = metadata.resolve.nodes.find(
    (node) => node.id === rusqlitePackage.id,
  );
  if (
    !rusqliteNode ||
    JSON.stringify([...rusqliteNode.features].sort()) !==
      JSON.stringify(["bundled", "limits", "modern_sqlite"])
  ) {
    throw new Error("rusqlite resolved feature closure drifted");
  }

  const sqliteSysPackage = requirePackage(metadata, "libsqlite3-sys");
  const sqliteSysNode = metadata.resolve.nodes.find(
    (node) => node.id === sqliteSysPackage.id,
  );
  const expectedSqliteSysFeatures = [
    "bundled",
    "bundled_bindings",
    "cc",
    "default",
    "min_sqlite_version_3_34_1",
    "pkg-config",
    "vcpkg",
  ];
  if (
    !sqliteSysNode ||
    JSON.stringify([...sqliteSysNode.features].sort()) !==
      JSON.stringify(expectedSqliteSysFeatures)
  ) {
    throw new Error("libsqlite3-sys bundled feature closure drifted");
  }

  const sqliteSysRoot = path.dirname(sqliteSysPackage.manifest_path);
  const sqliteHeader = readFileSync(
    path.join(sqliteSysRoot, "sqlite3", "sqlite3.h"),
    "utf8",
  );
  for (const evidence of [
    '#define SQLITE_VERSION        "3.53.2"',
    "#define SQLITE_VERSION_NUMBER 3053002",
    '#define SQLITE_SOURCE_ID      "2026-06-03 19:12:13 d6e03d8c777cfa2d35e3b60d8ec3e0187f3e9f99d8e2ee9cac695fd6fcdf1a24"',
  ]) {
    if (!sqliteHeader.includes(evidence)) {
      throw new Error(`bundled SQLite source identity drifted: ${evidence}`);
    }
  }
  const sqliteSysReadme = readFileSync(path.join(sqliteSysRoot, "README.md"), "utf8");
  if (
    !sqliteSysReadme.includes(
      "SQLite is in the public domain, as described [here](https://www.sqlite.org/copyright.html).",
    )
  ) {
    throw new Error("bundled SQLite public-domain license evidence drifted");
  }
}

function assertSqliteBoundary() {
  const manifest = readText(storeManifestPath);
  if (/^build\s*=|^\[build-dependencies\]|crate-type/m.test(manifest)) {
    throw new Error("local Asset store must not add build.rs or native export types");
  }
  if (!/features\s*=\s*\["bundled",\s*"limits"\]/.test(manifest)) {
    throw new Error("rusqlite must use the exact bundled,limits feature pair");
  }
  if (/modern_sqlite/.test(manifest)) {
    throw new Error("modern_sqlite requires a separate SQLite-version review");
  }

  const schemaSource = readText(`${storeRoot}/src/schema.rs`);
  for (const evidence of [
    "APPLICATION_ID: i64 = 0x5641_5331",
    "USER_VERSION: i64 = 1",
    "PAGE_SIZE: i64 = 4_096",
    "MAX_PAGE_COUNT: i64 = 33_554_432",
    "BUSY_TIMEOUT_MS: i64 = 5_000",
    "CACHE_SIZE_KIB: i64 = -8_192",
    "JOURNAL_SIZE_LIMIT: i64 = 0",
    'set_pragma_text(connection, "encoding", "UTF-8", "UTF-8")?',
  ]) {
    if (!schemaSource.includes(evidence)) {
      throw new Error(`local SQLite configuration pin drifted: ${evidence}`);
    }
  }
  const schemaStatements = [
    ...schemaSource.matchAll(
      /pub\(crate\) const (CREATE_[A-Z_]+_SQL): &str = "([^"]+)";/g,
    ),
  ]
    .map((match) => [match[1], match[2]])
    .sort(([left], [right]) => left.localeCompare(right));
  const schemaSqlHash = sha256(
    Buffer.from(
      schemaStatements.map(([name, sql]) => `${name}\0${sql}`).join("\n"),
      "utf8",
    ),
  );
  if (schemaStatements.length !== 3 || schemaSqlHash !== expectedSchemaSqlSha256) {
    throw new Error(
      `local SQLite exact schema SQL drifted: ${schemaSqlHash} !== ${expectedSchemaSqlSha256}`,
    );
  }

  const storeSource = readText(`${storeRoot}/src/store.rs`);
  const publicStoreMethods = [
    ...storeSource.matchAll(/^\s*pub fn ([A-Za-z0-9_]+)\s*\(/gm),
  ]
    .map((match) => match[1])
    .sort();
  const expectedPublicStoreMethods = [
    "open",
    "put_chunk_manifest_if_absent",
    "put_verified_chunk_if_absent",
  ];
  if (JSON.stringify(publicStoreMethods) !== JSON.stringify(expectedPublicStoreMethods)) {
    throw new Error(
      `local Asset store inherent public API drifted: ${publicStoreMethods.join(", ")}`,
    );
  }
  const resolverTraitImpls = [
    ...storeSource.matchAll(
      /^impl (AssetReadStore|EmbeddedBlobStore) for LocalImmutableAssetStore/gm,
    ),
  ]
    .map((match) => match[1])
    .sort();
  if (
    JSON.stringify(resolverTraitImpls) !==
    JSON.stringify(["AssetReadStore", "EmbeddedBlobStore"])
  ) {
    throw new Error(
      `local Asset store resolver trait surface drifted: ${resolverTraitImpls.join(", ")}`,
    );
  }

  const productionFiles = expectedStoreFiles.filter(
    (relativePath) => relativePath.startsWith("src/") && relativePath !== "src/tests.rs",
  );
  const productionSource = productionFiles
    .map((relativePath) => readText(`${storeRoot}/${relativePath}`))
    .join("\n");
  const requiredEvidence = [
    "SQLITE_OPEN_READ_WRITE",
    "SQLITE_OPEN_PRIVATE_CACHE",
    "SQLITE_OPEN_EXRESCODE",
    "SQLITE_OPEN_NOFOLLOW",
    "journal_mode",
    "journal_size_limit",
    "synchronous",
    "trusted_schema",
    "foreign_keys",
    "temp_store",
    "mmap_size",
    "cell_size_check",
    "cache_size",
    "max_page_count",
    "busy_timeout",
    "SQLITE_DBCONFIG_DEFENSIVE",
    "SQLITE_DBCONFIG_DQS_DDL",
    "SQLITE_DBCONFIG_DQS_DML",
    "SQLITE_LIMIT_ATTACHED",
    "quick_check(1)",
    "pragma_foreign_key_check",
    "application_id",
    "user_version",
    "STRICT",
    "WITHOUT ROWID",
    "principal_key",
    "ON CONFLICT (principal_key, address) DO NOTHING",
    "ON CONFLICT (principal_key, storage_kind, object_address, content_sha256, media_type, size_bytes) DO NOTHING",
    "length(bytes)",
    "reject_wal_sidecars",
    "validate_hot_journal",
    "ObjectState::Active",
    "storage_generation: 0",
  ];
  for (const evidence of requiredEvidence) {
    if (!productionSource.includes(evidence)) {
      throw new Error(`local SQLite store is missing required evidence: ${evidence}`);
    }
  }

  const forbiddenPatterns = [
    [/\bextern\s+"C"/, "C ABI export"],
    [/\b(?:no_mangle|export_name)\b/, "native symbol attribute"],
    [/\bstd::(?:net|process)\b|\bCommand::new\b/, "network/subprocess adapter"],
    [/\b(?:libloading|dlopen|LoadLibrary|load_extension)\b/i, "dynamic loading"],
    [/\bwasm_bindgen\b|\bnapi\b|\bneon\b/, "language bridge"],
    [/vivi\.cap\.referencedAssets/, "capability advertisement"],
    [/journal_mode\s*=\s*WAL/i, "WAL mode"],
    [/SQLITE_OPEN_CREATE/, "SQLite implicit file creation"],
    [/SQLITE_OPEN_(?:URI|SHARED_CACHE)/, "URI/shared-cache open mode"],
    [/\b(?:ATTACH|DETACH)\b/i, "cross-database SQL"],
  ];
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(productionSource)) {
      throw new Error(`local SQLite store contains forbidden ${label}`);
    }
  }

  const filesystemSource = readText(`${storeRoot}/src/filesystem.rs`);
  const nonFilesystemSource = productionFiles
    .filter((relativePath) => relativePath !== "src/filesystem.rs")
    .map((relativePath) => readText(`${storeRoot}/${relativePath}`))
    .join("\n");
  if (/\bunsafe\s*(?:\{|fn|impl|trait)\b/.test(nonFilesystemSource)) {
    throw new Error("unsafe Rust must remain confined to filesystem.rs");
  }
  const unsafeBlocks = [...filesystemSource.matchAll(/\bunsafe\s*\{/g)].length;
  if (unsafeBlocks !== 1 || /\bunsafe\s+(?:fn|impl|trait)\b/.test(filesystemSource)) {
    throw new Error("filesystem.rs must contain exactly one audited unsafe block");
  }
  for (const evidence of [
    "#[cfg(windows)]",
    "GetFileInformationByHandle",
    "FILE_FLAG_OPEN_REPARSE_POINT",
    "nNumberOfLinks != 1",
    "dwVolumeSerialNumber",
    "nFileIndexHigh",
    "SHARING_RETRY_COUNT: usize = 1_000",
    "SHARING_RETRY_DELAY: Duration = Duration::from_millis(5)",
    "metadata_or_missing(&journal, true)",
    "delete_pending_is_transient && is_access_denied(&error)",
    "error.raw_os_error() == Some(5)",
    "disappearing_is_missing && information.nNumberOfLinks == 0",
    "// SAFETY:",
  ]) {
    if (!filesystemSource.includes(evidence)) {
      throw new Error(`audited Windows filesystem wrapper drifted: ${evidence}`);
    }
  }
}

function assertNativeOnlyIsolation(metadata) {
  const resolverConsumers = consumersOf(metadata, "vivi-asset-resolver");
  if (
    JSON.stringify(resolverConsumers) !==
    JSON.stringify(["vivi-asset-host-local", "vivi-asset-store-local"])
  ) {
    throw new Error(
      `resolver production consumer isolation drifted: ${resolverConsumers.join(", ")}`,
    );
  }
  const storeConsumers = consumersOf(metadata, "vivi-asset-store-local");
  if (JSON.stringify(storeConsumers) !== JSON.stringify(["vivi-asset-host-local"])) {
    throw new Error(
      `local Asset store gained a production consumer: ${storeConsumers.join(", ")}`,
    );
  }
  const pngConsumers = consumersOf(metadata, "vivi-png-ref");
  if (
    JSON.stringify(pngConsumers) !==
    JSON.stringify(["vivi-asset-resolver", "vivi-runtime-native-c-abi"])
  ) {
    throw new Error(
      `vivi-png-ref direct consumer isolation drifted: ${pngConsumers.join(", ")}`,
    );
  }

  for (const packageName of [
    "vivi-runtime-native-c-abi",
    "vivi-runtime-native-core",
    "vivi-runtime-native-wasm",
  ]) {
    const pkg = requirePackage(metadata, packageName);
    if (
      pkg.dependencies.some((dependency) => dependency.name === "vivi-asset-store-local")
    ) {
      throw new Error(`${packageName} must not depend on the local Asset store`);
    }
  }

  for (const boundaryRoot of ["packages/editor-host", "electron", "src"]) {
    for (const filePath of walkFiles(resolve(boundaryRoot))) {
      if (!/\.(?:[cm]?[jt]sx?|json)$/i.test(filePath)) continue;
      if (/vivi[-_]asset[-_]store[-_]local/i.test(readFileSync(filePath, "utf8"))) {
        throw new Error(
          `${toRelative(filePath)} wires the store before its bridge slice`,
        );
      }
    }
  }

  const cAbiFiles = walkFiles(resolve(cAbiRoot));
  if (
    cAbiFiles.some((filePath) =>
      /vivi[-_]asset[-_]store[-_]local/i.test(readFileSync(filePath, "utf8")),
    )
  ) {
    throw new Error("C ABI source must remain disconnected from the local Asset store");
  }
  const resolverFiles = walkFiles(resolve(resolverRoot));
  if (
    resolverFiles.some((filePath) =>
      /vivi[-_]asset[-_]store[-_]local/i.test(readFileSync(filePath, "utf8")),
    )
  ) {
    throw new Error(
      "resolver foundation must not depend back on its local store adapter",
    );
  }
}

function assertToolchainAndGateWiring() {
  const runtimePackage = readJson("packages/runtime-native/package.json");
  const storeScript = runtimePackage.scripts?.["check:asset-store-local"] ?? "";
  for (const evidence of ["cargo test", "--locked", "cargo clippy", "-D warnings"]) {
    if (!storeScript.includes(evidence)) {
      throw new Error(`local Asset store test/Clippy script is missing ${evidence}`);
    }
  }
  if (/wasm32/.test(storeScript)) {
    throw new Error("local SQLite store script must remain native-only");
  }

  const rootPackage = readJson("package.json");
  const rootScript = rootPackage.scripts?.["check:runtime-asset-store-local"] ?? "";
  for (const evidence of [
    "node scripts/check-runtime-asset-store-local.mjs",
    "npm run check:asset-store-local --workspace @vivi2d/runtime-native",
  ]) {
    if (!rootScript.includes(evidence)) {
      throw new Error(`root local Asset store gate is missing ${evidence}`);
    }
  }

  const workflow = readText(".github/workflows/runtime-native.yml");
  for (const evidence of [
    "RUSTUP_TOOLCHAIN: 1.89.0",
    "matrix:\n        os: [ubuntu-latest, windows-latest, macos-latest]",
    "npm run check:runtime-asset-store-local",
    "$" + "{{ runner.temp }}/vivi-asset-store-local-native",
  ]) {
    if (!workflow.includes(evidence)) {
      throw new Error(
        `runtime-native workflow is missing local-store evidence: ${evidence}`,
      );
    }
  }
  if (
    /vivi-asset-store-local[^\n]*wasm32|wasm32[^\n]*vivi-asset-store-local/.test(workflow)
  ) {
    throw new Error("local SQLite store must not be compiled for wasm32");
  }
}

function consumersOf(metadata, dependencyName) {
  return metadata.packages
    .filter((pkg) =>
      pkg.dependencies.some((dependency) => dependency.name === dependencyName),
    )
    .map((pkg) => pkg.name)
    .sort();
}

function requirePackage(metadata, packageName) {
  const pkg = metadata.packages.find((candidate) => candidate.name === packageName);
  if (!pkg) throw new Error(`cargo metadata omitted ${packageName}`);
  return pkg;
}

function registryDependency(name, version, license, checksum) {
  return {
    name,
    version,
    license,
    source: "registry+https://github.com/rust-lang/crates.io-index",
    checksum,
  };
}

function workspaceDependency(name) {
  return {
    name,
    version: "0.1.0",
    license: "Apache-2.0",
    source: null,
    checksum: null,
  };
}

function directDependency(
  name,
  req,
  kind,
  usesDefaultFeatures,
  features,
  sourceKind = "registry",
  target = null,
) {
  return {
    name,
    req,
    kind,
    usesDefaultFeatures,
    features,
    sourceKind,
    target,
    optional: false,
  };
}

function readCargoMetadata() {
  return JSON.parse(
    runCapture("cargo", [
      "+1.89.0",
      "metadata",
      "--locked",
      "--format-version=1",
      "--manifest-path",
      resolve(nativeManifestPath),
      "--no-default-features",
    ]),
  );
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
      return {
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        source: pkg.source,
        checksum: lockPackages.get(`${pkg.name}@${pkg.version}`)?.checksum ?? null,
      };
    })
    .sort(compareDependencies);
}

function assertDependencyInventory(actual, expectedInventory, label) {
  const expected = [...expectedInventory].sort(compareDependencies);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} dependency/license/checksum closure drifted\nexpected=${JSON.stringify(expected, null, 2)}\nactual=${JSON.stringify(actual, null, 2)}`,
    );
  }
}

function readCargoLockPackages() {
  const lock = readText("packages/runtime-native/Cargo.lock");
  const packages = new Map();
  for (const block of lock.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = /^name = "([^"]+)"$/m.exec(block)?.[1];
    const version = /^version = "([^"]+)"$/m.exec(block)?.[1];
    const checksum = /^checksum = "([^"]+)"$/m.exec(block)?.[1] ?? null;
    if (name && version) packages.set(`${name}@${version}`, { checksum });
  }
  return packages;
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(filePath));
    else if (entry.isFile() && statSync(filePath).size <= 8 * 1024 * 1024) {
      result.push(filePath);
    }
  }
  return result;
}

function walkInventoryFiles(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkInventoryFiles(filePath));
    else if (entry.isFile()) result.push(filePath);
  }
  return result;
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(resolve(relativePath), "utf8");
}

function resolve(relativePath) {
  return path.join(root, relativePath);
}

function toRelative(filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function compareDependencies(left, right) {
  return left.name.localeCompare(right.name) || left.version.localeCompare(right.version);
}

function compareDirectDependencies(left, right) {
  return left.name.localeCompare(right.name) || left.kind.localeCompare(right.kind);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status ?? "unknown"}: ${result.stderr ?? result.error?.message ?? ""}`,
    );
  }
  return result.stdout ?? "";
}
