import { describe, expect, it } from "vitest";
import { parseViviFile } from "../project-parser";

describe("semanticRoleSource roundtrip", () => {
  it("preserves semanticRoleSource through JSON file parse", () => {
    const fileData = {
      version: 7 as const,
      project: {
        name: "Test",
        width: 100,
        height: 100,
        layers: [
          {
            id: "mesh-1",
            name: "Mesh",
            visible: true,
            opacity: 1,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            blendMode: "normal" as const,
            expanded: true,
            kind: "viviMesh" as const,
            children: [],
            semanticRole: "eyeLeft" as const,
            semanticRoleSource: "assistant" as const,
            mesh: {
              vertices: [0, 0, 100, 0, 100, 100, 0, 100],
              uvs: [0, 0, 1, 0, 1, 1, 0, 1],
              indices: [0, 1, 2, 0, 2, 3],
              divisionsX: 1,
              divisionsY: 1,
            },
          },
        ],
        parameters: [],
        clips: [],
        scenes: [],
        physicsGroups: [],
        lipsyncConfig: {
          enabled: false,
          source: "microphone" as const,
          threshold: 0,
          smoothing: 0,
          gain: 1,
          targetParameterId: null,
        },
        skins: {},
        colliders: [],
        stateMachines: [],
      },
      atlases: [],
    };

    const parsed = parseViviFile(JSON.stringify(fileData));
    const layer = parsed.project.layers[0];

    expect(layer?.semanticRole).toBe("eyeLeft");
    expect(layer?.semanticRoleSource).toBe("assistant");
  });
});
