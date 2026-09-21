import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it } from "vitest";

const loaderSource = fs.readFileSync(path.resolve("electron/native-local-asset.cjs"), "utf8");
const owned: string[] = [];
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const pin = (name: string, length = 1, digest = "0".repeat(64)) => ({ path: name, byteLength: length, sha256: digest });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-addon-loader-")); owned.push(root);
  const dir = path.join(root, "electron/generated/native-local-asset/win32-x64"); fs.mkdirSync(dir, { recursive: true });
  const addon = path.join(dir, "vivi_local_asset_v1.node"), manifestPath = path.join(dir, "manifest.json");
  const bytes = Buffer.from("loader-test-byte-identity-not-an-addon"); fs.writeFileSync(addon, bytes);
  const manifest = {
    format: 1, platform: "win32", arch: "x64", electronVersion: "42.9.3", napiVersion: 8, localAssetAbiVersion: 1,
    addon: { byteLength: bytes.length, sha256: sha(bytes) },
    inputs: {
      releaseArtifacts: [pin("SHASUMS256.txt",1097,"3dcbcfd37581310fc5ddfbcd0f2a20d6bc593f447c1b85b662eaf01ffd013e1e"),pin("node-v42.9.3-headers.tar.gz",344565,"899a19f5c6b69dc124a83ff473b18a39b6c8f8c703ca2810e3986adf9a69ec08"),pin("win-x64/node.lib",1507588,"790af72b16459418d562dc078ac71f657ac44a01ab81115d2cb9555e7c9703c9")],
      headers: [pin("node_api.h",10370,"2d4560831e525b47b060ec8a0864ab73993df9e20215ce9f0fe7b24cd31af32a"),pin("node_api_types.h",1930,"a25356630d3058f0a0c8937d9f297e9471e037fda58c2696d8a505c2bd99cb00"),pin("js_native_api.h",33180,"5895df50c378dde419fab4569805e6e273e47ff9f23b6885f74d86c9c22f3f83"),pin("js_native_api_types.h",7871,"4f19cb90d240765cc0961d92a1ee20f65fdc50db7de1ab0a5cb6bc227224e1a0")],
      sources: ["electron/native-local-asset/addon.c","electron/native-local-asset/delay-load.c","electron/native-local-asset/addon.def","scripts/build-local-asset-addon.mjs","packages/runtime-c-abi/include/vivi_local_asset.h","packages/runtime-c-abi/include/vivi_local_asset_preview.h","packages/runtime-native/crates/vivi-runtime-native-c-abi/Cargo.toml","packages/runtime-native/crates/vivi-runtime-native-c-abi/src/lib.rs","packages/runtime-native/crates/vivi-runtime-native-c-abi/src/local_asset.rs","packages/runtime-native/crates/vivi-runtime-native-c-abi/src/local_asset/preview.rs"].map(name => pin(name)),
      lock: pin("packages/runtime-native/Cargo.lock"),
    },
    build: { rustc: "rustc 1.94.1 (fixture)", cargo: "cargo 1.94.1 (fixture)", target: "x86_64-pc-windows-msvc", msvc: "14.44.35207", windowsSdk: "10.0.26100.0", compiler: pin("cl.exe"), linker: pin("link.exe"), compilerFlags: ["/DNAPI_VERSION=8"], linkerFlags: ["/DELAYLOAD:node.exe"], rustFlags: ["--remap-path-prefix=<workspace>=/workspace/vivi2d", "--remap-path-prefix=<cargo-home>=/cargo"], features: ["local-asset-host-v1"], defaultFeatures: false, nativeStaticLibraries: ["kernel32.lib"], staticlib: pin("vivi_runtime_native_c_abi.lib") },
    pe: { exports: ["napi_register_module_v1", "node_api_module_get_api_version_v1"], imports: [{ dll: "node.exe", delayed: true, symbols: ["napi_get_version"] }] },
  };
  const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest)); save();
  const native = Object.freeze(Object.defineProperties({}, { start: { value: () => {} }, cancel: { value: () => {} }, close: { value: () => Promise.resolve() }, abiVersion: { value: 1 } }));
  return { root, dir, addon, manifestPath, manifest, save, native };
}
function loadHarness(f: ReturnType<typeof fixture>, options: { platform?: string; arch?: string; electron?: string; napi?: string; native?: unknown; onRequire?: () => void; fs?: typeof fs } = {}) {
  let loads = 0;
  const module = { exports: {} as { loadNativeLocalAsset: () => unknown } };
  vm.runInNewContext(loaderSource, { module, process: { platform: options.platform ?? "win32", arch: options.arch ?? "x64", versions: { electron: options.electron ?? "42.9.3", napi: options.napi ?? "8" } }, require: (name: string) => {
    if (name === "node:fs") return options.fs ?? fs;
    if (name === "node:path") return path;
    if (name === "node:crypto") return { createHash };
    if (name === "electron") return { app: { getAppPath: () => f.root } };
    expect(name).toBe(f.addon); loads++; options.onRequire?.(); return options.native ?? f.native;
  } });
  return { load: module.exports.loadNativeLocalAsset, count: () => loads };
}
afterEach(() => { for (const dir of owned.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
describe("fixed local Asset addon loader", () => {
  it("hashes a real file and loads once at supported Node-API 8 or greater", () => {
    for (const napi of ["8", "10"]) { const f = fixture(), h = loadHarness(f, { napi }); expect(h.load()).toBe(f.native); expect(h.load()).toBe(f.native); expect(h.count()).toBe(1); }
  });
  it.each([{ platform: "linux" }, { arch: "arm64" }, { electron: "42.9.2" }, { napi: "7" }, { napi: "8oops" }])("rejects unavailable fixed runtime %j", runtime => {
    const h = loadHarness(fixture(), runtime); expect(h.load).toThrow("LOCAL_ASSET_UNAVAILABLE"); expect(h.count()).toBe(0);
  });
  it("rejects tampered bytes, remembers failure, and never falls back after repair", () => {
    const f = fixture(), h = loadHarness(f); fs.appendFileSync(f.addon, "x"); expect(h.load).toThrow("LOCAL_ASSET_UNAVAILABLE"); fs.writeFileSync(f.addon, Buffer.from("loader-test-byte-identity-not-an-addon")); expect(h.load).toThrow("LOCAL_ASSET_UNAVAILABLE"); expect(h.count()).toBe(0);
  });
  it("rejects missing files and unknown manifest fields before native loading", () => {
    const f = fixture(); Object.assign(f.manifest, { fallback: true }); f.save(); const h = loadHarness(f); expect(h.load).toThrow("LOCAL_ASSET_UNAVAILABLE"); expect(h.count()).toBe(0);
    const g = fixture(); fs.unlinkSync(g.addon); expect(loadHarness(g).load).toThrow("LOCAL_ASSET_UNAVAILABLE");
  });
  it("rejects pre-capture bridge manifests instead of loading the old binary", () => {
    const f = fixture();
    f.manifest.inputs.sources = f.manifest.inputs.sources.filter(item => !item.path.endsWith("vivi_local_asset_preview.h") && !item.path.endsWith("local_asset/preview.rs"));
    f.save(); const h = loadHarness(f); expect(h.load).toThrow("LOCAL_ASSET_UNAVAILABLE"); expect(h.count()).toBe(0);
  });
  it("rejects directory junction redirection", () => {
    const f = fixture(), original = path.join(path.dirname(f.dir), "original"); fs.renameSync(f.dir, original); fs.symlinkSync(original, f.dir, "junction"); const h = loadHarness(f); expect(h.load).toThrow("LOCAL_ASSET_UNAVAILABLE"); expect(h.count()).toBe(0);
  });
  it("rejects a changed manifest or addon during native load and never returns it", () => {
    for (const changed of ["addon", "manifestPath"] as const) {
      const f = fixture(), h = loadHarness(f, { onRequire: () => fs.appendFileSync(f[changed], " ") }); expect(h.load).toThrow("LOCAL_ASSET_UNAVAILABLE"); expect(h.load).toThrow("LOCAL_ASSET_UNAVAILABLE"); expect(h.count()).toBe(1);
    }
  });
  it("rejects wrong native descriptors, version, or extra exports", () => {
    for (const native of [Object.freeze({ start() {}, cancel() {}, close() {}, abiVersion: 1 }), Object.freeze({}), Object.freeze(Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(fixture().native), extra: { value: true } }))]) {
      const h = loadHarness(fixture(), { native }); expect(h.load).toThrow("LOCAL_ASSET_UNAVAILABLE");
    }
  });
});
