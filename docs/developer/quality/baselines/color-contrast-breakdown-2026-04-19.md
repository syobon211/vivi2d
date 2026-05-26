# color-contrast violations CSS クラス別集計 2026-04-19

color-contrast の calibration 計測結果。既知違反ベースラインの見直しに使う。

## 集計概要

| ステート | violation 件数 | 内訳ファイル |
|---|---|---|
| 起動直後 (initial) | **1** | [color-contrast-initial-2026-04-19.json](color-contrast-initial-2026-04-19.json) |
| PSD 読込後 (workspace) | **4** | [color-contrast-workspace-2026-04-19.json](color-contrast-workspace-2026-04-19.json) |

`accessibility.spec.ts` の `KNOWN_BASELINE` (initial: 30, workspace: 200) は過剰見積もりで、実態は **5 件未満**だった。以後はこの実測を基準に運用する。

## 起動直後 (1 件)

| クラス/セレクタ | 件数 | 想定箇所 |
|---|---|---|
| `(no-class) span` | 1 | 起動画面のテキスト span（要素詳細は HTML 要照会、`color-contrast-initial-2026-04-19.json` 参照）|

## PSD 読込後 (4 件)

| クラス/セレクタ | 件数 | 想定箇所 / 修正方針案 |
|---|---|---|
| `.app-title` | 1 | アプリ上部タイトル。`color: var(--text-secondary)` 等で背景とのコントラスト不足の可能性。`--text-primary` への変更検討 |
| `.tl-scene-select` | 1 | timeline panel の scene select dropdown。プレースホルダ色など。`color` token 見直し |
| `label[title="物理演算の有効/無効"]` | 1 | lipsync panel header 内 physics toggle の `<label>`。className なしのため `physics-toggle-label` 追加 + 専用色指定が良い |
| `.lipsync-panel > .panel-header > .physics-toggle` | 1 | 上記 label の親要素。同一改修で同時解消する可能性が高い |

## 評価

- 旧 `KNOWN_BASELINE.workspace = 200` は実測とかけ離れていた。
- 実際の workspace 違反は **4 件**で、いずれも個別修正可能なクラス/セレクタに限定される。
- 起動直後の 1 件 (`span`) は要素特定が必要だが、追加計測で追跡可能な範囲にある。

## 計測コマンド

再計測する場合（コード変更後など）:

```bash
RUN_A11Y_INVENTORY=1 npx playwright test --config=e2e/playwright.config.ts _inventory-color-contrast
```

PowerShell の場合:

```powershell
$env:RUN_A11Y_INVENTORY="1"; npx playwright test --config=e2e/playwright.config.ts _inventory-color-contrast
```

通常実行 (`npm run test:e2e`) では `_inventory-color-contrast.spec.ts` は `test.skip` で skip される。
