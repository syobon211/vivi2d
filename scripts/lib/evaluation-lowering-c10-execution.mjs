// Bounded fixed-family execution used only by the existing lowering gate.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { generateC10Literals } from "../../packages/runtime-native/crates/vivi-runtime-native-evaluation-lowering/tests/c10/generate.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const lowering = "packages/runtime-native/crates/vivi-runtime-native-evaluation-lowering";
const math = "packages/runtime-native/crates/vivi-runtime-native-evaluation-math";
const nativeManifest = "packages/runtime-native/Cargo.toml";
const wasmTarget = "wasm32-unknown-unknown";
const support = `${lowering}/tests/c10/support`;

function owned(filename, boundary, directory = false) {
  const absolute = path.resolve(filename),
    owner = path.resolve(boundary);
  const relative = path.relative(owner, absolute);
  assert(
    relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative),
  );
  let cursor = absolute;
  for (;;) {
    const stat = fs.lstatSync(cursor);
    assert(!stat.isSymbolicLink());
    assert(
      cursor === absolute
        ? directory
          ? stat.isDirectory()
          : stat.isFile()
        : stat.isDirectory(),
    );
    if (cursor === owner) break;
    const parent = path.dirname(cursor);
    assert.notEqual(parent, cursor);
    cursor = parent;
  }
  const canonical = fs.realpathSync(absolute);
  assert.equal(
    process.platform === "win32" ? canonical.toLowerCase() : canonical,
    process.platform === "win32" ? absolute.toLowerCase() : absolute,
  );
  return absolute;
}

export async function executeC10(root) {
  root = owned(path.resolve(root), path.parse(path.resolve(root)).root, true);
  assert(
    !process.env.NODE_OPTIONS && !process.env.NODE_PATH,
    "Node preload/path override unsupported",
  );
  const cargoHome = path.resolve(
    process.env.CARGO_HOME || path.join(homedir(), ".cargo"),
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(?:CARGO_|RUST|NODE_OPTIONS$|NODE_PATH$|CC(?:_|$)|CXX(?:_|$)|AR(?:_|$)|CFLAGS$|CXXFLAGS$|CPPFLAGS$|LDFLAGS$|LD_PRELOAD$|DYLD_)/i.test(
          key,
        ),
    ),
  );
  env.CARGO_HOME = cargoHome;
  if (process.env.RUSTUP_HOME) env.RUSTUP_HOME = process.env.RUSTUP_HOME;
  env.RUSTUP_AUTO_INSTALL = "0";
  env.CARGO_NET_OFFLINE = "true";
  function configuration() {
    const config = fs.readFileSync(owned(path.join(root, ".cargo/config.toml"), root));
    assert.equal(
      sha(config),
      "079f8a8032322e1fe2b7d2102bf5db329a0026c37d6e1866fdc776b9b058608b",
    );
    assert(!fs.existsSync(path.join(root, ".cargo/config")));
    const outside = new Set([cargoHome]);
    for (let cursor = path.dirname(root); ; cursor = path.dirname(cursor)) {
      outside.add(path.join(cursor, ".cargo"));
      if (cursor === path.dirname(cursor)) break;
    }
    for (const folder of outside)
      for (const name of ["config", "config.toml"])
        assert(
          !fs.existsSync(path.join(folder, name)),
          "Ambient Cargo configuration unsupported",
        );
  }
  configuration();
  const tmp = path.join(root, "tmp");
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp);
  owned(tmp, root, true);
  const run = fs.mkdtempSync(path.join(tmp, "evaluation-lowering-c10-"));
  owned(run, root, true);
  // Ignore must be established before any retained compiler/diagnostic output.
  const ignored = spawnSync(
    "git",
    ["check-ignore", "-q", "--", path.relative(root, run)],
    { cwd: root, windowsHide: true, timeout: 30000 },
  );
  assert.equal(ignored.status, 0);
  assert(!ignored.error && !ignored.signal);
  const inputs = new Map(),
    commands = [];
  function read(relative) {
    const file = owned(path.join(root, relative), root),
      bytes = fs.readFileSync(file);
    const hash = sha(bytes);
    if (inputs.has(file)) assert.equal(inputs.get(file), hash);
    inputs.set(file, hash);
    return bytes;
  }
  function collect(relative) {
    const full = owned(path.join(root, relative), root, true);
    for (const name of fs.readdirSync(full).sort()) {
      const entry = path.join(full, name),
        info = fs.lstatSync(entry);
      assert(!info.isSymbolicLink());
      if (info.isDirectory()) collect(`${relative}/${name}`);
      else read(`${relative}/${name}`);
    }
  }
  for (const folder of [
    `${lowering}/src`,
    `${lowering}/tests/c10`,
    `${lowering}/fixtures/c10`,
    `${math}/src`,
  ])
    collect(folder);
  // Exact local prerequisite closure, not an enumeration of the Cargo cache.
  for (const name of [
    "vivi-runtime-native-evaluation",
    "vivi-runtime-native-preactivation",
    "vivi-asset-host-local",
    "vivi-asset-store-local",
    "vivi-asset-resolver",
    "vivi-png-ref",
  ]) {
    const crate = `packages/runtime-native/crates/${name}`;
    read(`${crate}/Cargo.toml`);
    collect(`${crate}/src`);
  }
  read(
    "packages/runtime-native/crates/vivi-runtime-native-evaluation/schema/evaluation-payload-v1.schema.json",
  );
  read(
    "packages/runtime-native/crates/vivi-asset-resolver/schema/asset-model-v1.schema.json",
  );
  for (const file of [
    nativeManifest,
    "packages/runtime-native/Cargo.lock",
    `${lowering}/Cargo.toml`,
    `${math}/Cargo.toml`,
    ".cargo/config.toml",
    ".gitignore",
    "scripts/lib/evaluation-lowering-c10-corpus.mjs",
    "scripts/lib/evaluation-lowering-c10-corpus.node-test.mjs",
    "scripts/lib/evaluation-lowering-c10-execution.mjs",
    "scripts/lib/evaluation-lowering-c10-wasm-worker.mjs",
    "scripts/check-runtime-native-evaluation-math.mjs",
    "scripts/check-runtime-native-evaluation-lowering.mjs",
  ])
    read(file);
  function child(exe, args, extra = {}, limit = 60000, allowFailure = false) {
    const started = performance.now();
    const result = spawnSync(exe, args, {
      cwd: root,
      env: { ...env, ...extra },
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      timeout: limit,
      maxBuffer: 32 * 1024 * 1024,
    });
    const index = String(commands.length + 1).padStart(2, "0");
    fs.writeFileSync(path.join(run, `${index}.stdout.log`), result.stdout ?? "", {
      flag: "wx",
    });
    fs.writeFileSync(path.join(run, `${index}.stderr.log`), result.stderr ?? "", {
      flag: "wx",
    });
    commands.push({
      status: result.status,
      signal: result.signal,
      milliseconds: performance.now() - started,
    });
    assert(!result.error && !result.signal, `C10 child ${index} timed out or failed`);
    if (!allowFailure)
      assert.equal(
        result.status,
        0,
        `C10 child ${index} failed; local evidence retained`,
      );
    return result;
  }
  const rustc = child("rustup", [
    "which",
    "--toolchain",
    "1.89.0",
    "rustc",
  ]).stdout.trim();
  const cargo = child("rustup", [
    "which",
    "--toolchain",
    "1.89.0",
    "cargo",
  ]).stdout.trim();
  for (const exe of [rustc, cargo])
    assert(
      path.isAbsolute(exe) &&
        fs.lstatSync(exe).isFile() &&
        !fs.lstatSync(exe).isSymbolicLink(),
    );
  env.RUSTC = rustc;
  const version = child(rustc, ["-Vv"]).stdout;
  assert.match(version, /^release: 1\.89\.0\r?$/m);
  const host = version.match(/^host: ([a-z0-9_-]+)\r?$/m)?.[1];
  assert(host);
  assert.match(child(cargo, ["--version"]).stdout, /^cargo 1\.89\.0 /);
  // Reuse the existing exact registry/archive/member/feature gate. It admits
  // only the selected primitive closure, not dependency-wide allocation claims.
  child(
    process.execPath,
    ["scripts/check-runtime-native-evaluation-math.mjs"],
    { CARGO_TARGET_DIR: path.join(run, "kernel-check") },
    180000,
  );
  child(process.execPath, [
    "--test",
    "scripts/lib/evaluation-lowering-c10-corpus.node-test.mjs",
  ]);
  const generated = path.join(run, "generated");
  fs.mkdirSync(generated);
  const generation = generateC10Literals((name, text) => {
    assert.equal(name, path.basename(name));
    fs.writeFileSync(path.join(generated, name), text, { flag: "wx" });
  });
  const generatedPins = new Map(
    fs
      .readdirSync(generated)
      .map((name) => [name, sha(fs.readFileSync(path.join(generated, name)))]),
  );
  const metadata = JSON.parse(
    child(cargo, [
      "metadata",
      "--format-version=1",
      "--locked",
      "--offline",
      "--manifest-path",
      nativeManifest,
    ]).stdout,
  );
  const artifactEvidence = [];
  function build(target, packages, selected) {
    const targetDir = path.join(run, target === wasmTarget ? "wasm" : "native");
    const args = [
      "build",
      "--lib",
      "--locked",
      "--offline",
      "--manifest-path",
      nativeManifest,
      "--target",
      target,
      "--target-dir",
      targetDir,
      "--message-format=json",
      ...packages.flatMap((name) => ["-p", name]),
    ];
    const output = child(cargo, args, {}, 300000).stdout;
    const rows = output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const artifacts = new Map();
    for (const name of selected) {
      const matches = metadata.packages.filter((pkg) => pkg.name === name);
      assert.equal(matches.length, 1);
      const pkg = matches[0],
        targets = pkg.targets.filter(
          (t) => t.kind.includes("lib") || t.kind.includes("rlib"),
        );
      assert.equal(targets.length, 1);
      const declared = targets[0];
      const found = rows.filter(
        (row) =>
          row.reason === "compiler-artifact" &&
          row.package_id === pkg.id &&
          row.target?.name === declared.name &&
          path.resolve(row.target.src_path) === path.resolve(declared.src_path) &&
          JSON.stringify(row.target.kind) === JSON.stringify(declared.kind) &&
          JSON.stringify(row.target.crate_types) === JSON.stringify(declared.crate_types),
      );
      assert.equal(found.length, 1, `Ambiguous compiled ${name}`);
      const outputs = found[0].filenames.filter((file) => file.endsWith(".rlib"));
      assert.equal(outputs.length, 1);
      const file = owned(outputs[0], path.join(targetDir, target));
      artifacts.set(name, file);
      artifactEvidence.push({
        name,
        target,
        packageId: pkg.id,
        sha256: sha(fs.readFileSync(file)),
      });
    }
    return artifacts;
  }
  const native = build(
    host,
    ["vivi-runtime-native-evaluation-lowering", "vivi-runtime-native-evaluation-math"],
    [
      "serde_json",
      "vivi-runtime-native-preactivation",
      "vivi-runtime-native-evaluation-math",
      "vivi-runtime-native-evaluation-lowering",
    ],
  );
  const wasm = build(
    wasmTarget,
    ["vivi-runtime-native-evaluation-math", "vivi-runtime-native-evaluation"],
    ["serde_json", "vivi-runtime-native-evaluation-math"],
  );
  function entry(name) {
    let text = read(`${support}/${name}.rs.in`).toString();
    for (const [key, replacement] of [
      ["@REPO@", root],
      ["@SUPPORT@", path.join(root, support)],
      ["@FIXTURES@", path.join(root, lowering, "fixtures/c10")],
      ["@GENERATED@", generated],
    ]) {
      text = text.replaceAll(key, replacement.replaceAll("\\", "/"));
    }
    assert(!/@[A-Z_]+@/.test(text));
    const file = path.join(run, `${name}.rs`);
    fs.writeFileSync(file, text, { flag: "wx" });
    return file;
  }
  const compileEnv = { C10_GENERATED_DIR: generated };
  function externs(artifacts, names) {
    const directories = new Set(
      names.map((name) => {
        const output = path.dirname(artifacts.get(name));
        return owned(
          path.basename(output) === "deps" ? output : path.join(output, "deps"),
          run,
          true,
        );
      }),
    );
    assert.equal(directories.size, 1);
    return [
      "-L",
      `dependency=${[...directories][0]}`,
      ...names.flatMap((name) => [
        "--extern",
        `${name.replaceAll("-", "_")}=${artifacts.get(name)}`,
      ]),
    ];
  }
  const nativeEntry = entry("native"),
    wasmEntry = entry("wasm");
  const negativeOutput = path.join(run, "ordinary-must-not-compile.rmeta");
  const negative = child(
    rustc,
    [
      path.join(root, lowering, "tests/c10/production_boundary.rs"),
      "--edition=2024",
      "--crate-type=lib",
      "--emit=metadata",
      "--error-format=json",
      "--target",
      host,
      ...externs(native, ["vivi-runtime-native-evaluation-lowering"]),
      "-o",
      negativeOutput,
    ],
    {},
    60000,
    true,
  );
  assert.equal(negative.status, 1, "Production test seams unexpectedly compiled");
  assert(!fs.existsSync(negativeOutput));
  const errors = negative.stderr
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((row) => row.level === "error");
  const substantive = errors.filter((row) => row.code !== null);
  assert.deepEqual(substantive.map((row) => row.code.code).sort(), [
    "E0432",
    "E0599",
    "E0603",
  ]);
  for (const [code, name] of [
    ["E0432", "lower_derived_evaluation_observed"],
    ["E0599", "test_set_dynamic_generation"],
    ["E0603", "observation"],
  ])
    assert(substantive.find((row) => row.code.code === code).message.includes(name));
  assert.equal(errors.filter((row) => row.code === null).length, 1);
  for (const profile of ["debug", "release"]) {
    const executable = path.join(
      run,
      `c10-${profile}${process.platform === "win32" ? ".exe" : ""}`,
    );
    child(
      rustc,
      [
        nativeEntry,
        "--edition=2024",
        "--test",
        "--crate-name",
        "c10_fixed_native",
        "--target",
        host,
        ...externs(native, [
          "serde_json",
          "vivi-runtime-native-preactivation",
          "vivi-runtime-native-evaluation-math",
        ]),
        "-C",
        `opt-level=${profile === "release" ? 3 : 0}`,
        "-o",
        executable,
      ],
      compileEnv,
      180000,
    );
    owned(executable, run);
    const result = child(executable, ["--test-threads=1"], {}, 120000).stdout;
    assert.match(result, /test result: ok\. 8 passed; 0 failed; 0 ignored;/);
  }
  const wasmFile = path.join(run, "c10-test.wasm");
  child(
    rustc,
    [
      wasmEntry,
      "--edition=2024",
      "--crate-type=cdylib",
      "--crate-name",
      "c10_fixed_wasm",
      "--cfg",
      "test",
      "--target",
      wasmTarget,
      ...externs(wasm, ["serde_json", "vivi-runtime-native-evaluation-math"]),
      "-C",
      "opt-level=3",
      "-C",
      "link-arg=-zstack-size=4194304",
      "-C",
      "link-arg=--max-memory=67108864",
      "-o",
      wasmFile,
    ],
    compileEnv,
    180000,
  );
  const moduleBytes = fs.readFileSync(owned(wasmFile, run));
  const worker = new Worker(
    path.join(root, "scripts/lib/evaluation-lowering-c10-wasm-worker.mjs"),
    { workerData: { moduleBytes }, env, execArgv: [], stdout: true, stderr: true },
  );
  let timer;
  let wasmResult;
  try {
    wasmResult = await new Promise((resolve, reject) => {
      let finished = false;
      function finish(error, result) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) reject(new Error("C10 WASM worker failed"));
        else resolve(result);
      }
      timer = setTimeout(() => finish(true), 30000);
      worker.once("error", () => finish(true));
      worker.once("exit", () => finish(true));
      worker.stdout.on("data", () => finish(true));
      worker.stderr.on("data", () => finish(true));
      worker.once("message", (message) => {
        try {
          assert.deepEqual(message, {
            ok: true,
            compound: 137,
            helper: 1,
            rawRows: 574,
            reusedActualCases: 8,
            freshTraps: 10,
          });
          finish(false, message);
        } catch {
          finish(true);
        }
      });
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
  for (const [file, hash] of inputs)
    assert.equal(
      sha(fs.readFileSync(owned(file, root))),
      hash,
      "Selected source changed during execution",
    );
  for (const [name, hash] of generatedPins)
    assert.equal(sha(fs.readFileSync(owned(path.join(generated, name), run))), hash);
  configuration();
  const result = {
    kind: "c10-fixed-execution-v1",
    nativeProfiles: ["debug", "release"],
    productionBoundary: ["E0432", "E0599", "E0603"],
    generation,
    wasm: wasmResult,
    wasmSha256: sha(moduleBytes),
    artifacts: artifactEvidence,
    commands,
    sourcePins: [...inputs].map(([file, hash]) => ({
      path: path.relative(root, file).replaceAll("\\", "/"),
      sha256: hash,
    })),
  };
  fs.writeFileSync(
    path.join(run, "execution-evidence.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    { flag: "wx" },
  );
  return {
    report: path.relative(root, path.join(run, "execution-evidence.json")),
    result,
  };
}
