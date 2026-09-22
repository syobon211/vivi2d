import { expect } from "@playwright/test";
import type { Page } from "playwright";

async function openDropdownPanelByTrigger(
  _window: Page,
  trigger: ReturnType<Page["locator"]>,
) {
  const panel = trigger.locator("..").locator(".menu-dropdown-panel");

  if (await panel.isVisible().catch(() => false)) {
    await trigger.click();
    await expect(panel).not.toBeVisible({ timeout: 2_000 });
  }

  await trigger.click();
  await expect(panel).toBeVisible({ timeout: 3_000 });
  return panel;
}

async function resolveMenuTrigger(window: Page, pattern: RegExp, fallbackIndex: number) {
  const localized = window.locator(".menu-dropdown-trigger", { hasText: pattern });
  if ((await localized.count()) > 0) {
    return localized.first();
  }
  return window.locator(".menu-dropdown-trigger").nth(fallbackIndex);
}

async function clickDropdownItemByTextOrIndex(
  panel: ReturnType<Page["locator"]>,
  itemText: string,
  fallbackIndexByLabel: Record<string, number>,
) {
  const exact = panel.getByRole("menuitem", { name: itemText, exact: true });
  if ((await exact.count()) > 0) {
    await exact.first().click();
    return;
  }

  const partial = panel.locator(".menu-dropdown-item", { hasText: itemText });
  if ((await partial.count()) > 0) {
    await partial.first().click();
    return;
  }

  const fallbackIndex = fallbackIndexByLabel[itemText];
  if (fallbackIndex !== undefined) {
    await panel.locator(".menu-dropdown-item").nth(fallbackIndex).click();
    return;
  }

  throw new Error(`Menu item not found: ${itemText}`);
}

async function clickDropdownItemByAliases(
  panel: ReturnType<Page["locator"]>,
  aliases: Array<string | RegExp>,
) {
  for (const alias of aliases) {
    const locator =
      typeof alias === "string"
        ? panel.getByRole("menuitem", { name: alias, exact: true })
        : panel.locator(".menu-dropdown-item").filter({ hasText: alias });
    if ((await locator.count()) > 0) {
      await locator.first().click();
      return true;
    }
  }
  return false;
}

const fileMenuAliases: ReadonlyArray<readonly string[]> = [
  ["Import PSD", "PSDをインポート"],
  ["Open Image...", "画像を開く..."],
  ["Import Image As Layer...", "画像をレイヤーとして追加..."],
  ["Import Images As Layers...", "複数画像をレイヤーとして追加..."],
  ["Import Folder As Layers...", "フォルダをレイヤーとして追加..."],
  ["Split PNG Into Layers...", "PNG をレイヤー分割..."],
  ["Open", "開く"],
  ["Import .vivid", ".vivid をインポート"],
  ["Save", "保存"],
  ["Save As", "Save as", "Save project as", "別名で保存", "名前を付けて保存"],
  ["Save v11 copy (supported profile)", "v11コピーを保存（対応プロファイル）"],
  ["Save v11 fork (new document identity)", "v11を分岐して保存（新しい文書ID）"],
  ["Duplicate originally opened v11 file", "開いた時点のv11原本を複製"],
  ["Remove unused v11 images (undoable)", "未使用のv11画像を削除（Undo可）"],
  [
    "Choose replacement PNG (detach shared atlas)",
    "差替えPNGを選択（共有atlasから分離）",
  ],
  ["SDK Export", "Export SDK", "SDKエクスポート"],
  ["Media Output", "メディア出力"],
  ["Blender (.glb)"],
  ["Reimport Image Layer", "画像レイヤーを再読込"],
  ["Reimport PSD", "PSD再読込"],
  ["Export as .vivid", ".vivid でエクスポート"],
  ["Validate", "検証"],
  ["Auto Setup", "自動セットアップ"],
  ["Close", "閉じる"],
];

export async function clickFileMenuItem(window: Page, itemText: string) {
  const trigger = window.locator(".menu-dropdown-trigger").filter({
    hasText: /^(?:File|ファイル)\s*▾$/,
  });
  await expect(trigger).toHaveCount(1);
  const panel = await openDropdownPanelByTrigger(window, trigger);
  const aliases = fileMenuAliases.find((labels) => labels.includes(itemText)) ?? [
    itemText,
  ];
  const name = new RegExp(
    `^(?:${aliases.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`,
  );
  const item = panel.getByRole("menuitem", { name });
  await expect(item).toHaveCount(1);
  await item.click();
}

export async function clickIntegrationsMenuItem(window: Page, itemText: string) {
  const trigger = await resolveMenuTrigger(window, /Integrations|外部連携/, 3);
  const panel = await openDropdownPanelByTrigger(window, trigger);
  const aliasesByLabel: Record<string, Array<string | RegExp>> = {
    "Automatic Model Generation": [
      /Generate Model|Automatic Model Generation|自動モデル生成|モデル生成/,
    ],
    "ComfyUI Settings": [/ComfyUI Settings|ComfyUI 設定/],
  };
  const aliases = aliasesByLabel[itemText];
  if (aliases && (await clickDropdownItemByAliases(panel, aliases))) {
    return;
  }
  throw new Error(`Integrations menu item not found: ${itemText}`);
}

export async function clickViewMenuItem(window: Page, itemText: string) {
  const trigger = await resolveMenuTrigger(window, /View/, 1);
  const panel = await openDropdownPanelByTrigger(window, trigger);
  await clickDropdownItemByTextOrIndex(panel, itemText, {
    "Form Lock": 0,
    "Onion Skin": 1,
    "Split View": 2,
    Reset: 3,
    "\u30d5\u30a9\u30fc\u30e0\u30ed\u30c3\u30af": 0,
    "\u30aa\u30cb\u30aa\u30f3\u30b9\u30ad\u30f3": 1,
    "\u5206\u5272\u8868\u793a": 2,
    "\u30ea\u30bb\u30c3\u30c8": 3,
  });
}

export async function clickSettingsMenuItem(window: Page, itemText: string) {
  const trigger = await resolveMenuTrigger(window, /Settings/, 2);
  const panel = await openDropdownPanelByTrigger(window, trigger);
  await clickDropdownItemByTextOrIndex(panel, itemText, {
    Shortcuts: 1,
    "Shortcut Settings": 1,
    "\u30b7\u30e7\u30fc\u30c8\u30ab\u30c3\u30c8\u8a2d\u5b9a": 1,
    Light: 2,
    Dark: 2,
    English: 3,
    Japanese: 4,
    EN: 3,
    JP: 4,
  });
}

export async function selectLayer(window: Page, layerName: string) {
  let layer = window.locator(".layer-item", { hasText: layerName });
  if ((await layer.count()) === 0 && /Bone|\u30dc\u30fc\u30f3/.test(layerName)) {
    layer = window.locator(".layer-item", { hasText: /\u30dc\u30fc\u30f3|Bone/ }).first();
  }
  const target = layer.first();
  await target.scrollIntoViewIfNeeded();
  const rowLabel = target.locator(".layer-name");
  if ((await rowLabel.count()) > 0) {
    await rowLabel.first().click();
  } else {
    await target.click();
  }
  await expect(target).toHaveAttribute("aria-selected", "true");
  return target;
}

export async function rightClickLayer(window: Page, layerName: string) {
  let layer = window.locator(".layer-item", { hasText: layerName });
  if ((await layer.count()) === 0 && /Bone|\u30dc\u30fc\u30f3/.test(layerName)) {
    layer = window.locator(".layer-item", { hasText: /\u30dc\u30fc\u30f3|Bone/ }).first();
  }
  const target = layer.first();
  const rowLabel = target.locator(".layer-name");
  if ((await rowLabel.count()) > 0) {
    await rowLabel.first().click({ button: "right" });
  } else {
    await target.click({ button: "right" });
  }
  await expect(window.locator(".context-menu")).toBeVisible();
}

export async function clickContextMenuItem(window: Page, itemText: string) {
  const aliases: Array<string | RegExp> = (() => {
    switch (itemText) {
      case "Art Path":
      case "Add Art Path":
      case "\u30a2\u30fc\u30c8\u30d1\u30b9\u8ffd\u52a0":
        return [/Add Art Path|Art Path|\u30a2\u30fc\u30c8\u30d1\u30b9/];
      case "Delete":
      case "\u524a\u9664":
        return [/Delete|\u524a\u9664/];
      default:
        return [itemText];
    }
  })();

  for (const alias of aliases) {
    const locator =
      typeof alias === "string"
        ? window.locator(".context-menu-item", { hasText: alias })
        : window.locator(".context-menu-item").filter({ hasText: alias });
    if ((await locator.count()) > 0) {
      await locator.first().click();
      return;
    }
  }

  throw new Error(`Context menu item not found: ${itemText}`);
}

export async function addBone(window: Page, layerName: string) {
  await window.evaluate((targetLayerName) => {
    const vivi = window.__vivi2d as any;
    if (!vivi) throw new Error("Vivi2D bridge is unavailable");

    const project = vivi.useEditorStore.getState().project;
    if (!project) throw new Error("Project is unavailable");

    const findLayerByName = (layers: any[]): any => {
      for (const layer of layers) {
        if (layer.name === targetLayerName) return layer;
        if (layer.children?.length) {
          const found = findLayerByName(layer.children);
          if (found) return found;
        }
      }
      return null;
    };

    const layer = findLayerByName(project.layers);
    if (!layer) throw new Error(`Layer not found: ${targetLayerName}`);

    const rootBoneCount = project.layers.filter(
      (candidate: any) => candidate.kind === "bone",
    ).length;
    const x = Number.isFinite(layer.x) ? layer.x + (layer.width ?? 0) / 2 : 0;
    const y = Number.isFinite(layer.y) ? layer.y + (layer.height ?? 0) / 2 : 0;
    const nextBoneName = rootBoneCount === 0 ? "ボーン" : `ボーン ${rootBoneCount + 1}`;
    vivi.useBoneStore.getState().addBone(layer.id, nextBoneName, x, y);
  }, layerName);

  await expect(
    window.locator(".layer-item", { hasText: /\u30dc\u30fc\u30f3|Bone/ }).first(),
  ).toBeVisible();
}

export async function createScene(window: Page) {
  const sceneButton = window.getByTitle(/New Scene/);
  if ((await sceneButton.count()) > 0) {
    await sceneButton.click();
  } else {
    await window.locator(".tl-scene-selector .tl-btn").first().click();
  }
  await expect(window.locator(".tl-scene-select")).toHaveValue(/.+/);
}

export async function createClip(window: Page) {
  const clipButton = window.getByTitle(/New Clip/);
  if ((await clipButton.count()) > 0) {
    await clipButton.click();
  } else {
    const plusButton = window.locator(".timeline-clip-selector .tl-btn", {
      hasText: /^\+$/,
    });
    if ((await plusButton.count()) > 0) {
      await plusButton.first().click();
    } else {
      await window.locator(".timeline-clip-selector .tl-btn").last().click();
    }
  }
  await expect(window.locator(".tl-clip-select")).toHaveValue(/.+/);
}

export async function createSceneAndClip(window: Page) {
  await createScene(window);
  await createClip(window);
}

export async function addParameter(window: Page, name: string) {
  await window.evaluate((parameterName) => {
    const vivi = window.__vivi2d as any;
    if (!vivi) throw new Error("Vivi2D bridge is unavailable");

    const definitionStore = vivi.useParameterDefinitionStore;
    const parameterStore = vivi.useParameterStore;
    definitionStore.getState().addParameter(parameterName, -30, 30, 0);

    const project = vivi.useEditorStore.getState().project;
    const added = project?.parameters?.[project.parameters.length - 1];
    if (added) {
      parameterStore.getState().setParameterValue(added.id, added.defaultValue);
    }
  }, name);

  await expect(window.locator(".parameter-name", { hasText: name })).toBeVisible();
}

export async function addTrack(window: Page, label: string) {
  const addTrackSelect = window.locator(".tl-add-track-select");
  const options = await addTrackSelect.locator("option").allTextContents();
  if (options.includes(label)) {
    await addTrackSelect.selectOption({ label });
    return;
  }
  if (label === "Bone 1:Angle") {
    const fallback = options.find((option) => /:Angle$/.test(option));
    if (fallback) {
      await addTrackSelect.selectOption({ label: fallback });
      return;
    }
    const values = await addTrackSelect
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
    const angleValue = values.find((value) => /^bone:.+:angle$/.test(value));
    if (angleValue) {
      await addTrackSelect.selectOption(angleValue);
      return;
    }
  }
  throw new Error(`Track option not found: ${label}`);
}

export async function bindAllBones(window: Page) {
  await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    if (!vivi) throw new Error("Vivi2D bridge is unavailable");

    const project = vivi.useEditorStore.getState().project;
    const selectedLayerId = vivi.useSelectionStore.getState().selectedLayerId;
    if (!project || !selectedLayerId) {
      throw new Error("Project or selected layer is unavailable");
    }

    const boneIds: string[] = [];
    const walk = (layers: any[]) => {
      for (const layer of layers) {
        if (layer.kind === "bone") boneIds.push(layer.id);
        if (layer.children?.length) walk(layer.children);
      }
    };
    walk(project.layers);
    if (boneIds.length === 0) {
      throw new Error("No bones are available");
    }

    vivi.useSkinStore.getState().bindSkin(selectedLayerId, boneIds);
  });
  await expect(window.locator(".prop-bone-tag").first()).toBeVisible();
}
