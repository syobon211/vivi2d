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

function getFileMenuFallbackIndex(itemText: string): number | undefined {
  if (/Import PSD|PSD\u3092\u30a4\u30f3\u30dd\u30fc\u30c8/.test(itemText)) return 0;
  if (/Open Image|\u753b\u50cf\u3092\u958b\u304f/.test(itemText)) return 1;
  if (
    /Import Image As Layer|\u753b\u50cf\u3092\u30ec\u30a4\u30e4\u30fc\u3068\u3057\u3066\u8ffd\u52a0/.test(
      itemText,
    )
  )
    return 2;
  if (
    /Import Images As Layers|\u8907\u6570\u753b\u50cf\u3092\u30ec\u30a4\u30e4\u30fc\u3068\u3057\u3066\u8ffd\u52a0/.test(
      itemText,
    )
  )
    return 3;
  if (
    /Import Folder As Layers|\u30d5\u30a9\u30eb\u30c0\u3092\u30ec\u30a4\u30e4\u30fc\u3068\u3057\u3066\u8ffd\u52a0/.test(
      itemText,
    )
  )
    return 4;
  if (/Split PNG Into Layers|PNG.*\u30ec\u30a4\u30e4\u30fc/.test(itemText)) return 5;
  if (/^Open$|\u958b\u304f/.test(itemText)) return 6;
  if (
    /Import \.vivid|\.vivid.*Import|\.vivid \u3092\u30a4\u30f3\u30dd\u30fc\u30c8/.test(
      itemText,
    )
  )
    return 7;
  if (/^Save$|\u4fdd\u5b58/.test(itemText)) return 8;
  if (
    /^Save As$|^Save as$|^Save project as$|\u5225\u540d\u3067\u4fdd\u5b58|\u540d\u524d\u3092\u4ed8\u3051\u3066\u4fdd\u5b58/.test(
      itemText,
    )
  ) {
    return 9;
  }
  if (/SDK Export|Export SDK|SDK\u30a8\u30af\u30b9\u30dd\u30fc\u30c8/.test(itemText))
    return 10;
  if (/Media Output|\u30e1\u30c7\u30a3\u30a2\u51fa\u529b/.test(itemText)) return 11;
  if (/Blender \(\.glb\)/.test(itemText)) return 12;
  if (
    /Reimport Image Layer|\u753b\u50cf\u30ec\u30a4\u30e4\u30fc\u3092\u518d\u8aad\u8fbc/.test(
      itemText,
    )
  )
    return 13;
  if (/Reimport PSD|PSD\u518d\u8aad\u8fbc/.test(itemText)) return 14;
  if (
    /Export as \.vivid|\.vivid \u3067\u30a8\u30af\u30b9\u30dd\u30fc\u30c8/.test(itemText)
  )
    return 15;
  if (/^Validate$|\u691c\u8a3c/.test(itemText)) return 16;
  if (/Auto Setup|\u81ea\u52d5\u30bb\u30c3\u30c8\u30a2\u30c3\u30d7/.test(itemText))
    return 17;
  if (/^Close$|\u9589\u3058\u308b/.test(itemText)) return 18;
  return undefined;
}

export async function clickFileMenuItem(window: Page, itemText: string) {
  const trigger = await resolveMenuTrigger(window, /File/, 0);
  const panel = await openDropdownPanelByTrigger(window, trigger);
  const aliasesByLabel: Record<string, Array<string | RegExp>> = {
    Open: [/^Open$|^開く$/],
    Save: [/^Save$|^保存$/],
    Close: [/^Close$|^閉じる$/],
    "Auto Setup": [/Auto Setup|自動セットアップ/],
    "Reimport Image Layer": [/Reimport Image Layer|画像レイヤーを再読込/],
    "Reimport PSD": [/Reimport PSD|PSD再読込/],
  };
  aliasesByLabel.Validate = [/^Validate$|^検証$|^讀懆ｨｼ$/];
  const aliases = aliasesByLabel[itemText];
  if (aliases && (await clickDropdownItemByAliases(panel, aliases))) {
    return;
  }
  const fallbackIndex = getFileMenuFallbackIndex(itemText);
  const commonFallbacks: Record<string, number> = {
    "PSD\u3092\u30a4\u30f3\u30dd\u30fc\u30c8": 0,
    "\u753b\u50cf\u3092\u958b\u304f...": 1,
    "\u753b\u50cf\u3092\u30ec\u30a4\u30e4\u30fc\u3068\u3057\u3066\u8ffd\u52a0...": 2,
    "\u8907\u6570\u753b\u50cf\u3092\u30ec\u30a4\u30e4\u30fc\u3068\u3057\u3066\u8ffd\u52a0...": 3,
    "\u30d5\u30a9\u30eb\u30c0\u3092\u30ec\u30a4\u30e4\u30fc\u3068\u3057\u3066\u8ffd\u52a0...": 4,
    "\u958b\u304f": 6,
    "Import .vivid": 7,
    ".vivid \u3092\u30a4\u30f3\u30dd\u30fc\u30c8": 7,
    "\u4fdd\u5b58": 8,
    "\u5225\u540d\u3067\u4fdd\u5b58": 9,
    "\u540d\u524d\u3092\u4ed8\u3051\u3066\u4fdd\u5b58": 9,
    "SDK\u30a8\u30af\u30b9\u30dd\u30fc\u30c8": 10,
    "\u30e1\u30c7\u30a3\u30a2\u51fa\u529b": 11,
    "\u753b\u50cf\u30ec\u30a4\u30e4\u30fc\u3092\u518d\u8aad\u8fbc": 13,
    "PSD\u518d\u8aad\u8fbc": 14,
    ".vivid \u3067\u30a8\u30af\u30b9\u30dd\u30fc\u30c8": 15,
    "\u691c\u8a3c": 16,
    "\u81ea\u52d5\u30bb\u30c3\u30c8\u30a2\u30c3\u30d7": 17,
    "\u9589\u3058\u308b": 18,
  };
  await clickDropdownItemByTextOrIndex(panel, itemText, {
    ...commonFallbacks,
    ...(fallbackIndex === undefined ? {} : { [itemText]: fallbackIndex }),
  });
}

export async function clickIntegrationsMenuItem(window: Page, itemText: string) {
  const trigger = await resolveMenuTrigger(window, /Integrations|外部連携/, 3);
  const panel = await openDropdownPanelByTrigger(window, trigger);
  const aliasesByLabel: Record<string, Array<string | RegExp>> = {
    "Automatic Model Generation": [
      /Generate Model|Automatic Model Generation|自動モデル生成|モデル生成/,
    ],
    "ComfyUI Settings": [/ComfyUI Settings|ComfyUI 設定/],
    "OBS Settings": [/Settings\.\.\.|設定\.\.\./],
    "VTS Settings": [/Settings\.\.\.|設定\.\.\./],
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
    const values = await addTrackSelect.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).value),
    );
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
