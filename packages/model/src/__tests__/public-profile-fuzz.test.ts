import { describe, expect, it } from "vitest";
import { parseViviFile } from "../project-parser";
import {
  PUBLIC_PROJECT_PROFILE,
  validatePublicRawViviFileProfile,
} from "../public-profile";
import { VIVI_RUNTIME_PROJECT_FILE_VERSION } from "../runtime-spec";

function basePublicFile(project: unknown = {}) {
  return {
    version: VIVI_RUNTIME_PROJECT_FILE_VERSION,
    profile: PUBLIC_PROJECT_PROFILE,
    project,
    atlases: [],
  };
}

function makePrng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

function makeFuzzProject(seed: number): Record<string, unknown> {
  const random = makePrng(seed);
  const root: Record<string, unknown> = {
    name: `fuzz-${seed}`,
    width: 64,
    height: 64,
    layers: [],
    parameters: [],
  };
  let cursor: Record<string, unknown> = root;
  const depth = 2 + Math.floor(random() * 5);
  for (let index = 0; index < depth; index += 1) {
    const container: Record<string, unknown> = {};
    const key = `unknown_${seed}_${index}`;
    cursor[key] = random() > 0.35 ? container : [container, { safe: true }];
    cursor = container;
  }
  cursor[pick(random, ["vertexDeltas", "deformer", "meshWarp", "solver"])] = pick(
    random,
    ["private", "preview", { value: true }, [0, 1, 2]],
  );
  return root;
}

describe("public profile deterministic fuzz fixtures", () => {
  it("rejects fuzzed private public-profile payloads without throwing raw errors", () => {
    for (let seed = 1; seed <= 32; seed += 1) {
      const issues = validatePublicRawViviFileProfile(
        basePublicFile(makeFuzzProject(seed)),
      );

      expect(issues.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(
        issues.some(
          (issue) =>
            issue.code === "forbiddenPublicFeature" ||
            issue.code === "unknownPublicField",
        ),
        `seed ${seed}`,
      ).toBe(true);
    }
  });

  it("handles symbol keys, cyclic arrays, and non-invoked accessors together", () => {
    const project = makeFuzzProject(99);
    const cycle: unknown[] = [];
    cycle.push(cycle);
    project.layers = [cycle];
    project.solver = "private-preview";
    Object.defineProperty(project, "authoringOnlyAccessor", {
      enumerable: true,
      get() {
        throw new Error("public-profile scanner must not invoke accessors");
      },
    });
    project[Symbol("privatePreview")] = true;

    const issues = validatePublicRawViviFileProfile(basePublicFile(project));

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknownPublicField" }),
        expect.objectContaining({ code: "forbiddenPublicFeature" }),
      ]),
    );
  });

  it("keeps parser failures bounded for fuzzed JSON object shapes", () => {
    const inputs = [
      basePublicFile(null),
      basePublicFile([]),
      basePublicFile({ layers: "not-array" }),
      basePublicFile({ ...makeFuzzProject(7), parameterBindings: [{ target: {} }] }),
      { ...basePublicFile(makeFuzzProject(8)), atlases: "not-array" },
    ];

    for (const input of inputs) {
      expect(() =>
        parseViviFile(JSON.stringify(input), { profile: PUBLIC_PROJECT_PROFILE }),
      ).toThrow(/(\.vivi file|public profile|project field|schema validation)/);
    }
  });
});
