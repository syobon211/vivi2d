import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures";

async function resolveMenuTrigger(window: Page): Promise<Locator> {
  const localized = window.locator(".menu-dropdown-trigger", {
    hasText: /Integrations|ComfyUI|外部連携/,
  });
  if ((await localized.count()) > 0) {
    return localized.first();
  }
  return window.locator(".menu-dropdown-trigger").nth(3);
}

async function resolveDialogTab(
  window: Page,
  englishPattern: RegExp,
  fallbackIndex: number,
): Promise<Locator> {
  const localized = window.locator(".ai-gen-tab", { hasText: englishPattern });
  if ((await localized.count()) > 0) {
    return localized.first();
  }
  return window.locator(".ai-gen-tab").nth(fallbackIndex);
}

async function openAiGenerateDialog(window: Page) {
  const trigger = await resolveMenuTrigger(window);
  await trigger.click();

  const item = window.locator(".menu-dropdown-panel .menu-dropdown-item", {
    hasText: /Generate Model|Automatic Model Generation|自動モデル生成/,
  });
  if ((await item.count()) > 0) {
    await expect(item.first()).toBeVisible();
    await item.first().click();
  } else {
    const fallback = window.locator(".menu-dropdown-panel .menu-dropdown-item").first();
    await expect(fallback).toBeVisible();
    await fallback.click();
  }

  const title = window.locator(".modal-title");
  await expect(title).toBeVisible();
  await expect(title).toContainText(
    /Generate Model|Automatic Model Generation|自動モデル生成/,
  );
}

test("AI generate dialog enables prompt generation only when prompt text is present", async ({
  window,
}) => {
  await openAiGenerateDialog(window);

  const promptTab = await resolveDialogTab(window, /From Prompt|プロンプトから/i, 1);
  await promptTab.click();

  const textareas = window.locator(".ai-gen-textarea");
  await expect(textareas).toHaveCount(2);

  const primaryAction = window.locator(".modal-actions .prop-btn").first();
  await textareas.first().fill("");
  await expect(primaryAction).toBeDisabled();

  await textareas.first().fill("anime character portrait");
  await expect(primaryAction).toBeEnabled();
});

test("AI generate dialog preserves prompt inputs when switching tabs", async ({
  window,
}) => {
  await openAiGenerateDialog(window);

  const promptTab = await resolveDialogTab(window, /From Prompt|プロンプトから/i, 1);
  const imageTab = await resolveDialogTab(window, /From Image|画像から/i, 0);

  await promptTab.click();

  const promptArea = window.locator(".ai-gen-textarea").first();
  const negativePromptArea = window.locator(".ai-gen-textarea").nth(1);
  const resolutionSelect = window.locator(".ai-gen-select");
  const stepsInput = window.locator(".ai-gen-input").last();

  await promptArea.fill("full body anime character");
  await negativePromptArea.fill("low quality");
  await resolutionSelect.selectOption("1024");
  await stepsInput.fill("42");

  await imageTab.click();
  await expect(window.locator(".ai-gen-textarea")).toHaveCount(0);

  await promptTab.click();
  await expect(promptArea).toHaveValue("full body anime character");
  await expect(negativePromptArea).toHaveValue("low quality");
  await expect(resolutionSelect).toHaveValue("1024");
  await expect(stepsInput).toHaveValue("42");

  const closeButton = window.getByRole("button", { name: /Close|閉じる/i });
  await closeButton.click();
  await expect(window.locator(".modal-title")).not.toBeVisible();
});

test("AI generate dialog shows compat workflow status", async ({ window }) => {
  await openAiGenerateDialog(window);

  const notices = window.locator(".ai-gen-notice");
  await expect(notices.first()).toBeVisible();
  await expect(notices).toContainText([/ComfyUI|Vivi2D compat|See-through workflow/i]);
});

test("AI generate dialog settles on a stable compat workflow status", async ({
  window,
}) => {
  await openAiGenerateDialog(window);

  const compatNotice = window
    .locator(".ai-gen-notice")
    .filter({ hasText: /plugin|workflow|compat|プラグイン|ワークフロー/i })
    .last();

  await expect(compatNotice).toContainText(
    /Vivi2D compat workflow|legacy See-through workflow|See-through workflow|従来の See-through ワークフロー/i,
  );
  await expect(compatNotice).not.toContainText(/Checking Vivi2D compat plugin/i);
});
