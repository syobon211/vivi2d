import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import { clickFileMenuItem } from "../helpers/operations";

async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});

test("exposes the expected Art Path label and tessellation helpers", async ({
  window,
}) => {
  const result = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const label = (vivi.nodeKindLabel as any)("artPath");
    const tessellated = (vivi.tessellateArtPath as any)(
      [
        {
          x: 0,
          y: 0,
          handleInX: 0,
          handleInY: 0,
          handleOutX: 50,
          handleOutY: 0,
          width: 10,
          opacity: 1,
        },
        {
          x: 100,
          y: 0,
          handleInX: -50,
          handleInY: 0,
          handleOutX: 0,
          handleOutY: 0,
          width: 10,
          opacity: 1,
        },
      ],
      false,
      8,
    );
    const mesh = (vivi.buildStrokeMesh as any)(tessellated, {
      color: 0x000000,
      baseWidth: 10,
      lineCap: "round",
      lineJoin: "round",
    });
    return {
      label,
      tessellatedPoints: tessellated.length,
      hasVertices: mesh.vertices.length > 0,
      hasIndices: mesh.indices.length > 0,
    };
  });

  expect(result.label).toMatch(/Art Path|アートパス/);
  expect(result.tessellatedPoints).toBeGreaterThan(2);
  expect(result.hasVertices).toBe(true);
  expect(result.hasIndices).toBe(true);
});

test("creates IK controllers and clamps influence", async ({ window }) => {
  const result = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const editorStore = vivi.useEditorStore as any;
    const ikStore = vivi.useIKControllerStore as any;
    const id = ikStore.getState().addIKController("Feature IK", "twoBone", [
      { boneId: "bone-1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "bone-2", minAngle: -Math.PI / 2, maxAngle: Math.PI / 2 },
    ]);
    ikStore.getState().setInfluence(id, 2.5);
    const high = editorStore
      .getState()
      .project.ikControllers.find((entry: any) => entry.id === id)?.influence;
    ikStore.getState().setInfluence(id, -1);
    const low = editorStore
      .getState()
      .project.ikControllers.find((entry: any) => entry.id === id)?.influence;
    const [angle1, angle2] = (vivi.solveTwoBoneIK as any)(0, 0, 100, 100, 100, 0);
    return {
      high,
      low,
      isFinite1: Number.isFinite(angle1),
      isFinite2: Number.isFinite(angle2),
    };
  });

  expect(result.high).toBe(1);
  expect(result.low).toBe(0);
  expect(result.isFinite1).toBe(true);
  expect(result.isFinite2).toBe(true);
});

test("provides AI helper outputs for face and physics generation", async ({ window }) => {
  const result = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const generated = (vivi.generateFaceBones as any)(
      [
        {
          layerId: "1",
          layerName: "Left Eye",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 100, y: 100, width: 50, height: 30 },
        },
        {
          layerId: "2",
          layerName: "Mouth",
          category: "mouth",
          confidence: 0.8,
          bounds: { x: 150, y: 200, width: 40, height: 20 },
        },
      ],
      800,
      600,
    );
    const swaying = (vivi.detectSwayingParts as any)([
      {
        layerId: "1",
        layerName: "Front Hair",
        category: "hairFront",
        confidence: 0.8,
        bounds: { x: 0, y: 0, width: 100, height: 100 },
      },
      {
        layerId: "2",
        layerName: "Accessory",
        category: "accessory",
        confidence: 0.7,
        bounds: { x: 0, y: 0, width: 50, height: 80 },
      },
      {
        layerId: "3",
        layerName: "Body",
        category: "body",
        confidence: 0.9,
        bounds: { x: 0, y: 0, width: 200, height: 300 },
      },
    ]);
    const groups = (vivi.generatePhysicsGroups as any)([
      {
        layerId: "1",
        layerName: "Front Hair",
        category: "hairFront",
        confidence: 0.8,
        bounds: { x: 0, y: 0, width: 100, height: 100 },
      },
      {
        layerId: "2",
        layerName: "Accessory",
        category: "accessory",
        confidence: 0.7,
        bounds: { x: 0, y: 0, width: 50, height: 80 },
      },
      {
        layerId: "3",
        layerName: "Body",
        category: "body",
        confidence: 0.9,
        bounds: { x: 0, y: 0, width: 200, height: 300 },
      },
    ]);
    return {
      boneCount: generated.bones.length,
      parameterCount: generated.parameters.length,
      swayCount: swaying.length,
      groupCount: groups.length,
    };
  });

  expect(result.boneCount).toBeGreaterThan(0);
  expect(result.parameterCount).toBeGreaterThan(0);
  expect(result.swayCount).toBe(2);
  expect(result.groupCount).toBeGreaterThan(0);
});

test("creates offscreen targets and detects cyclic dependencies", async ({ window }) => {
  const result = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const editorStore = vivi.useEditorStore as any;
    const offscreenStore = vivi.useOffscreenStore as any;
    const targetId = offscreenStore.getState().addOffscreenTarget(256, 512);
    const created = editorStore
      .getState()
      .project.offscreenTargets.find((entry: any) => entry.id === targetId);
    const noCycle = (vivi.detectCyclicDependency as any)(
      [
        { id: "a", width: 256, height: 256, sourceLayerIds: ["layer-1"] },
        { id: "b", width: 256, height: 256, sourceLayerIds: ["layer-2"] },
      ],
      new Map(),
    );
    const hasCycle = (vivi.detectCyclicDependency as any)(
      [
        { id: "a", width: 256, height: 256, sourceLayerIds: ["layer-c"] },
        { id: "b", width: 256, height: 256, sourceLayerIds: ["layer-a"] },
      ],
      new Map([
        ["a", "layer-a"],
        ["b", "layer-c"],
      ]),
    );
    const sorted = (vivi.topologicalSortTargets as any)(
      [
        { id: "a", width: 256, height: 256, sourceLayerIds: [] },
        { id: "b", width: 256, height: 256, sourceLayerIds: [] },
      ],
      new Map(),
    );
    return {
      width: created?.width,
      height: created?.height,
      noCycle: noCycle === null,
      hasCycle: hasCycle !== null,
      sortedCount: sorted.length,
    };
  });

  expect(result.width).toBe(256);
  expect(result.height).toBe(512);
  expect(result.noCycle).toBe(true);
  expect(result.hasCycle).toBe(true);
  expect(result.sortedCount).toBe(2);
});

test("evaluates image sequence tracks by frame", async ({ window }) => {
  const result = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const track = {
      targetMeshId: "mesh-1",
      entries: [
        { startFrame: 0, imageId: "img-a" },
        { startFrame: 10, imageId: "img-b" },
        { startFrame: 20, imageId: "img-c" },
      ],
      loop: false,
    };
    return {
      frame0: (vivi.evaluateImageSequenceAtFrame as any)(track, 0),
      frame5: (vivi.evaluateImageSequenceAtFrame as any)(track, 5),
      frame10: (vivi.evaluateImageSequenceAtFrame as any)(track, 10),
      frame25: (vivi.evaluateImageSequenceAtFrame as any)(track, 25),
    };
  });

  expect(result.frame0).toBe("img-a");
  expect(result.frame5).toBe("img-a");
  expect(result.frame10).toBe("img-b");
  expect(result.frame25).toBe("img-c");
});

test("serializes OSC messages and resets VMC state", async ({ window }) => {
  const result = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const message = {
      address: "/VMC/Ext/Blend/Val",
      args: [
        { type: "s", value: "Blink_L" },
        { type: "f", value: 0.5 },
      ],
    };
    const serialized = (vivi.serializeOSCMessage as any)(message);
    const parsed = (vivi.parseOSCMessage as any)(serialized);

    const vmcStore = vivi.useVMCStore as any;
    const state = vmcStore.getState();
    state.reset();
    const initialConnected = vmcStore.getState().connected;
    state.setConnected(true);
    state.updateFaceChannelBuffer({ Blink_L: 0.5, Blink_R: 0.8 });
    const bufferKeys = Object.keys(vmcStore.getState().faceChannelBuffer);
    state.reset();

    return {
      address: parsed?.address,
      argCount: parsed?.args?.length,
      arg0: parsed?.args?.[0]?.value,
      initialConnected,
      bufferKeys,
      afterReset: vmcStore.getState().connected,
    };
  });

  expect(result.address).toBe("/VMC/Ext/Blend/Val");
  expect(result.argCount).toBe(2);
  expect(result.arg0).toBe("Blink_L");
  expect(result.initialConnected).toBe(false);
  expect(result.bufferKeys).toContain("Blink_L");
  expect(result.afterReset).toBe(false);
});

test("keeps Tier C APIs available on the window bridge", async ({ window }) => {
  const result = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return {
      hasSolveTwoBoneIK: typeof vivi.solveTwoBoneIK === "function",
      hasTessellateArtPath: typeof vivi.tessellateArtPath === "function",
      hasDetectCyclicDependency: typeof vivi.detectCyclicDependency === "function",
      hasParseOSCMessage: typeof vivi.parseOSCMessage === "function",
    };
  });

  expect(result.hasSolveTwoBoneIK).toBe(true);
  expect(result.hasTessellateArtPath).toBe(true);
  expect(result.hasDetectCyclicDependency).toBe(true);
  expect(result.hasParseOSCMessage).toBe(true);
});

test("round-trips Tier C project data through save and open", async ({ app, window }) => {
  await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const editorStore = vivi.useEditorStore as any;
    const ikStore = vivi.useIKControllerStore as any;
    const offscreenStore = vivi.useOffscreenStore as any;
    const project = editorStore.getState().project;
    if (!project) return;

    ikStore
      .getState()
      .addIKController("Roundtrip IK", "ccd", [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      ]);
    offscreenStore.getState().addOffscreenTarget(512, 512);
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-tier-c-"));
  const savePath = path.join(tmpDir, "tier-c-roundtrip.vivi");

  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "Save As");
  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });

  await clickFileMenuItem(window, "Close");
  await expect(async () => {
    const closed = await window.evaluate(() => {
      const vivi = window.__vivi2d;
      return !vivi || !(vivi.useEditorStore as any).getState().project;
    });
    expect(closed).toBe(true);
  }).toPass({ timeout: 5_000 });

  await mockOpenVivi(app, savePath);
  await clickFileMenuItem(window, "Open");

  await expect(async () => {
    const loaded = await window.evaluate(() => {
      const vivi = window.__vivi2d;
      return !!vivi && !!(vivi.useEditorStore as any).getState().project;
    });
    expect(loaded).toBe(true);
  }).toPass({ timeout: 10_000 });

  const restored = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const project = (vivi.useEditorStore as any).getState().project;
    return {
      ikCount: project.ikControllers?.length ?? 0,
      ikName: project.ikControllers?.[0]?.name,
      offscreenCount: project.offscreenTargets?.length ?? 0,
      offscreenWidth: project.offscreenTargets?.[0]?.width,
    };
  });

  expect(restored.ikCount).toBe(1);
  expect(restored.ikName).toBe("Roundtrip IK");
  expect(restored.offscreenCount).toBe(1);
  expect(restored.offscreenWidth).toBe(512);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
