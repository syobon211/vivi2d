import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import { clickFileMenuItem } from "../helpers/operations";


let tmpDir: string;

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-corrupt-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});


test("途中で切れた .vivi（truncated）を開いてもクラッシュしない", async ({
  app,
  window,
}) => {
  const p = path.join(tmpDir, "truncated.vivi");
  fs.writeFileSync(
    p,
    '{"version":5,"project":{"name":"x","width":100,"height":100,"layers":[{"id":"a","kind":"viviMesh","na',
  );

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".app")).toBeVisible();
});

test("バイナリゴミを .vivi として開いてもクラッシュしない", async ({ app, window }) => {
  const p = path.join(tmpDir, "binary.vivi");
  fs.writeFileSync(p, Buffer.from([0xff, 0xfe, 0xfd, 0x00, 0x01, 0x02, 0x03]));

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".app")).toBeVisible();
});

test("レイヤーの kind が未知の値でもクラッシュしない", async ({ app, window }) => {
  const p = path.join(tmpDir, "bad-kind.vivi");
  fs.writeFileSync(
    p,
    JSON.stringify({
      version: 5,
      project: {
        name: "badkind",
        width: 100,
        height: 100,
        layers: [
          {
            id: "a",
            kind: "thisKindDoesNotExist",
            name: "x",
            visible: true,
            opacity: 1,
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            blendMode: "normal",
            expanded: true,
            children: [],
          },
        ],
        parameters: [],
        clips: [],
        scenes: [],
        physicsGroups: [],
      },
    }),
  );

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".app")).toBeVisible();
});

test("__proto__ インジェクションを含む .vivi を開いてもプロトタイプ汚染されない", async ({
  app,
  window,
}) => {
  const p = path.join(tmpDir, "proto-pollution.vivi");
  fs.writeFileSync(
    p,
    JSON.stringify({
      version: 5,
      project: {
        name: "poison",
        width: 100,
        height: 100,
        layers: [],
        parameters: [],
        clips: [],
        scenes: [],
        physicsGroups: [],
        skins: { __proto__: { polluted: true } },
      },
    }),
  );

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  const polluted = await window.evaluate(() => {
    return ({} as any).polluted === true;
  });
  expect(polluted).toBe(false);

  await expect(window.locator(".app")).toBeVisible();
});

test("深いネストで invalid なレイヤー kind を含んでもクラッシュしない", async ({
  app,
  window,
}) => {
  const p = path.join(tmpDir, "nested-bad.vivi");
  fs.writeFileSync(
    p,
    JSON.stringify({
      version: 5,
      project: {
        name: "nested",
        width: 100,
        height: 100,
        layers: [
          {
            id: "g1",
            kind: "group",
            name: "G",
            visible: true,
            opacity: 1,
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            blendMode: "normal",
            expanded: true,
            children: [
              {
                id: "n1",
                kind: "INVALID_KIND_HERE",
                name: "x",
                children: [],
              },
            ],
          },
        ],
        parameters: [],
        clips: [],
        scenes: [],
        physicsGroups: [],
      },
    }),
  );

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".app")).toBeVisible();
});


test("途中で切れた .vivb（ヘッダー未満）を開いてもクラッシュしない", async ({
  app,
  window,
}) => {
  const p = path.join(tmpDir, "truncated.vivb");
  fs.writeFileSync(p, Buffer.from([0x56, 0x49, 0x56, 0x42, 0x01]));

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".app")).toBeVisible();
});

test("マジックバイトが不正な .vivb を開いてもクラッシュしない", async ({
  app,
  window,
}) => {
  const p = path.join(tmpDir, "bad-magic.vivb");
  fs.writeFileSync(
    p,
    Buffer.from([
      0x58,
      0x58,
      0x58,
      0x58, // "XXXX"
      0x01, // version
      0x00,
      0x00,
      0x00,
      0x00, // metadataLength = 0
    ]),
  );

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".app")).toBeVisible();
});

test("未対応バージョンの .vivb を開いてもクラッシュしない", async ({ app, window }) => {
  const p = path.join(tmpDir, "bad-version.vivb");
  fs.writeFileSync(
    p,
    Buffer.from([
      0x56,
      0x49,
      0x56,
      0x42, // "VIVB"
      0xff, // version 255 (unsupported)
      0x00,
      0x00,
      0x00,
      0x00, // metadataLength = 0
    ]),
  );

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".app")).toBeVisible();
});

test("メタデータ長がファイルを超える .vivb を開いてもクラッシュしない", async ({
  app,
  window,
}) => {
  const p = path.join(tmpDir, "bad-metalen.vivb");
  fs.writeFileSync(
    p,
    Buffer.from([
      0x56,
      0x49,
      0x56,
      0x42, // "VIVB"
      0x01, // version 1
      0xff,
      0xff,
      0xff,
      0x7f, // metadataLength = 2147483647 (LE)
    ]),
  );

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".app")).toBeVisible();
});


test("不正な .vivi 読込エラーの後、正常な PSD を開いて作業再開できる", async ({
  app,
  window,
  loadTestPsd,
}) => {
  const bad = path.join(tmpDir, "bad.vivi");
  fs.writeFileSync(bad, "garbage");
  await mockOpenVivi(app, bad);
  await clickFileMenuItem(window, "開く");
  await expect(window.locator(".app")).toBeVisible();

  await loadTestPsd();
  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});

test("保存ダイアログキャンセル後に再度「保存」を呼び出せる", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: "" });
  });
  await clickFileMenuItem(window, "保存");
  await expect(window.locator(".app")).toBeVisible();

  const p = path.join(tmpDir, "retry.vivi");
  await mockSaveDialog(app, p);
  await clickFileMenuItem(window, "保存");

  await expect(async () => {
    expect(fs.existsSync(p)).toBe(true);
  }).toPass({ timeout: 5_000 });
});

test("破損 .vivi を開いた後、別の正常な .vivi を開ける", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  const goodPath = path.join(tmpDir, "good.vivi");
  await mockSaveDialog(app, goodPath);
  await clickFileMenuItem(window, "保存");
  await expect(async () => {
    expect(fs.existsSync(goodPath)).toBe(true);
  }).toPass({ timeout: 5_000 });

  const badPath = path.join(tmpDir, "bad.vivi");
  fs.writeFileSync(badPath, "!!! NOT JSON !!!");
  await mockOpenVivi(app, badPath);
  await clickFileMenuItem(window, "開く");
  await expect(window.locator(".app")).toBeVisible();

  await mockOpenVivi(app, goodPath);
  await clickFileMenuItem(window, "開く");

  await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });
});


test("オプションフィールド（colliders / stateMachines 等）が未定義でも読み込める", async ({
  app,
  window,
}) => {
  const p = path.join(tmpDir, "minimal.vivi");
  fs.writeFileSync(
    p,
    JSON.stringify({
      version: 3,
      project: {
        name: "minimal",
        width: 100,
        height: 100,
        layers: [],
        parameters: [],
        clips: [],
        scenes: [],
        physicsGroups: [],
      },
    }),
  );

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".app")).toBeVisible();
});


test("10MB の巨大 .vivi ファイル（不正 JSON）でもクラッシュしない", async ({
  app,
  window,
}) => {
  const p = path.join(tmpDir, "huge.vivi");
  const chunk = "x".repeat(1024);
  const lines: string[] = [];
  for (let i = 0; i < 10 * 1024; i++) lines.push(chunk);
  fs.writeFileSync(p, lines.join(""));

  await mockOpenVivi(app, p);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".app")).toBeVisible({ timeout: 15_000 });
});
