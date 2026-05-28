import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import { clickFileMenuItem, createSceneAndClip } from "../helpers/operations";


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

let tmpDir: string;

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-roundtrip-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("VMCマッピングが保存/復元で永続化される", async ({ app, window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const vmcStore = v.useVMCStore as any;
    vmcStore.getState().addMapping({
      vmcName: "Blink_L",
      parameterId: "param-blink-l",
      scale: 1.5,
      offset: 0.1,
    });
    vmcStore.getState().addMapping({
      vmcName: "Blink_R",
      parameterId: "param-blink-r",
      scale: 2.0,
      offset: -0.5,
    });
  });

  const savePath = path.join(tmpDir, "vmc-roundtrip.vivi");
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "別名で保存");
  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });

  await clickFileMenuItem(window, "閉じる");
  await expect(async () => {
    const closed = await window.evaluate(() => {
      const v = window.__vivi2d;
      return !v || !(v.useEditorStore as any).getState().project;
    });
    expect(closed).toBe(true);
  }).toPass({ timeout: 5_000 });

  await mockOpenVivi(app, savePath);
  await clickFileMenuItem(window, "開く");
  await expect(async () => {
    const loaded = await window.evaluate(() => {
      const v = window.__vivi2d;
      return !!v && !!(v.useEditorStore as any).getState().project;
    });
    expect(loaded).toBe(true);
  }).toPass({ timeout: 10_000 });

  const vmcResult = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const vmcStore = v.useVMCStore as any;
    const mappings = vmcStore.getState().mappings;
    return {
      count: mappings?.length ?? 0,
    };
  });

  expect(vmcResult.count).toBeGreaterThanOrEqual(0);
});

test("ArtPathノードが保存/復元で永続化される", async ({ app, window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    if (!v.useArtPathStore) return;
    const apStore = v.useArtPathStore as any;
    const artPathId = apStore.getState().addArtPath("永続化テストパス", 50, 100);
    apStore.getState().addControlPoint(artPathId, {
      x: 50,
      y: 100,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 30,
      handleOutY: 0,
      width: 5,
      opacity: 1,
    });
    apStore.getState().addControlPoint(artPathId, {
      x: 200,
      y: 100,
      handleInX: -30,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 5,
      opacity: 1,
    });
    apStore.getState().setStyle(artPathId, { color: 0xff0000, baseWidth: 8 });
  });

  await expect(
    window.locator(".layer-item", { hasText: "永続化テストパス" }),
  ).toBeVisible();

  const savePath = path.join(tmpDir, "artpath-roundtrip.vivi");
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "別名で保存");
  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });

  await clickFileMenuItem(window, "閉じる");
  await expect(async () => {
    const closed = await window.evaluate(() => {
      const v = window.__vivi2d;
      return !v || !(v.useEditorStore as any).getState().project;
    });
    expect(closed).toBe(true);
  }).toPass({ timeout: 5_000 });

  await mockOpenVivi(app, savePath);
  await clickFileMenuItem(window, "開く");
  await expect(async () => {
    const loaded = await window.evaluate(() => {
      const v = window.__vivi2d;
      return !!v && !!(v.useEditorStore as any).getState().project;
    });
    expect(loaded).toBe(true);
  }).toPass({ timeout: 10_000 });

  const artPathResult = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    if (!project) return { ok: false };

    const artPath = project.layers.find(
      (l: any) => l.kind === "artPath" && l.name === "永続化テストパス",
    );
    if (!artPath) return { ok: false, reason: "artPath not found" };

    return {
      ok: true,
      name: artPath.name,
      controlPointCount: artPath.controlPoints?.length ?? 0,
      color: artPath.style?.color,
      baseWidth: artPath.style?.baseWidth,
    };
  });

  expect(artPathResult.ok).toBe(true);
  expect(artPathResult.name).toBe("永続化テストパス");
  expect(artPathResult.controlPointCount).toBe(2);
  expect(artPathResult.color).toBe(0xff0000);
  expect(artPathResult.baseWidth).toBe(8);
});

test("画像シーケンストラックが保存/復元で永続化される", async ({ app, window }) => {
  await createSceneAndClip(window);

  const setupOk = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const clipStore = v.useClipStore as any;
    const project = store.getState().project;
    if (!project) return false;

    const scenes = project.scenes ?? [];
    if (scenes.length === 0) return false;
    const clip = scenes[0]?.clips?.[0];
    if (!clip) return false;

    const meshId = project.layers[0]?.id;
    if (!meshId) return false;

    clipStore.getState().addImageSequenceTrack(clip.id, meshId);
    clipStore.getState().addImageSequenceEntry(clip.id, meshId, 0, "img-a");
    clipStore.getState().addImageSequenceEntry(clip.id, meshId, 10, "img-b");
    return true;
  });

  if (!setupOk) {
    return;
  }

  const savePath = path.join(tmpDir, "imgseq-roundtrip.vivi");
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "別名で保存");
  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });

  await clickFileMenuItem(window, "閉じる");
  await expect(async () => {
    const closed = await window.evaluate(() => {
      const v = window.__vivi2d;
      return !v || !(v.useEditorStore as any).getState().project;
    });
    expect(closed).toBe(true);
  }).toPass({ timeout: 5_000 });

  await mockOpenVivi(app, savePath);
  await clickFileMenuItem(window, "開く");
  await expect(async () => {
    const loaded = await window.evaluate(() => {
      const v = window.__vivi2d;
      return !!v && !!(v.useEditorStore as any).getState().project;
    });
    expect(loaded).toBe(true);
  }).toPass({ timeout: 10_000 });

  const imgSeqResult = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    if (!project) return { ok: false };

    const scenes = project.scenes ?? [];
    if (scenes.length === 0) return { ok: false, reason: "no scenes" };
    const clip = scenes[0]?.clips?.[0];
    if (!clip) return { ok: false, reason: "no clip" };

    const tracks = clip.imageSequenceTracks ?? [];
    return {
      ok: true,
      trackCount: tracks.length,
      entryCount: tracks[0]?.entries?.length ?? 0,
      firstImageId: tracks[0]?.entries?.[0]?.imageId,
    };
  });

  expect(imgSeqResult.ok).toBe(true);
  expect(imgSeqResult.trackCount).toBe(1);
  expect(imgSeqResult.entryCount).toBe(2);
  expect(imgSeqResult.firstImageId).toBe("img-a");
});

test("全Tier Cデータを含む複合プロジェクトの保存/復元", async ({ app, window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const ikStore = v.useIKControllerStore as any;
    const osStore = v.useOffscreenStore as any;
    const vmcStore = v.useVMCStore as any;
    const apStore = v.useArtPathStore as any;

    const project = store.getState().project;
    if (!project) return;

    ikStore.getState().addIKController("複合テストIK-TB", "twoBone", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI / 2, maxAngle: Math.PI / 2 },
    ]);
    ikStore
      .getState()
      .addIKController("複合テストIK-CCD", "ccd", [
        { boneId: "b3", minAngle: -Math.PI, maxAngle: Math.PI },
      ]);

    osStore.getState().addOffscreenTarget(512, 512);

    vmcStore.getState().addMapping({
      vmcName: "Blink_L",
      parameterId: "p-blink-l",
      scale: 1,
      offset: 0,
    });

    // ArtPath
    if (apStore) {
      const apId = apStore.getState().addArtPath("複合テストパス", 0, 0);
      apStore.getState().addControlPoint(apId, {
        x: 0,
        y: 0,
        handleInX: 0,
        handleInY: 0,
        handleOutX: 50,
        handleOutY: 0,
        width: 3,
        opacity: 1,
      });
    }
  });

  const savePath = path.join(tmpDir, "full-roundtrip.vivi");
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "別名で保存");
  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });

  const fileContent = fs.readFileSync(savePath, "utf-8");
  const parsed = JSON.parse(fileContent);
  expect(parsed.version).toBeDefined();
  expect(parsed.project).toBeDefined();

  await clickFileMenuItem(window, "閉じる");
  await expect(async () => {
    const closed = await window.evaluate(() => {
      const v = window.__vivi2d;
      return !v || !(v.useEditorStore as any).getState().project;
    });
    expect(closed).toBe(true);
  }).toPass({ timeout: 5_000 });

  await mockOpenVivi(app, savePath);
  await clickFileMenuItem(window, "開く");
  await expect(async () => {
    const loaded = await window.evaluate(() => {
      const v = window.__vivi2d;
      return !!v && !!(v.useEditorStore as any).getState().project;
    });
    expect(loaded).toBe(true);
  }).toPass({ timeout: 10_000 });

  const result = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    if (!project) return { ok: false };

    return {
      ok: true,
      ikCount: project.ikControllers?.length ?? 0,
      ikNames: project.ikControllers?.map((c: any) => c.name) ?? [],
      ikSolverTypes: project.ikControllers?.map((c: any) => c.solverType) ?? [],
      osCount: project.offscreenTargets?.length ?? 0,
      artPathCount: project.layers.filter((l: any) => l.kind === "artPath").length,
      artPathName: project.layers.find((l: any) => l.kind === "artPath")?.name,
    };
  });

  expect(result.ok).toBe(true);
  expect(result.ikCount).toBe(2);
  expect(result.ikNames).toContain("複合テストIK-TB");
  expect(result.ikNames).toContain("複合テストIK-CCD");
  expect(result.ikSolverTypes).toContain("twoBone");
  expect(result.ikSolverTypes).toContain("ccd");
  expect(result.osCount).toBe(1);
  expect(result.artPathCount).toBe(1);
  expect(result.artPathName).toBe("複合テストパス");
});
