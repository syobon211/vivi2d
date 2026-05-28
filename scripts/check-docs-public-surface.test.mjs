import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const checker = path.resolve("scripts/check-docs-public-surface.mjs");
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-docs-surface-"));
  tempRoots.push(root);
  const result = spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return root;
}

function writeFile(root, relativePath, contents) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function runChecker(root) {
  return spawnSync(process.execPath, [checker], {
    cwd: root,
    encoding: "utf8",
  });
}

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

describe("check-docs-public-surface", () => {
  it("blocks forbidden product claims in user-doc media alt text", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/sample/manifest.json",
      JSON.stringify({
        id: "sample",
        variants: {
          neutral: {
            alt: { en: "Live2D compatible setup" },
            caption: { en: "Safe caption" },
          },
        },
      }),
    );

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("docs/user/assets/images/sample/manifest.json");
    expect(outputOf(result)).toContain("third-party compatibility");
  });

  it("blocks private deformation terms in user-doc media captions", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/sample/manifest.json",
      JSON.stringify({
        id: "sample",
        variants: {
          neutral: {
            alt: { en: "Safe alt" },
            caption: { en: "Shows a MorphTarget control" },
          },
        },
      }),
    );

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("private deformation");
  });

  it("blocks forbidden claims in generated route metadata JSON", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "apps/vivi2d-com/generated-route-metadata.json",
      JSON.stringify({
        routes: [
          {
            slug: "workflows/auto-setup",
            title: "Cubism compatible workflow",
          },
        ],
      }),
    );

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("apps/vivi2d-com/generated-route-metadata.json");
  });

  it("blocks reverse ComfyUI official-support claims in user docs", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/en/integrations/comfyui.md",
      "Vivi2D officially supports ComfyUI.\n",
    );

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("unsafe ComfyUI support/compatibility claim");
  });

  it("blocks localized ComfyUI official-support claims in user docs", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/ja/integrations/comfyui.md",
      "Vivi2D は ComfyUI を公式サポートします。\n",
    );

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("unsafe ComfyUI support/compatibility claim");
  });

  it.each([
    ["ja", "一時的なプレビュー計算、プレビュー用の形状、診断の詳細は保存されません。"],
    ["zh-Hans", "临时预览计算、预览用形状和诊断细节不会保存。"],
    ["ko-KR", "임시 미리보기 계산, 미리보기용 형상, 진단 세부 정보는 저장되지 않습니다."],
  ])("blocks localized preview-shape wording in %s user docs", (locale, text) => {
    const root = makeTempRepo();
    writeFile(root, `docs/user/${locale}/workflows/auto-setup.md`, text);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("user-doc private implementation wording");
  });

  it.each([
    ["ja", "一時的なプレビュー情報と診断の詳細はプロジェクトに保存されません。"],
    ["zh-Hans", "临时预览信息和诊断细节不会保存到项目中。"],
    ["ko-KR", "임시 미리보기 정보와 진단 세부 정보는 프로젝트에 저장되지 않습니다."],
  ])("allows localized temporary-preview-information wording in %s user docs", (locale, text) => {
    const root = makeTempRepo();
    writeFile(root, `docs/user/${locale}/workflows/auto-setup.md`, text);

    const result = runChecker(root);

    expect(result.status).toBe(0);
  });

  it("requires the English ComfyUI page to keep safety copy", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/en/integrations/comfyui.md",
      [
        "Use ComfyUI as an optional local tool.",
        "Install ComfyUI-See-through beside vivi2d_compat_plugin.",
        "Place vivi2d_compat_plugin under ComfyUI/custom_nodes.",
        "Vivi2D sends selected image bytes.",
      ].join("\n"),
    );

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("ComfyUI user page must describe");
  });

  it("requires localized ComfyUI pages to keep safety copy", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/ja/integrations/comfyui.md",
      [
        "ComfyUI は任意のローカルツールです。",
        "返ってきた結果は受け入れる前に確認します。",
        "ComfyUI-See-through と vivi2d_compat_plugin を兄弟として置きます。",
        "vivi2d_compat_plugin は ComfyUI/custom_nodes に入れます。",
        "選択した画像を送る場合があります。",
      ].join("\n"),
    );

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("ComfyUI user page must describe");
  });
});
