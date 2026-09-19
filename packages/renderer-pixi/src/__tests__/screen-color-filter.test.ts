import { describe, expect, it, vi } from "vitest";
import { createScreenColorFilter, updateScreenColorFilter } from "../screen-color-filter";

vi.mock("pixi.js", () => ({
  Filter: vi.fn().mockImplementation(function (opts: any) {
    const filter: any = { destroy: vi.fn() };
    if (opts?.resources) {
      filter.resources = {};
      for (const [groupName, groupDef] of Object.entries<any>(opts.resources)) {
        const uniforms: Record<string, any> = {};
        for (const [name, def] of Object.entries<any>(groupDef)) {
          uniforms[name] = def.value;
        }
        filter.resources[groupName] = { ...groupDef, uniforms };
      }
    }
    return filter;
  }),
  GlProgram: {
    from: vi.fn().mockReturnValue({}),
  },
}));

describe("createScreenColorFilter", () => {
  it.each([
    [0.5, 0.3, 0.1],
    [0, 0, 0],
    [1, 1, 1],
  ])("stores RGB (%s, %s, %s) in the shader uniform", (r, g, b) => {
    const filter = createScreenColorFilter({ r, g, b });

    const uniform = filter.resources.screenColorUniforms?.uniforms?.uScreenColor as
      | Float32Array
      | undefined;

    expect(uniform).toBeInstanceOf(Float32Array);
    expect(uniform).toHaveLength(3);
    expect(uniform?.[0]).toBeCloseTo(r, 5);
    expect(uniform?.[1]).toBeCloseTo(g, 5);
    expect(uniform?.[2]).toBeCloseTo(b, 5);
  });

  it("uses GlProgram.from with named shader sources", async () => {
    const { GlProgram } = await import("pixi.js");

    createScreenColorFilter({ r: 0, g: 0, b: 0 });

    expect(GlProgram.from).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "screen-color-filter",
        vertex: expect.any(String),
        fragment: expect.any(String),
      }),
    );
  });
});

describe("updateScreenColorFilter", () => {
  it("updates the existing uniform values", () => {
    const filter = createScreenColorFilter({ r: 0.1, g: 0.2, b: 0.3 });

    for (const [r, g, b] of [
      [1, 1, 1],
      [0.9, 0.8, 0.7],
      [0, 0, 0],
    ]) {
      updateScreenColorFilter(filter, { r, g, b });
      const uniform = filter.resources.screenColorUniforms?.uniforms?.uScreenColor;
      expect(uniform).toHaveLength(3);
      expect(uniform?.[0]).toBeCloseTo(r!, 5);
      expect(uniform?.[1]).toBeCloseTo(g!, 5);
      expect(uniform?.[2]).toBeCloseTo(b!, 5);
    }
  });

  it("does not throw when the uniform group is missing", () => {
    const fakeFilter = { resources: {} } as any;

    expect(() =>
      updateScreenColorFilter(fakeFilter, { r: 0.1, g: 0.2, b: 0.3 }),
    ).not.toThrow();
  });
});
