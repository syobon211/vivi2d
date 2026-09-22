import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNativePngDecoder } from "../internal/png-rgba8-v1";

const loading = vi.hoisted(() => ({ exports: {} as WebAssembly.Exports }));
vi.mock("../native-wasm-bootstrap", () => ({
  createEmbeddedWasmLoader: () => async () => ({ exports: loading.exports }),
}));

function fake() {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 8 });
  const calls: string[] = [];
  const output = new Uint8Array([12, 34, 56, 78]);
  const e = {
    memory,
    vivi_wasm_png_abi_version: () => 1,
    vivi_wasm_alloc: vi.fn((_size: number) => {
      calls.push("alloc");
      return 32;
    }),
    vivi_wasm_free: vi.fn((_pointer: number, _size: number) => {
      calls.push("free");
    }),
    vivi_wasm_png_decode_rgba8: vi.fn(
      (_p: number, _n: number, _d: number, _dn: number, _w: number, _h: number) => {
        calls.push("decode");
        new Uint8Array(memory.buffer, 1024, output.length).set(output);
        return 0;
      },
    ),
    vivi_wasm_output_len: vi.fn(() => {
      calls.push("len");
      return output.length;
    }),
    vivi_wasm_png_output_ptr: vi.fn(() => {
      calls.push("ptr");
      return 1024;
    }),
    vivi_wasm_png_release_output: vi.fn(() => {
      calls.push("release");
    }),
  };
  loading.exports = e as unknown as WebAssembly.Exports;
  return { memory, calls, e, output };
}
const input = () => ({
  bytes: new Uint8Array([1, 2, 3]),
  expectedSha256: new Uint8Array(32),
  width: 1,
  height: 1,
});
async function ready() {
  const result = await createNativePngDecoder();
  if (!result.ok) throw new Error("fixture initialization failed");
  return result.decoder;
}
beforeEach(() => {
  fake();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("PNG facade control flow (fake exports, not decoder evidence)", () => {
  it("owns logical Buffer/digest input before exports and output after growth/dispose", async () => {
    const f = fake();
    const decoder = await ready();
    const source = Buffer.from([99, 1, 2, 3, 99]).subarray(1, 4);
    const digest = Buffer.alloc(32, 7);
    f.e.vivi_wasm_alloc.mockImplementation((size) => {
      f.calls.push("alloc");
      source.fill(9);
      digest.fill(9);
      f.memory.grow(1);
      expect(size).toBe(35);
      return 32;
    });
    f.e.vivi_wasm_png_decode_rgba8.mockImplementation((p, n, d, dn, w, h) => {
      f.calls.push("decode");
      expect([p, n, d, dn, w, h]).toEqual([32, 3, 35, 32, 1, 1]);
      expect(Array.from(new Uint8Array(f.memory.buffer, p, n))).toEqual([1, 2, 3]);
      expect(new Uint8Array(f.memory.buffer, d, dn).every((v) => v === 7)).toBe(true);
      f.memory.grow(1);
      new Uint8Array(f.memory.buffer, 1024, 4).set(f.output);
      return 0;
    });
    const result = decoder.decode({
      bytes: source,
      expectedSha256: digest,
      width: 1,
      height: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.from(result.rgba)).toEqual(Array.from(f.output));
    expect(result.rgba.buffer).not.toBe(f.memory.buffer);
    expect(f.calls).toEqual(["alloc", "decode", "len", "ptr", "release", "free"]);
    expect(f.e.vivi_wasm_free).toHaveBeenCalledWith(32, 35);
    new Uint8Array(f.memory.buffer).fill(0);
    decoder.dispose();
    expect(Array.from(result.rgba)).toEqual(Array.from(f.output));
    expect(decoder.decode(input())).toEqual({
      ok: false,
      kind: "bridge",
      code: "disposed",
    });
  });

  it("rejects coercible scalars and textual digests before any export without poisoning", async () => {
    const f = fake();
    const decoder = await ready();
    for (const width of [-1, 0.5, 0x1_0000_0000, Number.NaN]) {
      expect(decoder.decode({ ...input(), width })).toEqual({
        ok: false,
        kind: "png",
        status: 1,
      });
    }
    expect(
      decoder.decode({
        ...input(),
        expectedSha256: new TextEncoder().encode("a".repeat(64)),
      }),
    ).toEqual({ ok: false, kind: "png", status: 1 });
    expect(f.calls).toEqual([]);
    expect(decoder.decode(input()).ok).toBe(true);
  });

  it("rejects getter reentry and observes disposal before allocating", async () => {
    const f = fake();
    const decoder = await ready();
    const value = input();
    Object.defineProperty(value, "width", {
      get() {
        expect(decoder.decode(input())).toEqual({
          ok: false,
          kind: "bridge",
          code: "internal",
        });
        decoder.dispose();
        return 1;
      },
    });
    expect(decoder.decode(value)).toEqual({
      ok: false,
      kind: "bridge",
      code: "internal",
    });
    expect(f.calls).toEqual([]);
  });

  it("keeps native PNG status separate, retires native limit, and never exposes failure pixels", async () => {
    for (const status of [1, 2, 3, 4, 5, 6]) {
      const f = fake();
      const decoder = await ready();
      f.e.vivi_wasm_png_decode_rgba8.mockImplementation(() => {
        f.calls.push("decode");
        return status;
      });
      expect(decoder.decode(input())).toEqual({ ok: false, kind: "png", status });
      expect(f.calls).toEqual(
        status === 4 ? ["alloc", "decode"] : ["alloc", "decode", "release", "free"],
      );
      if (status === 4) {
        expect(decoder.decode(input())).toEqual({
          ok: false,
          kind: "bridge",
          code: "internal",
        });
        expect(f.calls).toHaveLength(2);
      }
      decoder.dispose();
    }
  });

  it.each([
    ["vivi_wasm_alloc", "alloc"],
    ["vivi_wasm_png_decode_rgba8", "decode"],
    ["vivi_wasm_output_len", "len"],
    ["vivi_wasm_png_output_ptr", "ptr"],
    ["vivi_wasm_png_release_output", "release"],
    ["vivi_wasm_free", "free"],
  ] as const)("calls no later export after %s traps", async (name, step) => {
    const f = fake();
    const decoder = await ready();
    f.e[name].mockImplementation(() => {
      f.calls.push(step);
      throw new WebAssembly.RuntimeError("canary must not escape");
    });
    expect(decoder.decode(input())).toEqual({
      ok: false,
      kind: "bridge",
      code: "internal",
    });
    expect(f.calls.at(-1)).toBe(step);
    const completed = [...f.calls];
    expect(decoder.decode(input())).toEqual({
      ok: false,
      kind: "bridge",
      code: "internal",
    });
    decoder.dispose();
    expect(f.calls).toEqual(completed);
  });

  it("cleans both native allocations after a JS output-copy failure", async () => {
    const f = fake();
    const decoder = await ready();
    const original = Uint8Array.prototype.set;
    vi.spyOn(Uint8Array.prototype, "set").mockImplementation(function (
      this: Uint8Array,
      values,
      offset,
    ) {
      if (
        this.byteLength === 4 &&
        this.buffer !== f.memory.buffer &&
        values instanceof Uint8Array &&
        values.buffer === f.memory.buffer
      ) {
        throw new Error("copy canary must not escape");
      }
      return original.call(this, values, offset);
    });
    expect(decoder.decode(input())).toEqual({
      ok: false,
      kind: "bridge",
      code: "internal",
    });
    expect(f.calls.slice(-2)).toEqual(["release", "free"]);
    expect(decoder.decode(input())).toEqual({
      ok: false,
      kind: "bridge",
      code: "internal",
    });
  });

  it("fails closed on capability/range/status/output-shape defects", async () => {
    const f = fake();
    f.e.vivi_wasm_png_abi_version = () => 2;
    expect(await createNativePngDecoder()).toEqual({
      ok: false,
      kind: "bridge",
      code: "unavailable",
    });
    expect(f.calls).toEqual([]);
    for (const defect of ["range", "status", "length"] as const) {
      const next = fake();
      const decoder = await ready();
      if (defect === "range") next.e.vivi_wasm_alloc.mockReturnValue(0xffff_fff0);
      if (defect === "status") next.e.vivi_wasm_png_decode_rgba8.mockReturnValue(99);
      if (defect === "length") next.e.vivi_wasm_output_len.mockReturnValue(8);
      expect(decoder.decode(input())).toEqual({
        ok: false,
        kind: "bridge",
        code: "internal",
      });
      const completed = [...next.calls];
      expect(decoder.decode(input())).toEqual({
        ok: false,
        kind: "bridge",
        code: "internal",
      });
      expect(next.calls).toEqual(completed);
    }
  });
});
