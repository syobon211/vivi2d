# Vivi2D Localization Notes

Vivi2D currently treats these UI locales as first-class application locales:

- `en`: English
- `ja`: Japanese
- `zh-Hans`: Simplified Chinese
- `ko-KR`: Korean

Locale IDs use canonical BCP 47 tags. Do not add ad-hoc IDs such as `zh`,
`cn`, `kr`, or `korean`.

## Review Requirements

Every shipped locale file must be represented in
`docs/developer/contributing/i18n/translation-review-manifest.json`. The manifest tracks the exact
source hash that was reviewed. If a locale file changes, run
`npm run i18n:check:review` and update the manifest as part of the same change.

The current manifest is a provisional technical review. It verifies key parity,
mojibake hygiene, and public-copy/IP terminology. A native-speaker human review
is still required before a public release candidate for newly added
`zh-Hans` and `ko-KR` copy.

## Copy Rules

- Keep `Vivi2D`, protocol names, file extensions, and stable API identifiers
  locale-neutral.
- Do not translate serialized project fields, Viewer API request names, SDK
  identifiers, or provider capability IDs.
- Do not claim compatibility with third-party products in localized UI copy.
- Use `zh-Hans` only for Simplified Chinese. Traditional Chinese is not claimed
  as supported in this phase.
- Avoid flags for language selection.

## Public-Safe Terminology

Use these phrases when localized UI copy needs to describe setup review,
discarded preview state, or user acceptance. They are intentionally
user-visible terms, not implementation terms.

| Concept | `en` | `ja` | `zh-Hans` | `ko-KR` |
| --- | --- | --- | --- | --- |
| Discarded preview state | temporary preview information | 一時的なプレビュー情報 | 临时预览信息 | 임시 미리보기 정보 |
| Discarded preview category | discarded preview data | 破棄されるプレビューデータ | 会被丢弃的预览数据 | 폐기되는 미리보기 데이터 |
| Public-safe rig controls | motion controls | モーション制御 | 动作控制 | 모션 제어 |
| Suggested reviewed edit | handle suggestion | ハンドル候補 | 手柄建议 | 핸들 제안 |
| User acceptance step | review before accepting | 受け入れる前に確認 | 接受前先检查 | 적용하기 전에 검토 |

Avoid public UI or user-guide wording that implies stored editor geometry,
third-party compatibility, or private algorithm details. In particular, do not
use `deformer`, `preview geometry`, `preview shape`, or localized equivalents
in user-visible strings. If a technical reference page must mention a blocked
term, keep it in an explicitly labeled IP/reference section and make sure the
public-copy scanner allowlist explains why.

## Required Checks

Run the full i18n gate before landing locale changes:

```bash
npm run i18n:check:all
```

That gate covers Editor key parity, Viewer key parity, hygiene scanning,
compact layout checks, and the review manifest.
