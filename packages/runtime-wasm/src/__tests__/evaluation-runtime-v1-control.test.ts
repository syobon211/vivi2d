import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNativeEvaluationRuntime,
  type EvaluationResult,
} from "../internal/evaluation-runtime-v1";

const loading = vi.hoisted(() => ({ exports: {} as WebAssembly.Exports }));
vi.mock("../native-wasm-bootstrap", () => ({
  createEmbeddedWasmLoader: () => async () => ({ exports: loading.exports }),
}));
const P = "vivi_wasm_evaluation_";
function fake() {
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 8 });
  let pointer = 64;
  const calls: string[] = [];
  const exports: Record<string, unknown> = { memory };
  const view = (p: number) => new DataView(memory.buffer, p);
  const fn = (name: string, body: (...args: number[]) => number | undefined) => {
    const call = vi.fn((...args: number[]) => {
      calls.push(name);
      return body(...args);
    });
    exports[name] = call;
    return call;
  };
  fn("vivi_wasm_alloc", (size) => {
    const p = pointer;
    pointer += Math.ceil(size! / 8) * 8;
    return p;
  });
  const free = fn("vivi_wasm_free", () => undefined);
  fn(`${P}abi_version`, () => 2);
  fn(`${P}create`, (p) => {
    view(p!).setUint32(0, 7, true);
    return 0;
  });
  fn(`${P}destroy`, () => undefined);
  const observe = fn(`${P}observe_request_state`, () => 0);
  fn(`${P}prepare`, (_h, _load, child, info) => {
    view(child!).setUint32(0, 11, true);
    view(info!).setUint32(4, 1, true);
    return 0;
  });
  fn(`${P}retry_missing`, () => 1);
  fn(`${P}prepared_destroy`, () => undefined);
  const commit = fn(`${P}commit`, (_h, child, activated) => {
    view(child!).setUint32(0, 0, true);
    view(activated!).setUint32(0, 1, true);
    return 0;
  });
  fn(`${P}set_input`, () => 0);
  fn(`${P}apply_expression_preset`, () => 0);
  fn(`${P}update`, () => 0);
  fn(`${P}get_generations`, (_h, p) => {
    view(p!).setBigUint64(0, 0xffff_ffff_ffff_ffffn, true);
    view(p!).setBigUint64(8, 0x8000_0000_0000_0001n, true);
    view(p!).setBigUint64(16, 3n, true);
    return 0;
  });
  for (const role of ["", "prepared_"]) {
    for (const kind of [
      "render_mesh",
      "texture",
      "draw_command",
      "parameter",
      "expression_preset",
    ]) {
      fn(`${P}${role}get_${kind}_count`, (_h, p) => {
        view(p!).setBigUint64(0, 0n, true);
        return 0;
      });
      fn(
        `${P}${role}get_${kind}${kind === "expression_preset" ? "" : "_snapshot"}`,
        () => 1,
      );
    }
    fn(`${P}${role}get_required_render_features`, (_h, p) => {
      view(p!).setUint32(0, 0, true);
      return 0;
    });
  }
  loading.exports = exports as WebAssembly.Exports;
  return { memory, calls, observe, commit, free, exports };
}
function value<T>(result: EvaluationResult<T>): T {
  if (!result.ok) throw new Error("fixture failure");
  return result.value;
}
const input = () => ({
  requestGeneration: 1,
  payloadUtf8: new TextEncoder().encode("{}"),
  textures: [],
  objects: [],
});
afterEach(() => vi.restoreAllMocks());

describe("Evaluation transport control only (fake exports, not native evaluation evidence)", () => {
  it("retires after an export throw without cleanup/query/destroy exports", async () => {
    const f = fake(),
      runtime = value(await createNativeEvaluationRuntime());
    f.calls.length = 0;
    f.observe.mockImplementation(() => {
      f.calls.push("trap");
      throw new Error("private native detail");
    });
    expect(
      runtime.observeRequestState({ latestIssuedGeneration: 1, exhausted: false }),
    ).toEqual({ ok: false, kind: "bridge", code: "internal" });
    const stopped = [...f.calls];
    expect(stopped).toEqual(["vivi_wasm_alloc", "trap"]);
    expect(runtime.isRetired()).toBe(true);
    runtime.getSnapshot();
    runtime.prepare(input());
    runtime.dispose();
    expect(f.calls).toEqual(stopped);
  });

  it("keeps returned resource errors recoverable and captures full-u64 generations", async () => {
    const f = fake(),
      runtime = value(await createNativeEvaluationRuntime());
    for (const status of [6, 14]) {
      f.observe.mockReturnValueOnce(status);
      expect(
        runtime.observeRequestState({ latestIssuedGeneration: 1, exhausted: false }),
      ).toEqual({ ok: false, kind: "native", status });
    }
    expect(runtime.isRetired()).toBe(false);
    expect(
      runtime.observeRequestState({ latestIssuedGeneration: 2, exhausted: false }).ok,
    ).toBe(true);
    expect(value(runtime.getSnapshot()).generations).toEqual({
      model: 0xffff_ffff_ffff_ffffn,
      topology: 0x8000_0000_0000_0001n,
      dynamic: 3n,
    });
    runtime.dispose();
  });

  it("preallocates commit and does not free/query between consume and reference publication", async () => {
    const f = fake(),
      runtime = value(await createNativeEvaluationRuntime());
    const child = value(runtime.prepare(input()));
    const permit = value(runtime.prepareCommit(child));
    f.calls.length = 0;
    expect(runtime.getSnapshot()).toEqual({ ok: false, kind: "bridge", code: "busy" });
    expect(runtime.commitPrepared(permit)).toBe(0);
    expect(f.calls).toEqual([`${P}commit`]);
    // This assignment represents the trusted caller's ordinary reference selection.
    let active: unknown = null;
    active = child;
    expect(active).toBe(child);
    f.free.mockImplementation(() => {
      f.calls.push("cleanup-trap");
      throw new Error("cleanup detail");
    });
    expect(() => runtime.finishCommit(permit)).not.toThrow();
    expect(runtime.isRetired()).toBe(true);
    const stopped = [...f.calls];
    child.dispose();
    runtime.dispose();
    expect(f.calls).toEqual(stopped);
  });

  it("rejects another instance's prepared token before any native export", async () => {
    fake();
    const first = value(await createNativeEvaluationRuntime());
    const child = value(first.prepare(input()));
    const f = fake(),
      second = value(await createNativeEvaluationRuntime());
    f.calls.length = 0;
    expect(second.prepareCommit(child)).toEqual({ ok: false, kind: "native", status: 1 });
    expect(f.calls).toEqual([]);
    child.dispose();
    first.dispose();
    second.dispose();
  });
});
