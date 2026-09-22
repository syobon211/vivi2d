import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import projectV11Manifest from "../../tests/conformance/project-embedded-round-trip-v11/manifest.json" with {
  type: "json",
};
import { expect, test } from "../fixtures";
import { mockOpenPng, mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import {
  addBone,
  addParameter,
  addTrack,
  bindAllBones,
  clickFileMenuItem,
  createSceneAndClip,
  selectLayer,
} from "../helpers/operations";
import { decodeThreeVideoFrames } from "../helpers/video-frames";

let tmpDir: string;

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-saveload-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function saveAndVerify(
  app: import("playwright").ElectronApplication,
  window: import("playwright").Page,
  savePath: string,
) {
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "保存");

  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function closeAndVerify(window: import("playwright").Page) {
  await clickFileMenuItem(window, "閉じる");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5_000 });
}

async function openAndVerify(
  app: import("playwright").ElectronApplication,
  window: import("playwright").Page,
  viviPath: string,
) {
  await mockOpenVivi(app, viviPath);
  await clickFileMenuItem(window, "開く");

  await expect(window.getByText("Background")).toBeVisible({
    timeout: 10_000,
  });
}

test("PSDインポート -> .vivi保存 -> 読み込みで状態が復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();

  const savePath = path.join(tmpDir, "roundtrip-full.vivi");
  await saveAndVerify(app, window, savePath);

  const content = fs.readFileSync(savePath, "utf-8");
  const data = JSON.parse(content);
  expect(data.version).toBeDefined();
  expect(data.project).toBeDefined();
  expect(data.project.layers.length).toBeGreaterThan(0);

  await closeAndVerify(window);

  await openAndVerify(app, window, savePath);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});

test("保存後にプロジェクト名がUIに反映される", async ({ app, window, loadTestPsd }) => {
  await loadTestPsd();

  await expect(window.locator(".project-name")).toHaveText("test");

  const savePath = path.join(tmpDir, "my-project.vivi");
  await saveAndVerify(app, window, savePath);

  await expect(window.locator(".project-name")).toHaveText("test");
});

test("保存キャンセル時にファイルが作成されない", async ({ app, window, loadTestPsd }) => {
  await loadTestPsd();

  const savePath = path.join(tmpDir, "should-not-exist.vivi");

  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({
      canceled: true,
      filePath: "",
    });
  });

  await clickFileMenuItem(window, "保存");

  expect(fs.existsSync(savePath)).toBe(false);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});

test("パラメータ追加後の保存 -> 読み込みでパラメータが復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addParameter(window, "角度X");
  await addParameter(window, "開閉Y");

  await expect(window.locator(".parameter-name", { hasText: "角度X" })).toBeVisible();
  await expect(window.locator(".parameter-name", { hasText: "開閉Y" })).toBeVisible();

  const savePath = path.join(tmpDir, "param-roundtrip.vivi");
  await saveAndVerify(app, window, savePath);

  await closeAndVerify(window);

  await openAndVerify(app, window, savePath);

  await expect(window.locator(".parameter-name", { hasText: "角度X" })).toBeVisible();
  await expect(window.locator(".parameter-name", { hasText: "開閉Y" })).toBeVisible();
});

test("ボーン+スキンバインド後の保存 -> 読み込みで復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addBone(window, "Red Circle");
  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible();

  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  const skinSection = window.locator(".properties-section").filter({ hasText: "スキン" });
  await expect(skinSection.getByText("ボーン数")).toBeVisible();

  const savePath = path.join(tmpDir, "bone-skin-roundtrip.vivi");
  await saveAndVerify(app, window, savePath);

  await closeAndVerify(window);

  await openAndVerify(app, window, savePath);

  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible();

  await selectLayer(window, "Red Circle");
  const skinSectionAfter = window
    .locator(".properties-section")
    .filter({ hasText: "スキン" });
  await expect(skinSectionAfter.getByText("ボーン数")).toBeVisible();
});

test("キーフレームアニメーション後の保存 -> 読み込みで復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addParameter(window, "回転Z");

  await createSceneAndClip(window);

  await addTrack(window, "回転Z");
  await expect(window.locator(".tl-track-name", { hasText: "回転Z" })).toBeVisible();

  const addKfBtn = window.locator(".tl-kf-btn").first();
  await addKfBtn.click();

  await expect(window.locator(".tl-keyframe")).toBeVisible();

  const savePath = path.join(tmpDir, "anim-roundtrip.vivi");
  await saveAndVerify(app, window, savePath);

  const content = fs.readFileSync(savePath, "utf-8");
  const data = JSON.parse(content);
  expect(data.project.scenes.length).toBeGreaterThan(0);
  expect(data.project.scenes[0].clips.length).toBeGreaterThan(0);

  await closeAndVerify(window);

  await openAndVerify(app, window, savePath);

  await expect(window.locator(".parameter-name", { hasText: "回転Z" })).toBeVisible();

  const restored = fs.readFileSync(savePath, "utf-8");
  const restoredData = JSON.parse(restored);
  const scenes = restoredData.project.scenes;
  expect(scenes.length).toBeGreaterThan(0);
  const clips = scenes[0].clips;
  expect(clips.length).toBeGreaterThan(0);
  const tracks = clips[0].tracks ?? [];
  expect(tracks.length).toBeGreaterThan(0);
  const keyframes = tracks[0].keyframes ?? [];
  expect(keyframes.length).toBeGreaterThan(0);

  const sceneSelect = window.locator(".tl-scene-select");
  const sceneOptions = sceneSelect.locator("option");
  const sceneOptionCount = await sceneOptions.count();
  expect(sceneOptionCount).toBeGreaterThan(0);

  const firstSceneValue = await sceneOptions.last().getAttribute("value");
  if (firstSceneValue) {
    await sceneSelect.selectOption(firstSceneValue);

    const clipSelect = window.locator(".tl-clip-select");
    await expect(clipSelect).toBeVisible();
    const clipOptions = clipSelect.locator("option");
    const lastClipValue = await clipOptions.last().getAttribute("value");
    if (lastClipValue) {
      await clipSelect.selectOption(lastClipValue);

      await expect(window.locator(".tl-track-name", { hasText: "回転Z" })).toBeVisible({
        timeout: 5_000,
      });

      await expect(window.locator(".tl-keyframe")).toBeVisible();
    }
  }
});

test(".vivb バイナリ形式で保存 -> 読み込みで状態が復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();

  await addParameter(window, "バイナリテスト");

  const savePath = path.join(tmpDir, "roundtrip.vivb");
  await saveAndVerify(app, window, savePath);

  const buf = fs.readFileSync(savePath);
  expect(buf[0]).toBe(0x56); // V
  expect(buf[1]).toBe(0x49); // I
  expect(buf[2]).toBe(0x56); // V
  expect(buf[3]).toBe(0x42); // B

  expect(buf[0]).not.toBe(0x7b);

  await closeAndVerify(window);

  await openAndVerify(app, window, savePath);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();

  await expect(
    window.locator(".parameter-name", { hasText: "バイナリテスト" }),
  ).toBeVisible();
});

test(".vivb は .vivi より小さいファイルサイズになる", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const viviPath = path.join(tmpDir, "compare.vivi");
  await saveAndVerify(app, window, viviPath);

  const vivbPath = path.join(tmpDir, "compare.vivb");
  await mockSaveDialog(app, vivbPath);
  await clickFileMenuItem(window, "別名で保存");
  await expect(async () => {
    expect(fs.existsSync(vivbPath)).toBe(true);
  }).toPass({ timeout: 10_000 });

  const viviSize = fs.statSync(viviPath).size;
  const vivbSize = fs.statSync(vivbPath).size;

  expect(vivbSize).toBeLessThan(viviSize);
});

test("大きなプロジェクト(多レイヤー)でも保存/読み込みが正常", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addBone(window, "Red Circle");

  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  await addParameter(window, "パラメータ1");
  await addParameter(window, "パラメータ2");
  await addParameter(window, "パラメータ3");
  await addParameter(window, "パラメータ4");
  await addParameter(window, "パラメータ5");

  await createSceneAndClip(window);

  await addTrack(window, "パラメータ1");
  await addTrack(window, "パラメータ2");
  await addTrack(window, "パラメータ3");

  const savePath = path.join(tmpDir, "large-project.vivi");
  const startTime = Date.now();
  await saveAndVerify(app, window, savePath);
  const saveTime = Date.now() - startTime;

  expect(saveTime).toBeLessThan(5_000);

  const stat = fs.statSync(savePath);
  expect(stat.size).toBeGreaterThan(0);

  await closeAndVerify(window);

  const loadStartTime = Date.now();
  await openAndVerify(app, window, savePath);
  const loadTime = Date.now() - loadStartTime;

  expect(loadTime).toBeLessThan(10_000);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "パラメータ1" }),
  ).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "パラメータ2" }),
  ).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "パラメータ3" }),
  ).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "パラメータ4" }),
  ).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "パラメータ5" }),
  ).toBeVisible();
});

function v11Fixture() {
  const wire = JSON.parse(projectV11Manifest.documents[0]!.inputUtf8);
  const png = projectV11Manifest.pngCases.find((entry) => entry.id === "frozen-palette")!;
  wire.project.name = "Atlas round trip";
  const mesh = wire.project.layers[0].children[1];
  mesh.name = "Atlas mesh";
  const neighbour = structuredClone(mesh);
  neighbour.id = "neighbour";
  neighbour.name = "Atlas neighbour";
  neighbour.mesh.uvs[0] = -0.25;
  wire.project.layers[0].children.push(neighbour);
  wire.atlases[0].image = png.base64;
  wire.atlases[0].width = png.width;
  wire.atlases[0].height = png.height;
  wire.atlases[0].entries.push({
    ...wire.atlases[0].entries[0],
    layerId: neighbour.id,
    x: 1,
  });
  const transparent = projectV11Manifest.pngCases.find(
    (entry) => entry.id === "frozen-rgba-alpha-zero-preserves-rgb",
  )!;
  // Real Canvas readback may erase RGB under alpha zero; source PNG still owns it.
  wire.atlases.push({
    id: "retained-empty",
    image: transparent.base64,
    width: transparent.width,
    height: transparent.height,
    entries: [],
  });
  return wire;
}

async function expectCompositorPixels(
  app: import("playwright").ElectronApplication,
  window: import("playwright").Page,
  points: number[][],
  expected: number[][],
) {
  const canvas = window.locator(".canvas-container canvas");
  await expect(async () => {
    const rect = await canvas.boundingBox();
    if (!rect) throw Error("Canvas missing");
    const png = await canvas.screenshot({ scale: "css", animations: "allow" });
    const observed = await app.evaluate(
      ({ nativeImage }, { data, positions }) => {
        const image = nativeImage.createFromBuffer(Buffer.from(data, "base64"));
        const { width, height } = image.getSize(),
          pixels = image.toBitmap();
        return positions.map(([x, y]) => {
          if (x! < 0 || y! < 0 || x! >= width || y! >= height)
            throw Error("Pixel outside canvas");
          const index = (y! * width + x!) * 4;
          return [pixels[index + 2], pixels[index + 1], pixels[index]];
        });
      },
      {
        data: png.toString("base64"),
        positions: points.map(([x, y]) => [
          Math.floor(x! + rect.x - Math.floor(rect.x)),
          Math.floor(y! + rect.y - Math.floor(rect.y)),
        ]),
      },
    );
    for (let point = 0; point < expected.length; point++)
      for (let channel = 0; channel < 3; channel++)
        expect(
          Math.abs(observed[point]![channel]! - expected[point]![channel]!),
        ).toBeLessThanOrEqual(3);
  }).toPass();
}

function boundMaskFixture() {
  const wire = JSON.parse(projectV11Manifest.documents[0]!.inputUtf8);
  const png = projectV11Manifest.pngCases.find((entry) => entry.id === "frozen-palette")!;
  wire.project.name = "Bound mask display";
  wire.project.width = wire.project.height = 64;
  wire.project.parameters[0].name = "Bound mask";
  wire.project.parameters[0].defaultValue = 0;
  const group = wire.project.layers[0];
  const bone = group.children[0],
    target = group.children[1];
  bone.name = "Bound bone";
  bone.x = bone.y = 0;
  Object.assign(bone.bone, { angle: 0, length: 2, scaleX: 1, scaleY: 1 });
  target.name = "Bound target";
  target.x = target.y = 0;
  target.mesh.vertices = [0, 0, 64, 0, 0, 64, 64, 64];
  target.mesh.uvs = [0.25, 0.5, 0.25, 0.5, 0.25, 0.5, 0.25, 0.5];
  target.mesh.indices = [0, 1, 2, 1, 3, 2];
  const mask = structuredClone(target);
  mask.id = "mask";
  mask.name = "Hidden bound mask";
  mask.visible = false;
  mask.x = 4;
  mask.mesh.vertices = [0, 0, 16, 0, 0, 64, 16, 64];
  target.clipMaskIds = [mask.id];
  group.children.push(mask);
  wire.project.skins = {
    mask: {
      weights: Array.from({ length: 4 }, () => [{ boneId: bone.id, weight: 1 }]),
      bindPoseInverse: { [bone.id]: [1, 0, 0, 1, 0, 0] },
    },
  };
  wire.project.parameterBindings = [
    {
      id: "bound-x",
      parameterId: "Motion.x",
      target: { type: "bone", boneId: bone.id, property: "x" },
      bindingPoints: [
        { paramValue: 0, targetValue: 0 },
        { paramValue: 1, targetValue: 24 },
      ],
    },
  ];
  Object.assign(wire.atlases[0], {
    image: png.base64,
    width: png.width,
    height: png.height,
  });
  wire.atlases[0].entries = [target, mask].map((layer) => ({
    ...wire.atlases[0].entries[0],
    layerId: layer.id,
  }));
  return wire;
}

function legacyBoundFixture() {
  const wire = boundMaskFixture();
  wire.version = 9;
  delete wire.assetMode;
  delete wire.documentId;
  wire.project.ikControllers = [];
  const group = wire.project.layers[0],
    target = group.children[1];
  group.children = group.children.slice(0, 2);
  target.x = 4;
  target.mesh.vertices = [0, 0, 16, 0, 0, 64, 16, 64];
  delete target.clipMaskIds;
  wire.project.skins = { [target.id]: wire.project.skins.mask };
  wire.atlases[0].entries = wire.atlases[0].entries.slice(0, 1);
  return wire;
}

test("legacy onion removal and image-sequence playback update natural pixels", async ({
  app,
  window,
}) => {
  const wire = legacyBoundFixture();
  wire.project.parameterBindings = [];
  const clip = {
    id: "pixel-clip",
    name: "Pixel",
    duration: 3,
    fps: 4,
    tracks: [],
    boneTracks: [
      {
        boneId: "bone-0",
        property: "angle",
        keyframes: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 1, value: -Math.PI / 2, interpolation: "linear" },
        ],
      },
    ],
  };
  wire.project.scenes = [{ id: "pixel-scene", name: "Pixel", clips: [clip] }];
  const source = path.join(tmpDir, "onion.vivi");
  fs.writeFileSync(source, JSON.stringify(wire));
  await mockOpenVivi(app, source);
  await clickFileMenuItem(window, "開く");
  await expect(window.locator(".project-name")).toHaveText("Bound mask display");
  await window
    .getByRole("combobox", { name: "シーン選択", exact: true })
    .selectOption("pixel-scene");
  await window
    .getByRole("combobox", { name: "クリップ選択", exact: true })
    .selectOption("pixel-clip");
  const authoringSnapshot = () =>
    window.evaluate(() => {
      const api = window.__vivi2d as any;
      return {
        project: JSON.stringify(api.useEditorStore.getState().project),
        undo: api.useHistoryStore.getState().undoStack.length,
      };
    });
  const authoringBefore = await authoringSnapshot();
  await window.evaluate(() => {
    const api = window.__vivi2d as any;
    api.useViewportStore.getState().setZoom(1);
    api.useViewportStore.getState().setPan(100, 100);
    api.useThemeStore.getState().setTheme("dark");
    api.useViewportStore.getState().setOnionSkinSettings({
      enabled: true,
      framesBefore: 0,
      framesAfter: 1,
      opacity: 0.5,
    });
  });
  // Next-frame bone rotation puts a red ghost above the white project rectangle.
  await expectCompositorPixels(app, window, [[140, 92]], [[143, 15, 23]]);
  await window.evaluate(() =>
    (window.__vivi2d as any).useViewportStore
      .getState()
      .setOnionSkinSettings({ enabled: false }),
  );
  await expectCompositorPixels(app, window, [[140, 92]], [[30, 30, 46]]);
  expect(await authoringSnapshot()).toEqual(authoringBefore);

  // Replace the authored fixture, retaining the existing normal load/play route.
  const sequence = legacyBoundFixture(),
    visible = sequence.project.layers[0].children[1];
  const green = structuredClone(visible);
  green.id = "green-source";
  green.name = "Green source";
  green.visible = false;
  green.mesh.uvs = [0.75, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5];
  sequence.project.layers = [visible, green];
  sequence.project.skins = {};
  sequence.project.parameterBindings = [];
  sequence.atlases[0].entries.push({
    ...sequence.atlases[0].entries[0],
    layerId: green.id,
    x: 1,
  });
  sequence.project.scenes = [
    {
      id: "sequence-scene",
      name: "Sequence",
      clips: [
        {
          id: "sequence-clip",
          name: "Sequence",
          duration: 3,
          fps: 4,
          tracks: [],
          imageSequenceTracks: [
            {
              targetMeshId: visible.id,
              entries: [
                { startFrame: 0, imageId: visible.id },
                { startFrame: 1, imageId: green.id },
              ],
            },
          ],
        },
      ],
    },
  ];
  const sequencePath = path.join(tmpDir, "sequence.vivi");
  fs.writeFileSync(sequencePath, JSON.stringify(sequence));
  await mockOpenVivi(app, sequencePath);
  await clickFileMenuItem(window, "開く");
  await window
    .getByRole("combobox", { name: "シーン選択", exact: true })
    .selectOption("sequence-scene");
  await window
    .getByRole("combobox", { name: "クリップ選択", exact: true })
    .selectOption("sequence-clip");
  await window.evaluate(() => {
    const camera = (window.__vivi2d as any).useViewportStore.getState();
    camera.setZoom(1);
    camera.setPan(0, 0);
  });
  await expectCompositorPixels(app, window, [[8, 20]], [[255, 0, 0]]);
  await window.getByRole("button", { name: "再生", exact: true }).click();
  await expectCompositorPixels(app, window, [[8, 20]], [[0, 255, 0]]);
});

test("idle display updates natural compositor pixels without preserved readback", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await window.evaluate(() => {
    const api = window.__vivi2d as any;
    const editor = api.useEditorStore.getState();
    const red = editor.project.layers.find((layer: any) => layer.name === "Red Circle");
    const background = editor.project.layers.find(
      (layer: any) => layer.name === "Background",
    );
    // Make the tested compositing order explicit, independent of PSD stacking.
    editor.setDrawOrder(red.id, 600);
    editor.setDrawOrder(background.id, 0);
    api.useViewportStore.getState().setZoom(1);
    api.useViewportStore.getState().setPan(20, 20);
    api.useThemeStore.getState().setTheme("dark");
  });
  const canvas = window.locator(".canvas-container canvas");
  expect(
    await canvas.evaluate((element) => {
      const surface = element as HTMLCanvasElement;
      const gl = surface.getContext("webgl2") ?? surface.getContext("webgl");
      if (!gl || gl.isContextLost()) throw Error("Live WebGL required");
      return gl.getContextAttributes()!.preserveDrawingBuffer;
    }),
  ).toBe(false);
  const expectPixel = (point: [number, number], expected: number[]) =>
    expectCompositorPixels(app, window, [point], [expected]);
  // Independent solid PSD colours: red alpha180 over gray200 => (239,59,59).
  await expectPixel([32, 32], [239, 59, 59]);
  const toggle = () =>
    window.evaluate(() => {
      const state = (window.__vivi2d as any).useEditorStore.getState();
      const find = (layers: any[]): any =>
        layers.find((l) => l.name === "Red Circle") ??
        layers.flatMap((l) => l.children ?? []).find((l) => l.name === "Red Circle");
      state.toggleVisibility(find(state.project.layers).id);
    });
  await toggle();
  await expectPixel([32, 32], [200, 200, 200]);
  await window.keyboard.press("Control+z");
  await expectPixel([32, 32], [239, 59, 59]);
  await selectLayer(window, "Red Circle");
  await window.evaluate(() =>
    (window.__vivi2d as any).useViewportStore
      .getState()
      .setReferenceOverlaySettings({ enabled: true, mode: "currentBounds", opacity: 1 }),
  );
  await expectPixel([32, 32], [158, 126, 157]);
  await window.evaluate(() =>
    (window.__vivi2d as any).useViewportStore
      .getState()
      .setReferenceOverlaySettings({ enabled: false }),
  );
  await expectPixel([32, 32], [239, 59, 59]);
  await window.evaluate(() =>
    (window.__vivi2d as any).useViewportStore.getState().setPan(120, 120),
  );
  await expectPixel([32, 32], [30, 30, 46]);
  await expectPixel([132, 132], [239, 59, 59]);
  await window.evaluate(() =>
    (window.__vivi2d as any).useThemeStore.getState().setTheme("light"),
  );
  await expectPixel([32, 32], [240, 240, 246]);
  await window.setViewportSize({ width: 1600, height: 960 });
  await expectPixel([132, 132], [239, 59, 59]);
  await closeAndVerify(window);
  await expectPixel([132, 132], [240, 240, 246]);
});

for (const profile of ["legacy", "v11"] as const) {
  test(
    profile === "legacy"
      ? "legacy media capture contains repeated and final bound frames with a non-preserved buffer"
      : "v11 clip input stays rejected without replacing the supported incumbent",
    async ({ app, window }, testInfo) => {
      const wire = profile === "legacy" ? legacyBoundFixture() : boundMaskFixture();
      wire.project.ikControllers = [];
      const clip = {
        id: "capture-clip",
        name: "capture",
        duration: 3,
        fps: 5,
        tracks: [
          {
            parameterId: "Motion.x",
            keyframes: [
              { frame: 0, value: 0, interpolation: "linear" },
              { frame: 1, value: 0, interpolation: "linear" },
              { frame: 2, value: 1, interpolation: "linear" },
            ],
          },
        ],
      };
      wire.project.scenes = [{ id: "capture-scene", name: "Capture", clips: [clip] }];
      const source = path.join(tmpDir, "capture.vivi");
      fs.writeFileSync(source, JSON.stringify(wire));
      if (profile === "v11") {
        const incumbent = path.join(tmpDir, "incumbent.vivi");
        fs.writeFileSync(incumbent, JSON.stringify(boundMaskFixture()));
        await mockOpenVivi(app, incumbent);
        await clickFileMenuItem(window, "開く");
        await expect(window.locator(".project-name")).toHaveText("Bound mask display");
        const before = await window.evaluate(() =>
          JSON.stringify((window.__vivi2d as any).useEditorStore.getState().project),
        );
        await mockOpenVivi(app, source);
        await clickFileMenuItem(window, "開く");
        await expect(
          window
            .getByRole("alert")
            .filter({ hasText: "プロジェクトの読み込みに失敗しました" }),
        ).toBeVisible();
        expect(
          await window.evaluate(() =>
            JSON.stringify((window.__vivi2d as any).useEditorStore.getState().project),
          ),
        ).toBe(before);
        await clickFileMenuItem(window, "メディア出力");
        await expect(window.locator(".modal-actions .prop-btn").first()).toBeDisabled();
        return;
      }
      await mockOpenVivi(app, source);
      await clickFileMenuItem(window, "開く");
      await expect(window.locator(".project-name")).toHaveText("Bound mask display");
      await window.evaluate(() => {
        const api = window.__vivi2d as any;
        api.useViewportStore.getState().setZoom(1);
        api.useViewportStore.getState().setPan(0, 0);
        const canvas = document.querySelector(
          ".canvas-container canvas",
        ) as HTMLCanvasElement;
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!gl || gl.isContextLost() || gl.getContextAttributes()!.preserveDrawingBuffer)
          throw Error("Capture requires live non-preserved WebGL");
      });
      await mockOpenVivi(app, tmpDir); // Native directory chooser; real export IPC/write.
      await clickFileMenuItem(window, "メディア出力");
      const button = window.locator(".modal-actions .prop-btn").first();
      await button.click();
      await expect
        .poll(() => fs.existsSync(path.join(tmpDir, "capture_00002.png")))
        .toBe(true);
      const expected = [
        [
          [255, 0, 0],
          [255, 255, 255],
        ],
        [
          [255, 0, 0],
          [255, 255, 255],
        ],
        [
          [255, 255, 255],
          [255, 0, 0],
        ],
      ];
      const dimensions = await window
        .locator(".canvas-container canvas")
        .evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          return {
            width: canvas.width,
            height: canvas.height,
            scale: canvas.width / canvas.clientWidth,
          };
        });
      for (let frame = 0; frame < 3; frame++) {
        const png = fs.readFileSync(
          path.join(tmpDir, `capture_${String(frame).padStart(5, "0")}.png`),
        );
        const samples = await app.evaluate(
          ({ nativeImage }, { data, dimensions }) => {
            const image = nativeImage.createFromBuffer(Buffer.from(data, "base64"));
            const size = image.getSize();
            if (size.width !== dimensions.width || size.height !== dimensions.height)
              throw Error("Output size mismatch");
            const pixels = image.toBitmap();
            return [8, 32].map((x) => {
              const i =
                (Math.floor(20 * dimensions.scale) * size.width +
                  Math.floor(x * dimensions.scale)) *
                4;
              return [pixels[i + 2], pixels[i + 1], pixels[i]];
            });
          },
          { data: png.toString("base64"), dimensions },
        );
        for (let point = 0; point < 2; point++)
          for (let channel = 0; channel < 3; channel++)
            expect(
              Math.abs(samples[point]![channel]! - expected[frame]![point]![channel]!),
            ).toBeLessThanOrEqual(3);
      }
      await expect(button).toBeEnabled();
      await window.locator(".media-export-select").nth(1).selectOption("mp4");
      await button.click();
      const videoPath = path.join(tmpDir, "capture.webm");
      await expect.poll(() => fs.existsSync(videoPath)).toBe(true);
      await expect(button).toBeEnabled();
      const videoBytes = fs.readFileSync(videoPath);
      let retentionStatus = "saved";
      try {
        const retainedVideo = testInfo.outputPath("synthetic-capture.webm");
        fs.mkdirSync(path.dirname(retainedVideo), { recursive: true });
        fs.writeFileSync(retainedVideo, videoBytes);
      } catch {
        retentionStatus = "unavailable";
      }
      const recordingIdentity = {
        bytes: videoBytes.length,
        sha256: createHash("sha256").update(videoBytes).digest("hex"),
        retry: testInfo.retry,
        retentionStatus,
      };
      let frames: number[][][] | undefined;
      try {
        frames = await decodeThreeVideoFrames(videoBytes, dimensions);
      } finally {
        const diagnostic = {
          recordingIdentity,
          oracle: "encoded-frames",
          decodeStatus: frames ? "decoded" : "failed",
          diagnosticPersistence: "saved",
        };
        try {
          fs.writeFileSync(
            testInfo.outputPath("capture-observation.json"),
            JSON.stringify(diagnostic, null, 2),
          );
        } catch {
          diagnostic.diagnosticPersistence = "unavailable";
        }
        console.log("[video-capture-diagnostic]", JSON.stringify(diagnostic));
      }
      // Decode actual encoded frames, not a requestFrame call-count or Blob-size claim.
      expect(frames).toHaveLength(3);
      for (let frame = 0; frame < 3; frame++)
        for (let point = 0; point < 2; point++)
          for (let channel = 0; channel < 3; channel++)
            expect(
              Math.abs(
                frames[frame]![point]![channel]! - expected[frame]![point]![channel]!,
              ),
            ).toBeLessThanOrEqual(12);
    },
  );
}

test("v11 actual bound mask pixels follow live values and binding Undo without authoring the pose", async ({
  app,
  window,
}) => {
  const wire = boundMaskFixture(),
    source = path.join(tmpDir, "bound.vivi"),
    saved = path.join(tmpDir, "bound-saved.vivi");
  fs.writeFileSync(source, JSON.stringify(wire));
  await mockOpenVivi(app, source);
  await clickFileMenuItem(window, "開く");
  await expect(window.locator(".project-name")).toHaveText("Bound mask display");
  await window.evaluate(() => {
    const api = window.__vivi2d as any;
    api.useViewportStore.getState().setZoom(1);
    api.useViewportStore.getState().setPan(0, 0);
  });
  expect(
    await window.locator(".canvas-container canvas").evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      return gl?.getContextAttributes()?.preserveDrawingBuffer;
    }),
  ).toBe(false);
  const expectPixels = (expected: number[][]) =>
    expectCompositorPixels(
      app,
      window,
      [
        [8, 20],
        [32, 20],
      ],
      expected,
    );
  const snapshot = () =>
    window.evaluate(() => {
      const api = window.__vivi2d as any,
        state = api.useEditorStore.getState();
      return {
        project: JSON.stringify(state.project),
        history: api.useHistoryStore.getState().undoStack.length,
      };
    });
  const before = await snapshot();
  await expectPixels([
    [255, 0, 0],
    [255, 255, 255],
  ]);
  const slider = window
    .locator(".parameter-item")
    .filter({ hasText: "Bound mask" })
    .locator('input[type="range"]');
  await slider.fill("1");
  await expectPixels([
    [255, 255, 255],
    [255, 0, 0],
  ]);
  expect(await snapshot()).toEqual(before);
  await window.evaluate(() =>
    (window.__vivi2d as any).useViewportStore.getState().setPan(50, 0),
  );
  await expectCompositorPixels(
    app,
    window,
    [
      [58, 20],
      [82, 20],
    ],
    [
      [255, 255, 255],
      [255, 0, 0],
    ],
  );
  await window.evaluate(() =>
    (window.__vivi2d as any).useViewportStore.getState().setPan(0, 0),
  );
  await expectPixels([
    [255, 255, 255],
    [255, 0, 0],
  ]);
  await selectLayer(window, "Bound bone");
  const item = window.locator(".binding-item").filter({ hasText: "Bound mask" });
  await item.locator(".binding-toggle").click();
  await item
    .locator(".binding-point-row")
    .filter({ hasText: "P: 1.00" })
    .getByRole("button")
    .click();
  await expectPixels([
    [255, 0, 0],
    [255, 255, 255],
  ]);
  await window.keyboard.press("Control+z");
  await expectPixels([
    [255, 255, 255],
    [255, 0, 0],
  ]);
  // A lost context retires this canvas. Correct coverage must be rebuilt on a
  // different owner; neither a restored event nor one draw proves mask recovery.
  await window.evaluate(() => {
    const canvas = document.querySelector(
      ".canvas-container canvas",
    ) as HTMLCanvasElement;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) throw Error("Context-loss proof requires WebGL extension");
    canvas.dataset.contextLossOwner = "old";
    extension.loseContext();
  });
  await expect(
    window.locator('.canvas-container canvas[data-context-loss-owner="old"]'),
  ).toHaveCount(0);
  await expect(window.locator(".canvas-container canvas")).toHaveCount(1);
  await expectPixels([
    [255, 255, 255],
    [255, 0, 0],
  ]);
  await slider.fill("0");
  await expectPixels([
    [255, 0, 0],
    [255, 255, 255],
  ]);
  await slider.fill("1");
  await expectPixels([
    [255, 255, 255],
    [255, 0, 0],
  ]);
  await mockSaveDialog(app, saved);
  await clickFileMenuItem(window, "別名で保存");
  await expect.poll(() => fs.existsSync(saved)).toBe(true);
  const output = JSON.parse(fs.readFileSync(saved, "utf8"));
  expect(output.project.layers[0].children[0]).toEqual(
    wire.project.layers[0].children[0],
  );
  expect(output.project.parameterBindings).toEqual(wire.project.parameterBindings);
  expect(output.atlases).toEqual(wire.atlases);
});

test("v11 ordinary open / entry edit / save / Undo retains full atlas authority", async ({
  app,
  window,
}) => {
  // CDP Runtime.evaluate defaults to bypassing CSP for eval. Explicitly disable
  // that debugger privilege so this measures the production document policy.
  const cdp = await window.context().newCDPSession(window);
  const evalResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => { try { Function("return 1")(); return "unexpectedly-allowed"; } catch (error) { return error instanceof EvalError ? "blocked" : "other-failure"; } })()`,
    allowUnsafeEvalBlockedByCSP: false,
    returnByValue: true,
  });
  await cdp.detach();
  expect(evalResult.result.value).toBe("blocked");
  const source = v11Fixture(),
    sourcePath = path.join(tmpDir, "original-v11.vivi"),
    savedPath = path.join(tmpDir, "edited-v11.vivi");
  const original = JSON.stringify(source);
  fs.writeFileSync(sourcePath, original);
  await mockOpenVivi(app, sourcePath);
  await clickFileMenuItem(window, "開く");
  await expect(window.locator(".project-name")).toHaveText("Atlas round trip");
  await selectLayer(window, "Atlas mesh");
  await window.getByRole("spinbutton", { name: "v11 x", exact: true }).fill("1");
  await window
    .getByRole("button", { name: "エントリを適用（atlas空間UVを保持）", exact: true })
    .click();
  await mockSaveDialog(app, savedPath);
  await clickFileMenuItem(window, "別名で保存");
  await expect.poll(() => fs.existsSync(savedPath)).toBe(true);
  const saved = JSON.parse(fs.readFileSync(savedPath, "utf8"));
  expect(saved.version).toBe(11);
  expect(saved.documentId).toBe(source.documentId);
  expect(
    saved.atlases.map((atlas: { id: string; image: string }) => [atlas.id, atlas.image]),
  ).toEqual(
    source.atlases.map((atlas: { id: string; image: string }) => [atlas.id, atlas.image]),
  );
  expect(saved.atlases[0].entries[0].x).toBe(1);
  expect(saved.project.layers[0].children[2].mesh.uvs[0]).toBe(-0.25);
  expect(fs.readFileSync(sourcePath, "utf8")).toBe(original);
  await window.keyboard.press("Control+z");
  await expect(
    window.getByRole("spinbutton", { name: "v11 x", exact: true }),
  ).toHaveValue("0");
  await clickFileMenuItem(window, "保存");
  await expect
    .poll(() => JSON.parse(fs.readFileSync(savedPath, "utf8")).atlases[0].entries[0].x)
    .toBe(0);
  await closeAndVerify(window);
  await mockOpenVivi(app, savedPath);
  await clickFileMenuItem(window, "開く");
  await expect(window.locator(".project-name")).toHaveText("Atlas round trip");
  await selectLayer(window, "Atlas mesh");
  await expect(
    window.getByRole("spinbutton", { name: "v11 x", exact: true }),
  ).toHaveValue("0");
});

test("v11 chosen replacement detaches only its shared entry and Undo restores it", async ({
  app,
  window,
}) => {
  const source = v11Fixture(),
    sourcePath = path.join(tmpDir, "shared-v11.vivi"),
    savedPath = path.join(tmpDir, "detached-v11.vivi");
  const replacement = projectV11Manifest.pngCases.find(
    (entry) => entry.id === "frozen-palette-trns",
  )!;
  const pngPath = path.join(tmpDir, "replacement.png");
  fs.writeFileSync(sourcePath, JSON.stringify(source));
  fs.writeFileSync(pngPath, Buffer.from(replacement.base64, "base64"));
  await mockOpenVivi(app, sourcePath);
  await clickFileMenuItem(window, "開く");
  await expect(window.locator(".project-name")).toHaveText("Atlas round trip");
  await selectLayer(window, "Atlas neighbour");
  await mockOpenPng(app, pngPath);
  await clickFileMenuItem(window, "差替えPNGを選択（共有atlasから分離）");
  await expect
    .poll(() =>
      window.evaluate(
        () =>
          (window.__vivi2d as any).useEditorStore.getState().projectV11?.revision.atlases
            .length,
      ),
    )
    .toBe(3);
  await mockSaveDialog(app, savedPath);
  await clickFileMenuItem(window, "別名で保存");
  await expect.poll(() => fs.existsSync(savedPath)).toBe(true);
  const saved = JSON.parse(fs.readFileSync(savedPath, "utf8"));
  expect(saved.atlases[0].image).toBe(source.atlases[0].image);
  expect(saved.atlases[0].entries).toEqual([source.atlases[0].entries[0]]);
  expect(saved.atlases[2].image).toBe(replacement.base64);
  expect(saved.atlases[2].id).not.toBe(source.atlases[0].id);
  expect(saved.project.layers[0].children[2].mesh.uvs[0]).toBe(-1.5);
  await window.keyboard.press("Control+z");
  await expect
    .poll(() =>
      window.evaluate(
        () =>
          (window.__vivi2d as any).useEditorStore.getState().projectV11?.revision.atlases
            .length,
      ),
    )
    .toBe(2);
  await clickFileMenuItem(window, "保存");
  await expect
    .poll(() => JSON.parse(fs.readFileSync(savedPath, "utf8")).atlases.length)
    .toBe(2);
  expect(JSON.parse(fs.readFileSync(savedPath, "utf8")).atlases).toEqual(source.atlases);
});

test("v11 real-file malformed UTF-8 never replaces the incumbent document", async ({
  app,
  window,
}) => {
  const source = v11Fixture(),
    goodPath = path.join(tmpDir, "valid-utf8.vivi"),
    badPath = path.join(tmpDir, "invalid-utf8.vivi");
  const sourceBytes = Buffer.from(JSON.stringify(source));
  fs.writeFileSync(goodPath, sourceBytes);
  const offset = sourceBytes.indexOf("Atlas round trip");
  expect(offset).toBeGreaterThan(0);
  sourceBytes[offset] = 0xff;
  fs.writeFileSync(badPath, sourceBytes);
  await mockOpenVivi(app, goodPath);
  await clickFileMenuItem(window, "開く");
  await expect(window.locator(".project-name")).toHaveText("Atlas round trip");
  const before = await window.evaluate(() => {
    const state = (window.__vivi2d as any).useEditorStore.getState();
    return {
      project: JSON.stringify(state.project),
      version: state.projectVersion,
      path: state.currentFilePath,
    };
  });
  await mockOpenVivi(app, badPath);
  await clickFileMenuItem(window, "開く");
  await expect(
    window.getByRole("alert").filter({ hasText: "プロジェクトの読み込みに失敗しました" }),
  ).toBeVisible();
  expect(
    await window.evaluate(() => {
      const state = (window.__vivi2d as any).useEditorStore.getState();
      return {
        project: JSON.stringify(state.project),
        version: state.projectVersion,
        path: state.currentFilePath,
      };
    }),
  ).toEqual(before);
});

test("v11 explicit legacy copy and fork preserve source identity and reject original/current aliases", async ({
  app,
  window,
}) => {
  // Unchanged shared corpus: the ordinary loader must fill omitted runtime
  // defaults without inventing a Scene 1 for a declared v9 document.
  const legacy = projectV11Manifest.documents.find(
    (entry) => entry.id === "core-v9-migration",
  )!.inputUtf8;
  const originalPath = path.join(tmpDir, "legacy.vivi"),
    copyPath = path.join(tmpDir, "copy.vivi"),
    saveAsPath = path.join(tmpDir, "save-as.vivi"),
    forkPath = path.join(tmpDir, "fork.vivi");
  fs.writeFileSync(originalPath, legacy);
  await mockOpenVivi(app, originalPath);
  await clickFileMenuItem(window, "開く");
  await expect(window.locator(".project-name")).toHaveText("Synthetic shared core");
  expect(
    await window.evaluate(() => {
      const state = (window.__vivi2d as any).useEditorStore.getState();
      return {
        hasSourceKind: Object.hasOwn(state.project, "sourceKind"),
        uiSourceKind: state.projectSourceKind,
      };
    }),
  ).toEqual({ hasSourceKind: false, uiSourceKind: "vivi" });
  await mockSaveDialog(app, copyPath);
  await clickFileMenuItem(window, "v11コピーを保存（対応プロファイル）");
  await expect.poll(() => fs.existsSync(copyPath)).toBe(true);
  const copied = fs.readFileSync(copyPath, "utf8"),
    documentId = JSON.parse(copied).documentId;
  expect(JSON.parse(copied).version).toBe(11);
  expect(documentId).toMatch(/^[0-9a-f-]{36}$/);
  expect(fs.readFileSync(originalPath, "utf8")).toBe(legacy);
  await mockSaveDialog(app, saveAsPath);
  await clickFileMenuItem(window, "別名で保存");
  await expect.poll(() => fs.existsSync(saveAsPath)).toBe(true);
  const saved = fs.readFileSync(saveAsPath, "utf8");
  for (const target of [copyPath, saveAsPath]) {
    await mockSaveDialog(app, target);
    await clickFileMenuItem(window, "開いた時点のv11原本を複製");
    await expect(
      window
        .getByRole("alert")
        .filter({ hasText: "プロジェクトの保存に失敗しました" })
        .last(),
    ).toBeVisible();
    expect(fs.readFileSync(copyPath, "utf8")).toBe(copied);
    expect(fs.readFileSync(saveAsPath, "utf8")).toBe(saved);
  }
  await mockSaveDialog(app, forkPath);
  await clickFileMenuItem(window, "v11を分岐して保存（新しい文書ID）");
  await expect.poll(() => fs.existsSync(forkPath)).toBe(true);
  const forked = JSON.parse(fs.readFileSync(forkPath, "utf8"));
  expect(forked.documentId).not.toBe(documentId);
  expect(forked.atlases).toEqual(JSON.parse(copied).atlases);
  expect(fs.readFileSync(originalPath, "utf8")).toBe(legacy);
});

test("v11 real device resource rejection occurs before Project and history publication", async ({
  app,
  window,
}) => {
  const source = v11Fixture(),
    good = path.join(tmpDir, "good.vivi"),
    oversized = path.join(tmpDir, "oversized-mask.vivi"),
    saved = path.join(tmpDir, "incumbent.vivi");
  fs.writeFileSync(good, JSON.stringify(source));
  await mockOpenVivi(app, good);
  await clickFileMenuItem(window, "開く");
  await expect(window.locator(".project-name")).toHaveText("Atlas round trip");
  await selectLayer(window, "Atlas mesh");
  await window.getByRole("spinbutton", { name: "v11 x", exact: true }).fill("1");
  await window
    .getByRole("button", { name: "エントリを適用（atlas空間UVを保持）", exact: true })
    .click();
  const before = await window.evaluate(() => {
    const state = (window.__vivi2d as any).useEditorStore.getState();
    return {
      project: JSON.stringify(state.project),
      version: state.projectVersion,
      structure: state.projectStructureVersion,
      path: state.currentFilePath,
    };
  });
  const rejected = structuredClone(source);
  rejected.project.name = "Must not publish";
  rejected.project.layers[0].children[1].clipMaskIds = ["neighbour"];
  rejected.project.layers[0].children[2].mesh.vertices =
    rejected.project.layers[0].children[2].mesh.vertices.map(
      (value: number) => value * 1_000_000,
    );
  fs.writeFileSync(oversized, JSON.stringify(rejected));
  await mockOpenVivi(app, oversized);
  await clickFileMenuItem(window, "開く");
  await expect(
    window.getByRole("alert").filter({ hasText: "プロジェクトの読み込みに失敗しました" }),
  ).toBeVisible();
  expect(
    await window.evaluate(() => {
      const state = (window.__vivi2d as any).useEditorStore.getState();
      return {
        project: JSON.stringify(state.project),
        version: state.projectVersion,
        structure: state.projectStructureVersion,
        path: state.currentFilePath,
      };
    }),
  ).toEqual(before);
  // The authored geometry now fits. Only the captured default binding exceeds
  // the actual device cap, so accepting this would miss pre-publication projection.
  const cap = await window.evaluate(() => {
    const canvas = document.querySelector(
      ".canvas-container canvas",
    ) as HTMLCanvasElement;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) throw Error("Actual WebGL device required");
    return gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  });
  const defaultBound = boundMaskFixture();
  defaultBound.project.name = "Bound candidate must not publish";
  defaultBound.project.parameters[0].defaultValue = 1;
  defaultBound.project.parameterBindings[0].target.property = "scaleX";
  defaultBound.project.parameterBindings[0].bindingPoints = [
    { paramValue: 0, targetValue: 1 },
    { paramValue: 1, targetValue: cap },
  ];
  const defaultBoundPath = path.join(tmpDir, "default-bound-limit.vivi");
  fs.writeFileSync(defaultBoundPath, JSON.stringify(defaultBound));
  const failures = window
    .getByRole("alert")
    .filter({ hasText: "プロジェクトの読み込みに失敗しました" });
  const failureCount = await failures.count();
  await mockOpenVivi(app, defaultBoundPath);
  await clickFileMenuItem(window, "開く");
  await expect(failures).toHaveCount(failureCount + 1);
  expect(
    await window.evaluate(() => {
      const state = (window.__vivi2d as any).useEditorStore.getState();
      return {
        project: JSON.stringify(state.project),
        version: state.projectVersion,
        structure: state.projectStructureVersion,
        path: state.currentFilePath,
      };
    }),
  ).toEqual(before);
  await window.keyboard.press("Control+z");
  await expect(
    window.getByRole("spinbutton", { name: "v11 x", exact: true }),
  ).toHaveValue("0");
  await mockSaveDialog(app, saved);
  await clickFileMenuItem(window, "別名で保存");
  await expect.poll(() => fs.existsSync(saved)).toBe(true);
  expect(JSON.parse(fs.readFileSync(saved, "utf8")).atlases).toEqual(source.atlases);
});

test("v11 copy never strips authored legacy fields and malformed config cannot replace the incumbent", async ({
  app,
  window,
}) => {
  const source = JSON.parse(
    projectV11Manifest.documents.find((entry) => entry.id === "core-v9-migration")!
      .inputUtf8,
  );
  const inert = JSON.parse(projectV11Manifest.documents[0]!.inputUtf8).project
    .lipsyncConfig;
  const readState = () =>
    window.evaluate(() => {
      const api = window.__vivi2d as any,
        state = api.useEditorStore.getState();
      return {
        project: JSON.stringify(state.project),
        path: state.currentFilePath,
        version: state.projectVersion,
        undo: api.useHistoryStore.getState().undoStack.length,
      };
    });
  for (const [index, fields] of [
    { sourceKind: "vivi" },
    {
      scenes: [{ id: "authored-scene", name: "Keep scene", clips: [] }],
      lipsyncConfig: { ...inert, gain: 3 },
    },
  ].entries()) {
    const authored = structuredClone(source);
    Object.assign(authored.project, fields);
    const sourcePath = path.join(tmpDir, `authored-${index}.vivi`),
      rejectedCopy = path.join(tmpDir, `must-not-strip-${index}.vivi`);
    fs.writeFileSync(sourcePath, JSON.stringify(authored));
    await mockOpenVivi(app, sourcePath);
    await clickFileMenuItem(window, "開く");
    await expect.poll(async () => (await readState()).path).toBe(sourcePath);
    const before = await readState();
    expect(JSON.parse(before.project)).toMatchObject(fields);
    const failures = window
      .getByRole("alert")
      .filter({ hasText: "プロジェクトの保存に失敗しました" });
    const count = await failures.count();
    await mockSaveDialog(app, rejectedCopy);
    await clickFileMenuItem(window, "v11コピーを保存（対応プロファイル）");
    await expect(failures).toHaveCount(count + 1);
    expect(fs.existsSync(rejectedCopy)).toBe(false);
    expect(await readState()).toEqual(before);
    expect(JSON.parse(fs.readFileSync(sourcePath, "utf8"))).toEqual(authored);
  }
  const before = await readState();
  for (const [index, config] of [null, { ...inert, enabled: "true" }].entries()) {
    const invalid = structuredClone(source);
    invalid.project.lipsyncConfig = config;
    const rejectedPath = path.join(tmpDir, `malformed-lip-${index}.vivi`);
    fs.writeFileSync(rejectedPath, JSON.stringify(invalid));
    const failures = window
      .getByRole("alert")
      .filter({ hasText: "プロジェクトの読み込みに失敗しました" });
    const count = await failures.count();
    await mockOpenVivi(app, rejectedPath);
    await clickFileMenuItem(window, "開く");
    await expect(failures).toHaveCount(count + 1);
    expect(await readState()).toEqual(before);
  }
});
