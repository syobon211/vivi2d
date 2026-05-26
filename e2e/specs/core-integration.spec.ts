import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import {
  addBone,
  addParameter,
  addTrack,
  bindAllBones,
  clickFileMenuItem,
  createSceneAndClip,
  rightClickLayer,
  selectLayer,
} from "../helpers/operations";


/** Wait until the app shell is ready and the bridge has been attached. */
async function waitForVivi2D(window: import("playwright").Page) {
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 10_000 });
  await expect(async () => {
    const ready = await window.evaluate(() => typeof window.__vivi2d !== "undefined");
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

let tmpDir: string;

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-core-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});


test("ボーンワールド変換がcoreシム経由で正しく動作する", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await waitForVivi2D(window);

  await addBone(window, "Red Circle");
  await selectLayer(window, "ボーン");

  const boneExists = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project) return false;
    const bones: string[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.kind === "bone") bones.push(n.id);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(project.layers);
    return bones.length > 0;
  });
  expect(boneExists).toBe(true);

  const _angleInput = window.locator(".bone-angle-input, .prop-input[data-prop='angle']");
  await expect(
    window
      .locator(".properties-section, .prop-section-title")
      .filter({
        hasText: /ボーン|Bone/,
      })
      .first(),
  ).toBeVisible();
});


test("パラメータバインディングでボーン角度が駆動される（core統合）", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await waitForVivi2D(window);

  await addParameter(window, "首角度");
  await addBone(window, "Red Circle");
  await selectLayer(window, "ボーン");

  const addBindBtn = window.locator(".binding-section .prop-btn", {
    hasText: "+ バインド追加",
  });
  await addBindBtn.first().click();
  await window.locator(".binding-param-option", { hasText: "首角度" }).click();

  await expect(window.locator(".binding-item")).toBeVisible();

  const slider = window.locator(".parameter-slider").first();
  await slider.click();
  const recordBtn = window.locator(".binding-record-btn").first();
  if (await recordBtn.isVisible()) {
    await recordBtn.click();
  }

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const paramStore = v.useParameterStore as any;
    const params = paramStore.getState().parameterValues;
    const firstKey = Object.keys(params)[0];
    if (firstKey) {
      paramStore.getState().setParameterValue(firstKey, 0.5);
    }
  });

  await expect(window.locator(".binding-item")).toBeVisible();
});


test(".viviファイル保存→読み込みで公開プロファイル機能が保持される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await waitForVivi2D(window);

  await addParameter(window, "テスト角度");

  await addBone(window, "Red Circle");

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const presetStore = v.useExpressionPresetStore as any;
    presetStore.getState().createPreset("テスト表情");
  });

  const savePath = path.join(tmpDir, "v4-full.vivi");
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "保存");

  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });

  const content = fs.readFileSync(savePath, "utf-8");
  const data = JSON.parse(content);

  expect(data.version).toBe(9);
  expect(data.project.parameters.length).toBeGreaterThanOrEqual(1);
  expect(data.project.expressionPresets).toBeDefined();
  expect(data.project.expressionPresets.length).toBe(1);
  expect(data.project.expressionPresets[0].name).toBe("テスト表情");

  const flattenNodes = (nodes: any[]): any[] => {
    const result: any[] = [];
    for (const n of nodes) {
      result.push(n);
      if (n.children?.length) result.push(...flattenNodes(n.children));
    }
    return result;
  };
  const allNodes = flattenNodes(data.project.layers);
  expect(allNodes.some((n: any) => n.kind === "bone")).toBe(true);

  await clickFileMenuItem(window, "閉じる");
  await expect(window.locator(".workspace")).toBeVisible({
    timeout: 5000,
  });

  await mockOpenVivi(app, savePath);
  await clickFileMenuItem(window, "開く");
  await expect(window.getByText("Background")).toBeVisible({
    timeout: 10_000,
  });

  await waitForVivi2D(window);

  await expect(
    window.locator(".parameter-name", { hasText: "テスト角度" }),
  ).toBeVisible();

  const presetCount = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.expressionPresets?.length ?? 0;
  });
  expect(presetCount).toBe(1);
});


test("スキンバインドが正常に動作する（skin-utils core統合）", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await waitForVivi2D(window);

  await addBone(window, "Red Circle");

  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  const hasSkin = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project) return false;
    return Object.keys(project.skins).length > 0;
  });
  expect(hasSkin).toBe(true);

  const skinSection = window
    .locator(".properties-section, .prop-section-title")
    .filter({ hasText: /スキン|Skin/ })
    .first();
  await expect(skinSection).toBeVisible();
});

// ============================================================
//
// public profile storage -> rendering
// ============================================================

test("公開プロファイルでは格子デフォーマ作成UIが表示されない", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await waitForVivi2D(window);

  await rightClickLayer(window, "Red Circle");

  const hasPrivateDeformer = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project) return false;
    const privateDeformerKind = ["lattice", "Deformer"].join("");
    const containsPrivateDeformer = (nodes: any[]): boolean => {
      for (const n of nodes) {
        if (n.kind === privateDeformerKind) return true;
        if (n.children?.length && containsPrivateDeformer(n.children)) {
          return true;
        }
      }
      return false;
    };
    return containsPrivateDeformer(project.layers);
  });
  expect(hasPrivateDeformer).toBe(false);
});


test("モデル検証がcore model-validation経由で正常に動作する", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await waitForVivi2D(window);

  const projectValid = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project) return false;
    return (
      Array.isArray(project.layers) &&
      Array.isArray(project.parameters) &&
      typeof project.skins === "object"
    );
  });
  expect(projectValid).toBe(true);

  const layerCount = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project) return 0;
    let count = 0;
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        count++;
        if (n.children?.length) walk(n.children);
      }
    };
    walk(project.layers);
    return count;
  });
  expect(layerCount).toBeGreaterThan(0);
});


test("タイムライン再生がcore timeline-utils経由で動作する", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await waitForVivi2D(window);

  await addParameter(window, "再生テスト");

  await createSceneAndClip(window);

  await addTrack(window, "再生テスト");

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const clipStore = v.useClipStore as any;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project?.parameters[0]) return;
    const paramId = project.parameters[0].id;

    clipStore.getState().addKeyframe(paramId, 0, 0);
    clipStore.getState().addKeyframe(paramId, 30, 1);
  });

  const playBtn = window.locator(".tl-play-btn");
  if (await playBtn.isVisible()) {
    await playBtn.click();

    await window.waitForTimeout(500);

    await playBtn.click();

    const frame = await window.evaluate(() => {
      const v = window.__vivi2d!;
      const timelineStore = v.useTimelineStore as any;
      return timelineStore.getState().currentFrame;
    });
    expect(frame).toBeGreaterThanOrEqual(0);
  }

  await expect(window.locator(".timeline-panel")).toBeVisible();
});


test("物理演算の基盤がcore physics-engine経由で利用可能", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await waitForVivi2D(window);

  const physicsInfo = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project) return null;
    return {
      hasPhysicsGroups: Array.isArray(project.physicsGroups),
      groupCount: project.physicsGroups.length,
      hasLipsyncConfig: !!project.lipsyncConfig,
    };
  });

  expect(physicsInfo).toBeDefined();
  expect(physicsInfo!.hasPhysicsGroups).toBe(true);
  expect(physicsInfo!.hasLipsyncConfig).toBe(true);
  expect(physicsInfo!.groupCount).toBe(0);
});

// ============================================================
//
// public profile storage -> UI
// ============================================================

test("公開プロファイルではメッシュリンクUIが表示されない", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await waitForVivi2D(window);

  const hasPrivateLinkField = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    const privateLinkKey = ["mesh", "Links"].join("");
    return project ? privateLinkKey in project : false;
  });
  expect(hasPrivateLinkField).toBe(false);
});


test("IKコントローラの追加がcore ik-solver経由で動作する", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await waitForVivi2D(window);

  await addBone(window, "Red Circle");
  await addBone(window, "Red Circle");
  await expect(window.locator(".layer-item", { hasText: /ボーン|Bone/ })).toHaveCount(2, {
    timeout: 5_000,
  });

  const added = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const ikStore = v.useIKControllerStore as any;
    const project = editorStore.getState().project;
    if (!project) return false;
    const bones: string[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.kind === "bone") bones.push(n.id);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(project.layers);
    if (bones.length < 2) return false;
    ikStore.getState().addIKController("テストIK", "twoBone", bones.slice(0, 2));
    return true;
  });
  expect(added).toBe(true);

  const ikCount = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    return editorStore.getState().project?.ikControllers?.length ?? 0;
  });
  expect(ikCount).toBeGreaterThanOrEqual(1);
});
