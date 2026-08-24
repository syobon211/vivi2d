import { describe, expect, it, vi } from "vitest";
import { compilerKind, selectCCompiler } from "./runtime-c-abi-compiler.mjs";

function selector({ platform, available = [], requested, vcvars = null }) {
  const commands = new Set(available);
  const findVcvars64 = vi.fn(() => vcvars);
  return {
    findVcvars64,
    result: selectCCompiler({
      platform,
      requested,
      commandExists: (command) => commands.has(command),
      findVcvars64,
    }),
  };
}

describe("runtime C ABI compiler selection", () => {
  it("honors an explicit available CC override", () => {
    expect(
      selector({ platform: "win32", available: ["gcc"], requested: "gcc" }).result,
    ).toEqual({
      command: "gcc",
      kind: "unix",
    });
  });

  it("prefers MSVC-compatible compilers on Windows", () => {
    const { result, findVcvars64 } = selector({
      platform: "win32",
      available: ["cc", "gcc", "clang", "cl", "clang-cl"],
      vcvars: "C:/vcvars64.bat",
    });
    expect(result).toEqual({ command: "cl", kind: "msvc" });
    expect(findVcvars64).not.toHaveBeenCalled();
  });

  it("uses vcvars before considering incompatible Unix compilers on Windows", () => {
    const { result } = selector({
      platform: "win32",
      available: ["cc", "gcc"],
      vcvars: "C:/vcvars64.bat",
    });
    expect(result).toEqual({
      command: "cl",
      kind: "msvc",
      vcvars: "C:/vcvars64.bat",
    });
  });

  it("skips the optional C host when Windows has no MSVC-compatible compiler", () => {
    expect(selector({ platform: "win32", available: ["cc", "gcc"] }).result).toBeNull();
  });

  it("keeps the Unix compiler preference order", () => {
    const { result, findVcvars64 } = selector({
      platform: "linux",
      available: ["gcc", "clang"],
      vcvars: "unused",
    });
    expect(result).toEqual({ command: "gcc", kind: "unix" });
    expect(findVcvars64).not.toHaveBeenCalled();
  });

  it("recognizes MSVC-style executable paths", () => {
    expect(compilerKind("C:\\Build Tools\\cl.exe")).toBe("msvc");
    expect(compilerKind("C:\\LLVM\\clang-cl.exe")).toBe("msvc");
    expect(compilerKind("C:\\msys64\\usr\\bin\\gcc.exe")).toBe("unix");
  });
});
