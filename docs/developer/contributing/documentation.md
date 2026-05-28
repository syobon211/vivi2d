# Documentation Contribution Guide

This file defines how tracked documentation is authored, localized, and checked.
The structural information architecture lives in
[`documentation-architecture.md`](../documentation-architecture.md).
The detailed user-docs and future `vivi2d.com` contract lives in
[`user-docs-site.md`](../architecture/user-docs-site.md). The current
English-first content, localization, and website-scaffold sequence lives in
[`user-docs-content-production.md`](../architecture/user-docs-content-production.md).

## Document Classes

- Root `README.md`: short English-only project entry point.
- `docs/developer/`: English-only contributor and maintainer documentation.
- `docs/developer/contributing/task-guides/`: task-oriented maps from common
  change types to files, boundaries, tests, and related docs.
- `docs/user/`: localized user documentation for `en`, `ja`, `zh-Hans`, and
  `ko-KR`.
- `docs/backlog/`: ignored local archive for historical plans and review notes.

## Developer Task Guides

Task guides are practical navigation docs, not API references or roadmaps. Each
guide must keep these sections:

- When To Use This Guide
- Ownership And Boundaries
- Primary Files
- Tests And Gates
- Safe Change Pattern
- Common Failure Modes
- PR Checklist
- Related Docs

`npm run check:task-guide-paths` verifies that `Primary Files` entries still
match repository paths. `npm run check:task-guide-gates` verifies that required
gates reference existing package scripts or approved manual review steps.

## User-Doc Slug Parity

Every user-doc locale must keep the same slug set. A page that exists in one
locale must exist in every supported locale.

Supported locale roots:

- `docs/user/en/`
- `docs/user/ja/`
- `docs/user/zh-Hans/`
- `docs/user/ko-KR/`

`docs:user:check` verifies slug parity, localized route coverage, and absence of
release-blocking `status: stub` frontmatter.
The next strict version of this gate should follow the frontmatter, media
manifest, and release-candidate rules in
[`user-docs-site.md`](../architecture/user-docs-site.md).

## Stub Policy

`status: "stub"` is local scratch only. Do not commit stub pages. The
`docs:user:check` gate rejects committed stub pages in all modes. For tracked
in-progress work, use `status: "draft"` plus explicit placeholder copy instead;
see [User Docs And Website Architecture](../architecture/user-docs-site.md) for
the full release-candidate rules.

Local scratch pages may temporarily use:

```yaml
---
status: stub
---
```

Stub pages must use localized "not available yet" copy in the requested locale
if they are shared outside the repository. Non-English routes must never
silently render English body copy.

## Media Naming

Language-neutral media uses `.neutral` before the extension:

```text
docs/user/assets/images/workflows/auto-setup/preview-panel.neutral.png
```

Locale-specific media uses the BCP 47 locale suffix:

```text
docs/user/assets/images/workflows/auto-setup/preview-panel.ja.png
docs/user/assets/videos/workflows/manual-split/lasso-smoothing.ko-KR.webm
```

Media lookup is locale-specific first, then `.neutral`. Non-English pages must
not fallback to `.en` media.

## User-Doc JSON Metadata Allowlist

JSON under `docs/user/` is public metadata and must be allowlisted here before
it is added.

Currently allowed patterns:

- `docs/user/publication-manifest.json`
- `docs/user/assets/**/manifest.json`
- `docs/user/assets/**/captions.json`
- `docs/user/assets/**/transcripts.json`

Unregistered JSON files fail `npm run check:docs-architecture`.

## Public-Copy/IP Scanner

`npm run check:docs-public-surface` scans root public docs, developer docs,
localized user docs, user-doc metadata, media captions/transcripts, and
generated `apps/vivi2d-com` route metadata. It is separate from
`docs:user:check`; passing slug/media parity does not imply public-copy/IP
safety.

## User-Docs Site Scaffold

The minimal `vivi2d.com` scaffold lives under `apps/vivi2d-com/`.

```sh
npm run docs:site:build
npm run docs:site:check
```

The build reads `docs/user/publication-manifest.json` and must not publish pages
by walking the filesystem. The check verifies that unpublished draft routes are
not generated and that `apps/vivi2d-com/route-metadata.json` matches the current
manifest.

## Translation Review Metadata

Locale review manifests live under `docs/developer/contributing/i18n/`.
That directory records reviewer assignments and string-review metadata. It is
not published user-facing content.
