import type { LayerNode } from "@vivi2d/core/types";
import { mapSeeThroughLabelToRole } from "@vivi2d/editor-core/see-through-role-map";
import { describe, expect, it } from "vitest";
import { detectParts } from "@/lib/ai-part-detector";

function makeLayer(name: string, overrides: Partial<LayerNode> = {}): LayerNode {
  return {
    id: overrides.id ?? "layer-1",
    name,
    kind: "viviMesh",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    blendMode: "normal",
    expanded: false,
    children: [],
    mesh: { vertices: [], uvs: [], indices: [], vertexCount: 0, indexCount: 0 },
    ...overrides,
  } as unknown as LayerNode;
}

describe("semantic role aware part detection", () => {
  it("maps See-through manifest labels to persistent semantic roles", () => {
    expect(mapSeeThroughLabelToRole("hair_front")).toBe("hairFront");
    expect(mapSeeThroughLabelToRole("mouth")).toBe("mouth");
    expect(mapSeeThroughLabelToRole("headwear")).toBe("accessory");
    expect(mapSeeThroughLabelToRole("unsupported_label")).toBe("unknown");
  });

  it("prefers persisted semanticRole over fuzzy name detection", () => {
    const parts = detectParts([
      makeLayer("mystery", {
        semanticRole: "hairFront",
      }),
    ]);

    expect(parts[0]!.category).toBe("hairFront");
    expect(parts[0]!.confidence).toBe(1);
  });

  it("falls back to name heuristics when semanticRole is unknown", () => {
    const parts = detectParts([
      makeLayer("left eye", {
        semanticRole: "unknown",
      }),
    ]);

    expect(parts[0]!.category).toBe("eyeLeft");
  });

  it("re-reads edited semanticRole on the same layer object without recreating inputs", () => {
    const layer = makeLayer("left eye", {
      semanticRole: "unknown",
    });

    const first = detectParts([layer]);
    expect(first[0]!.category).toBe("eyeLeft");

    layer.semanticRole = "mouth";

    const second = detectParts([layer]);
    expect(second[0]!.category).toBe("mouth");
    expect(second[0]!.confidence).toBe(1);
  });
});
