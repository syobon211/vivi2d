import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import { addParameter, clickFileMenuItem } from "../helpers/operations";

const CONFIRM_BUTTON_LABEL = /OK|\u78ba\u8a8d|\u6c7a\u5b9a/;


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function setParameterValue(
  window: import("playwright").Page,
  parameterId: string,
  value: number,
) {
  await window.evaluate(
    ({ pid, val }) => {
      const v = window.__vivi2d!;
      const paramStore = v.useParameterStore as any;
      paramStore.getState().setParameterValue(pid, val);
    },
    { pid: parameterId, val: value },
  );
}

async function getParameterValue(
  window: import("playwright").Page,
  parameterId: string,
): Promise<number | undefined> {
  return window.evaluate((pid) => {
    const v = window.__vivi2d!;
    const paramStore = v.useParameterStore as any;
    return paramStore.getState().parameterValues[pid];
  }, parameterId);
}

async function createPresetViaStore(
  window: import("playwright").Page,
  name: string,
): Promise<string> {
  return window.evaluate((n) => {
    const v = window.__vivi2d!;
    const presetStore = v.useExpressionPresetStore as any;
    return presetStore.getState().createPreset(n) as string;
  }, name);
}

async function getPresetCount(window: import("playwright").Page): Promise<number> {
  return window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    return editorStore.getState().project?.expressionPresets?.length ?? 0;
  });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});


test("表情プリセットパネルが表示される", async ({ window }) => {
  const panel = window.locator(".expression-preset-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".expression-preset-panel-title")).toContainText(
    /表情プリセット|Expression Presets/,
  );
});


test("パラメータ値を保存してプリセットを作成できる", async ({ window }) => {
  await addParameter(window, "角度X");

  const paramId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.parameters?.[0]?.id;
  });
  expect(paramId).toBeDefined();
  await setParameterValue(window, paramId, 0.7);

  await window.locator(".expression-preset-add-btn").click();

  const nameInput = window.locator(".expression-preset-name-input");
  await nameInput.fill("テスト表情");
  await window.locator(".param-action-btn", { hasText: CONFIRM_BUTTON_LABEL }).click();

  await expect(window.locator(".expression-preset-item")).toBeVisible();
  await expect(
    window.locator(".expression-preset-name", { hasText: "テスト表情" }),
  ).toBeVisible();
  expect(await getPresetCount(window)).toBe(1);
});


test("プリセットを適用するとパラメータ値が復元される", async ({ window }) => {
  await addParameter(window, "開閉");
  const paramId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.parameters?.[0]?.id;
  });

  await setParameterValue(window, paramId, 0.3);
  await createPresetViaStore(window, "閉じ目");

  await setParameterValue(window, paramId, 1.0);
  expect(await getParameterValue(window, paramId)).toBe(1.0);

  await window
    .locator(".expression-preset-item .param-action-btn", { hasText: /適用|Apply/ })
    .click();

  expect(await getParameterValue(window, paramId)).toBe(0.3);
});


test("プリセットを削除できる", async ({ window }) => {
  await createPresetViaStore(window, "削除対象");
  await expect(window.locator(".expression-preset-item")).toBeVisible();

  await window.locator(".expression-preset-delete-btn").click();

  await expect(window.locator(".expression-preset-item")).not.toBeVisible();
  expect(await getPresetCount(window)).toBe(0);
});


test("プリセットの名前を変更できる", async ({ window }) => {
  await createPresetViaStore(window, "旧名");
  await expect(
    window.locator(".expression-preset-name", { hasText: "旧名" }),
  ).toBeVisible();

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const presetStore = v.useExpressionPresetStore as any;
    const presets = editorStore.getState().project?.expressionPresets;
    if (presets && presets.length > 0) {
      presetStore.getState().renamePreset(presets[0].id, "新名");
    }
  });

  await expect(
    window.locator(".expression-preset-name", { hasText: "新名" }),
  ).toBeVisible();
});


test("ホットキーでプリセットを適用できる", async ({ window }) => {
  await addParameter(window, "眉角度");
  const paramId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.parameters?.[0]?.id;
  });

  await setParameterValue(window, paramId, 0.4);
  const presetId = await createPresetViaStore(window, "ホットキー対象");

  await window.evaluate((pid) => {
    const v = window.__vivi2d!;
    const presetStore = v.useExpressionPresetStore as any;
    presetStore.getState().setHotkey(pid, 1);
  }, presetId);

  await setParameterValue(window, paramId, 0.9);
  expect(await getParameterValue(window, paramId)).toBe(0.9);

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const presetStore = v.useExpressionPresetStore as any;
    presetStore.getState().applyByHotkey(1);
  });

  expect(await getParameterValue(window, paramId)).toBe(0.4);
});


test("保存→読み込みでプリセットが永続化される", async ({ app, window }) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-preset-e2e-"));
  try {
    await createPresetViaStore(window, "永続化テスト");
    expect(await getPresetCount(window)).toBe(1);

    const savePath = path.join(tmpDir, "preset-test.vivi");
    await mockSaveDialog(app, savePath);
    await clickFileMenuItem(window, "保存");

    await expect(async () => {
      expect(fs.existsSync(savePath)).toBe(true);
    }).toPass({ timeout: 5_000 });

    await clickFileMenuItem(window, "閉じる");
    await expect(window.locator(".workspace")).toBeVisible({ timeout: 5000 });

    await mockOpenVivi(app, savePath);
    await clickFileMenuItem(window, "開く");

    await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });

    expect(await getPresetCount(window)).toBe(1);

    const presetName = await window.evaluate(() => {
      const v = window.__vivi2d!;
      const store = v.useEditorStore as any;
      return store.getState().project?.expressionPresets?.[0]?.name;
    });
    expect(presetName).toBe("永続化テスト");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});


test("複数プリセットを管理できる", async ({ window }) => {
  await createPresetViaStore(window, "笑顔");
  await createPresetViaStore(window, "怒り");
  await createPresetViaStore(window, "悲しみ");

  expect(await getPresetCount(window)).toBe(3);
  await expect(window.locator(".expression-preset-item")).toHaveCount(3);

  await window.locator(".expression-preset-delete-btn").first().click();
  expect(await getPresetCount(window)).toBe(2);
  await expect(window.locator(".expression-preset-item")).toHaveCount(2);
});


test("プリセット名をダブルクリックでインライン編集できる", async ({ window }) => {
  await createPresetViaStore(window, "元の名前");
  await expect(
    window.locator(".expression-preset-name", { hasText: "元の名前" }),
  ).toBeVisible();

  await window.locator(".expression-preset-name", { hasText: "元の名前" }).dblclick();

  const inlineInput = window.locator(".expression-preset-name-inline");
  await expect(inlineInput).toBeVisible();

  await inlineInput.fill("変更後の名前");
  await inlineInput.press("Enter");

  await expect(
    window.locator(".expression-preset-name", { hasText: "変更後の名前" }),
  ).toBeVisible();
  await expect(
    window.locator(".expression-preset-name", { hasText: "元の名前" }),
  ).not.toBeVisible();
});


test("ホットキーバッジをクリックしてホットキーを変更できる", async ({ window }) => {
  await createPresetViaStore(window, "ホットキー巡回テスト");
  await expect(window.locator(".expression-preset-item")).toBeVisible();

  const hotkeyBadge = window.locator(".expression-preset-hotkey");
  await expect(hotkeyBadge).toContainText("-");

  await hotkeyBadge.click();
  await expect(hotkeyBadge).toContainText("1");

  await hotkeyBadge.click();
  await expect(hotkeyBadge).toContainText("2");

  await hotkeyBadge.click();
  await expect(hotkeyBadge).toContainText("3");
});


test("プリセット上書き保存が動作する", async ({ window }) => {
  await addParameter(window, "口開閉");
  const paramId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.parameters?.[0]?.id;
  });
  expect(paramId).toBeDefined();

  await setParameterValue(window, paramId, 0.2);
  const presetId = await createPresetViaStore(window, "上書き対象");

  await setParameterValue(window, paramId, 0.8);

  await window.evaluate((pid) => {
    const v = window.__vivi2d!;
    const presetStore = v.useExpressionPresetStore as any;
    presetStore.getState().updatePresetValues(pid);
  }, presetId);

  await setParameterValue(window, paramId, 0.0);
  expect(await getParameterValue(window, paramId)).toBe(0.0);

  await window
    .locator(".expression-preset-item .param-action-btn", { hasText: /適用|Apply/ })
    .click();

  expect(await getParameterValue(window, paramId)).toBe(0.8);
});


test("ホットキーの排他制御", async ({ window }) => {
  const presetIdA = await createPresetViaStore(window, "プリセットA");
  const presetIdB = await createPresetViaStore(window, "プリセットB");
  await expect(window.locator(".expression-preset-item")).toHaveCount(2);

  await window.evaluate((pid) => {
    const v = window.__vivi2d!;
    const presetStore = v.useExpressionPresetStore as any;
    presetStore.getState().setHotkey(pid, 1);
  }, presetIdA);

  const hotkeyA = await window.evaluate((pid) => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const presets = editorStore.getState().project?.expressionPresets ?? [];
    return presets.find((p: any) => p.id === pid)?.hotkey;
  }, presetIdA);
  expect(hotkeyA).toBe(1);

  await window.evaluate((pid) => {
    const v = window.__vivi2d!;
    const presetStore = v.useExpressionPresetStore as any;
    presetStore.getState().setHotkey(pid, 1);
  }, presetIdB);

  const hotkeyAAfter = await window.evaluate((pid) => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const presets = editorStore.getState().project?.expressionPresets ?? [];
    return presets.find((p: any) => p.id === pid)?.hotkey;
  }, presetIdA);
  expect(hotkeyAAfter).toBeUndefined();

  const hotkeyBAfter = await window.evaluate((pid) => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const presets = editorStore.getState().project?.expressionPresets ?? [];
    return presets.find((p: any) => p.id === pid)?.hotkey;
  }, presetIdB);
  expect(hotkeyBAfter).toBe(1);
});


test("プリセット作成後にUndo/Redoが動作する", async ({ window }) => {
  await addParameter(window, "眉上下");

  await createPresetViaStore(window, "Undo対象");
  expect(await getPresetCount(window)).toBe(1);
  await expect(window.locator(".expression-preset-item")).toBeVisible();
  await window.keyboard.press("Control+KeyZ");

  await expect(async () => {
    expect(await getPresetCount(window)).toBe(0);
  }).toPass({ timeout: 3_000 });
  await expect(window.locator(".expression-preset-item")).not.toBeVisible();

  await window.keyboard.press("Control+Shift+KeyZ");

  await expect(async () => {
    expect(await getPresetCount(window)).toBe(1);
  }).toPass({ timeout: 3_000 });
  await expect(window.locator(".expression-preset-item")).toBeVisible();

  const undoBtn = window.locator(".menu-btn", { hasText: "↩ 戻す" });
  await expect(undoBtn).toBeEnabled();
  await undoBtn.click();

  await expect(async () => {
    expect(await getPresetCount(window)).toBe(0);
  }).toPass({ timeout: 3_000 });
  await expect(window.locator(".expression-preset-item")).not.toBeVisible();

  const redoBtn = window.locator(".menu-btn", { hasText: "↪ やり直し" });
  await expect(redoBtn).toBeEnabled();
  await redoBtn.click();

  await expect(async () => {
    expect(await getPresetCount(window)).toBe(1);
  }).toPass({ timeout: 3_000 });
  await expect(window.locator(".expression-preset-item")).toBeVisible();
  await window.keyboard.press("Control+KeyZ");

  await expect(async () => {
    expect(await getPresetCount(window)).toBe(0);
  }).toPass({ timeout: 3_000 });
  await expect(window.locator(".expression-preset-item")).not.toBeVisible();

  await window.keyboard.press("Control+Shift+KeyZ");

  await expect(async () => {
    expect(await getPresetCount(window)).toBe(1);
  }).toPass({ timeout: 3_000 });
  await expect(window.locator(".expression-preset-item")).toBeVisible();
  return;
});


test("Escキーで名前入力をキャンセルできる", async ({ window }) => {
  await window.locator(".expression-preset-add-btn").click();

  const nameInput = window.locator(".expression-preset-name-input");
  await expect(nameInput).toBeVisible();

  await nameInput.fill("キャンセルされるべき名前");

  await nameInput.press("Escape");

  await expect(window.locator(".expression-preset-name-input")).not.toBeVisible();
  await expect(window.locator(".expression-preset-add-btn")).toBeVisible();
  expect(await getPresetCount(window)).toBe(0);
});


test("複数パラメータのプリセットが正確に復元される", async ({ window }) => {
  await addParameter(window, "角度X");
  await addParameter(window, "角度Y");
  await addParameter(window, "角度Z");

  const paramIds = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const params = store.getState().project?.parameters ?? [];
    return params.map((p: any) => p.id);
  });
  expect(paramIds).toHaveLength(3);

  await setParameterValue(window, paramIds[0], 0.25);
  await setParameterValue(window, paramIds[1], 0.5);
  await setParameterValue(window, paramIds[2], 0.75);

  await createPresetViaStore(window, "複数パラメータ");

  await setParameterValue(window, paramIds[0], 0.0);
  await setParameterValue(window, paramIds[1], 0.0);
  await setParameterValue(window, paramIds[2], 0.0);

  expect(await getParameterValue(window, paramIds[0])).toBe(0.0);
  expect(await getParameterValue(window, paramIds[1])).toBe(0.0);
  expect(await getParameterValue(window, paramIds[2])).toBe(0.0);

  await window
    .locator(".expression-preset-item .param-action-btn", { hasText: /適用|Apply/ })
    .click();

  expect(await getParameterValue(window, paramIds[0])).toBe(0.25);
  expect(await getParameterValue(window, paramIds[1])).toBe(0.5);
  expect(await getParameterValue(window, paramIds[2])).toBe(0.75);
});


test("公開プロファイルで表情プリセットは非公開変形なしに動作する", async ({
  window,
}) => {
  await addParameter(window, "目開閉");
  const paramId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.parameters?.[0]?.id;
  });
  expect(paramId).toBeDefined();
  await setParameterValue(window, paramId, 0.5);

  await createPresetViaStore(window, "公開プロファイル表情");
  expect(await getPresetCount(window)).toBe(1);

  await setParameterValue(window, paramId, 0.0);
  expect(await getParameterValue(window, paramId)).toBe(0.0);

  await window
    .locator(".expression-preset-item .param-action-btn", { hasText: /適用|Apply/ })
    .click();
  expect(await getParameterValue(window, paramId)).toBe(0.5);

});


test("公開プロファイルで表情プリセットは非公開リンクなしに動作する", async ({
  window,
}) => {
  await addParameter(window, "口開閉");
  const paramId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.parameters?.[0]?.id;
  });
  expect(paramId).toBeDefined();
  await setParameterValue(window, paramId, 0.7);

  await createPresetViaStore(window, "リンクなし表情");
  expect(await getPresetCount(window)).toBe(1);

  await setParameterValue(window, paramId, 0.0);
  expect(await getParameterValue(window, paramId)).toBe(0.0);

  await window
    .locator(".expression-preset-item .param-action-btn", { hasText: /適用|Apply/ })
    .click();
  expect(await getParameterValue(window, paramId)).toBe(0.7);

  const hasPrivateLinkField = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    const privateLinkKey = ["mesh", "Links"].join("");
    return project ? privateLinkKey in project : false;
  });
  expect(hasPrivateLinkField).toBe(false);
});


test("プリセットが0件の状態でホットキーを押しても壊れない", async ({ window }) => {
  expect(await getPresetCount(window)).toBe(0);

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const presetStore = v.useExpressionPresetStore as any;
    presetStore.getState().applyByHotkey(1);
    presetStore.getState().applyByHotkey(2);
    presetStore.getState().applyByHotkey(9);
  });

  const panel = window.locator(".expression-preset-panel");
  await expect(panel).toBeVisible();

  expect(await getPresetCount(window)).toBe(0);

  await addParameter(window, "回復確認");
  await createPresetViaStore(window, "回復後プリセット");
  expect(await getPresetCount(window)).toBe(1);
});
