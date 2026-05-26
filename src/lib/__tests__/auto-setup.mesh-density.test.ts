import { describe, expect, it, vi } from "vitest";
import { generateAutoMeshes } from "@/lib/auto-setup";
import * as autoMeshClient from "@/lib/workers/auto-mesh-client";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";

describe("generateAutoMeshes mesh density overrides", () => {
  it("passes per-layer preset overrides while keeping the global preset as fallback", async () => {
    const imported = createViviMesh({
      id: "front",
      name: "Front",
      width: 64,
      height: 64,
    });
    const plain = createViviMesh({ id: "plain", name: "Plain", width: 64, height: 64 });
    const project = { ...createEmptyProject(), layers: [imported, plain] };

    const mockMesh = {
      vertices: [0, 0, 64, 0, 0, 64, 64, 64],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 3, 0, 3, 2],
      divisionsX: 0,
      divisionsY: 0,
    };
    const spy = vi
      .spyOn(autoMeshClient, "generateAutoMeshAsync")
      .mockResolvedValue(mockMesh);

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;

    await generateAutoMeshes(project, () => canvas, "standard", {
      presetOverrides: { front: "fine" },
    });

    expect(spy).toHaveBeenNthCalledWith(
      1,
      canvas,
      64,
      64,
      "standard",
      expect.objectContaining({ presetOverride: "fine" }),
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      canvas,
      64,
      64,
      "standard",
      expect.objectContaining({ presetOverride: undefined }),
    );

    spy.mockRestore();
  });

  it("keeps an explicit standard override even when the global preset is finer", async () => {
    const imported = createViviMesh({ id: "body", name: "Body", width: 64, height: 64 });
    const project = { ...createEmptyProject(), layers: [imported] };

    const mockMesh = {
      vertices: [0, 0, 64, 0, 0, 64, 64, 64],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 3, 0, 3, 2],
      divisionsX: 0,
      divisionsY: 0,
    };
    const spy = vi
      .spyOn(autoMeshClient, "generateAutoMeshAsync")
      .mockResolvedValue(mockMesh);

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;

    await generateAutoMeshes(project, () => canvas, "fine", {
      presetOverrides: { body: "standard" },
    });

    expect(spy).toHaveBeenCalledWith(
      canvas,
      64,
      64,
      "fine",
      expect.objectContaining({ presetOverride: "standard" }),
    );

    spy.mockRestore();
  });
});
