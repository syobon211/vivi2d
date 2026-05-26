import type { Page } from "playwright";
import { expect, test } from "../fixtures";
import { waitForViviRuntime } from "../helpers/app";

const editorLaunchLocales = [
  {
    locale: "zh-Hans",
    labels: [
      "文件",
      "视图",
      "设置",
      "↖ 选择",
      "✋ 平移",
      "◇ 网格",
      "图层",
      "请打开 PSD 文件",
      "属性",
      "未加载项目",
    ],
    englishFallbacks: [
      "Select",
      "Pan",
      "Mesh",
      "Layers",
      "Please open a PSD file",
      "No project loaded",
    ],
  },
  {
    locale: "ko-KR",
    labels: [
      "파일",
      "보기",
      "설정",
      "↖ 선택",
      "✋ 이동",
      "◇ 메시",
      "레이어",
      "PSD 파일을 열어 주세요",
      "속성",
      "프로젝트가 로드되지 않음",
    ],
    englishFallbacks: [
      "Select",
      "Pan",
      "Mesh",
      "Layers",
      "Please open a PSD file",
      "No project loaded",
    ],
  },
] as const;

async function bootWithLocale(window: Page, locale: string): Promise<void> {
  await window.setViewportSize({ width: 1280, height: 720 });
  await window.evaluate((nextLocale) => {
    localStorage.setItem("vivi2d-locale", nextLocale);
    localStorage.setItem("vivi2d-workspace-mode", "default");
  }, locale);
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await waitForViviRuntime(window);
}

test.describe("editor launch surface i18n completeness", () => {
  for (const { locale, labels, englishFallbacks } of editorLaunchLocales) {
    test(`${locale} localizes the no-project launch surface without English fallback`, async ({
      window,
    }) => {
      await bootWithLocale(window, locale);

      const visibleText = await window.evaluate(() => document.body.innerText);
      for (const label of labels) {
        expect(visibleText, `${locale} should show ${label}`).toContain(label);
      }
      for (const fallback of englishFallbacks) {
        expect(visibleText, `${locale} should not show English fallback ${fallback}`).not.toContain(
          fallback,
        );
      }
    });
  }
});
