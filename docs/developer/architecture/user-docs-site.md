# User Docs And Website Architecture

This document defines the tracked user-documentation contract for Vivi2D and
the future `vivi2d.com` documentation site. It is a contributor-facing design
reference; user-facing content lives under `docs/user/{locale}/`. The content
production sequence lives in
[User Docs Content Production Design](user-docs-content-production.md).

## Goals

- Make user documentation useful to artists, riggers, streamers, and SDK users
  without requiring repository knowledge.
- Keep the same topic structure across `en`, `ja`, `zh-Hans`, and `ko-KR`.
- Let the future website consume tracked docs without copying content into an
  unreviewed CMS.
- Require every public user-doc surface to pass structural, localization,
  media, and public-copy safety checks.
- Keep website infrastructure decisions explicit without blocking content work.

## Directory Contract

The canonical content root is `docs/user/`.

```text
docs/user/
  index.md
  assets/
    images/
    thumbnails/
    videos/
  en/
  ja/
  zh-Hans/
  ko-KR/
```

Each locale directory must keep identical slugs. The English tree is the shape
source for route parity, but it is not a fallback body source for localized
routes. A missing or incomplete translation must be represented by a localized
stub that blocks release-candidate signoff.

Initial public-topic families:

- `getting-started/`: install, first launch, and opening the first project.
- `workflows/`: PSD-to-rig, manual image split, Auto Setup, Viewer, and export.
- `reference/`: file formats, keyboard shortcuts, and settings.
- `troubleshooting/`: import errors, display/GPU issues, and localization.
- `faq.md`: short answers for non-technical users.

The first website release may expose only a subset in navigation, but hidden
published pages still need locale parity and checks.

## Frontmatter Contract

Every published Markdown page under `docs/user/` must start with YAML
frontmatter, including the locale selector at `docs/user/index.md`. The root
index is not a workflow page, but it is still a public route and must provide
metadata that lets the website set language, title, description, and indexing
behavior deterministically.

Standard localized page example:

```yaml
---
title: "Auto Setup"
description: "Create a safe starting rig from accepted layers."
locale: "en"
slug: "workflows/auto-setup"
status: "draft"
audience: ["artist", "rigger"]
workflow: "auto-setup"
media:
  - "auto-setup.preview-panel"
translation:
  sourceLocale: "en"
  sourceSlug: "workflows/auto-setup"
  sourceContentHash: "sha256:v1:<normalized-source-body-hash>"
  reviewed: false
  reviewerHandle: ""
  reviewDate: ""
---
```

Root selector page example:

```yaml
---
title: "Vivi2D User Documentation"
description: "Choose a language for the Vivi2D user guide."
locale: "en"
slug: ""
status: "reviewed"
routeKind: "locale-selector"
noIndex: false
---
```

Required fields:

| Field | Type | Required For | Validation |
| --- | --- | --- | --- |
| `title` | localized string | every user-doc Markdown page | non-empty string |
| `description` | localized string | every user-doc Markdown page | non-empty string used for search cards and route metadata |
| `locale` | enum | every user-doc Markdown page | `en`, `ja`, `zh-Hans`, or `ko-KR`; must match the directory, except the root selector page uses `en` |
| `slug` | string | every user-doc Markdown page | path under the locale root without `.md`; the root selector page uses an empty string |
| `status` | enum | every user-doc Markdown page | `draft`, `reviewed`, or `stub` |

Conditional fields:

| Field | Type | Required For | Validation |
| --- | --- | --- | --- |
| `audience` | closed string list | optional | every value must be one of `artist`, `rigger`, `streamer`, or `developer` |
| `workflow` | closed string | workflow pages | must match the workflow family, such as `auto-setup` or `manual-image-split` |
| `media` | string list | pages with images or videos | every ID must resolve to a user-doc media manifest |
| `translation` | object | non-English pages once review tracking is connected | includes `sourceLocale`, `sourceSlug`, `sourceContentHash`, `reviewed`, `reviewerHandle`, and `reviewDate` |
| `routeKind` | closed string | `docs/user/index.md` only | currently `locale-selector` |
| `noIndex` | boolean | optional | controls search indexing and generated route metadata |

Validator rules for examples:

- A frontmatter block starts with `---` on its own line and closes with `---`
  on its own line before the Markdown body.
- The two examples above are complete normative examples for a localized
  workflow page and the root locale-selector page.
- Validators must fail on any missing required field: `title`, `description`,
  `locale`, `slug`, or `status`.
- Validators must fail on an unclosed frontmatter block, duplicate fields,
  unknown `status` values, or a `locale`/`slug` mismatch.
- The root `docs/user/index.md` is exempt from the locale-directory match
  because it has no locale parent directory. Its validity is established by
  `routeKind: "locale-selector"`, `locale: "en"`, and `slug: ""`.
- A non-English page with `status: "reviewed"` must have
  `translation.reviewed: true`, a non-empty `translation.reviewerHandle`, and a
  valid ISO 8601 `translation.reviewDate`.
- A non-English page with `status: "reviewed"` must bind review state to the
  current English source using `translation.sourceContentHash`. The hash should
  be `sha256:v1:` over the normalized English source body plus relevant
  user-visible frontmatter fields. Release-candidate mode must fail if the
  current English source hash differs from the recorded hash.

`sourceContentHash` normalization v1:

1. Decode the English source file as UTF-8 and reject invalid UTF-8 or a UTF-8
   BOM.
2. Parse and remove the YAML frontmatter block, including the opening and
   closing `---` delimiter lines.
3. Normalize line endings in the remaining Markdown body to LF, and otherwise
   keep the Markdown body byte-for-byte. Do not trim whitespace, remove code
   block spacing, rewrite links, rewrite media URLs, or strip trailing blank
   lines.
4. Include only these English frontmatter fields in the hash input: `title`,
   `description`, `audience`, `media`, and `workflow`. The ordered `media` ID
   list is part of the review binding because changing page-level screenshots or
   videos can invalidate a translation even when the Markdown body is unchanged.
   For every referenced media ID, also include a canonical `mediaMetadata`
   record containing the manifest `id`, `kind`, `status`, `topicSlugs`,
   localized alt/caption/transcript metadata for every supported locale,
   variant paths, and variant file SHA-256 digests. In-place image, video, or
   localized media-copy replacement must therefore invalidate reviewed
   translation hashes even if the media ID stays stable.
5. Exclude `locale`, `slug`, `status`, `routeKind`, `noIndex`, and all
   `translation.*` fields.
6. Serialize included frontmatter fields as `key=<canonical-json-value>\n` in
   alphabetical key order, then append one extra LF and the normalized Markdown
   body.
7. Hash the UTF-8 bytes with SHA-256 and record lowercase hex as
   `sha256:v1:<digest>`.

Tracked user docs must have zero `status: stub` pages in both default and
release-candidate checks. Use `status: "draft"` plus explicit placeholder copy
for in-progress tracked work; reserve `stub` for local scratch content that is
not committed. A page can ship as `draft` only before public launch or when
explicitly excluded from the tracked publication manifest. Any route marked
`published: true` must have `status: "reviewed"` in every locale, even outside
release-candidate mode.

The website build must consume the same frontmatter validator as
`docs:user:check`. A deployment or preview job for `vivi2d.com` must fail before
publishing if any published route has `status: stub`, any referenced media is
not `status: "reviewed"`, invalid metadata, or a missing locale-specific route.

## Media Contract

Media files are public documentation assets. They must avoid private project
content, local filesystem paths, unredacted error details, and unsupported
product claims.

Asset filenames use a locale or neutral suffix:

```text
docs/user/assets/images/workflows/auto-setup/preview-panel.neutral.png
docs/user/assets/images/workflows/auto-setup/preview-panel.ja.png
docs/user/assets/videos/workflows/manual-image-split/lasso-selection.ko-KR.webm
```

Media lookup order:

1. Locale-specific asset, such as `.ja.png`.
2. Neutral asset, such as `.neutral.png`.
3. No fallback. Non-English pages must not use `.en` assets implicitly.

Each asset group should have a manifest before it is used by a page:

```json
{
  "id": "auto-setup.preview-panel",
  "kind": "image",
  "status": "placeholder",
  "topicSlugs": ["workflows/auto-setup"],
  "variants": {
    "neutral": {
      "path": "docs/user/assets/images/workflows/auto-setup/preview-panel.neutral.png",
      "alt": {
        "en": "Auto Setup review panel with saved operations and warnings.",
        "ja": "<localized Japanese alt text>",
        "zh-Hans": "<localized Simplified Chinese alt text>",
        "ko-KR": "<localized Korean alt text>"
      },
      "caption": {
        "en": "Review saved operations before applying Auto Setup.",
        "ja": "<localized Japanese caption>",
        "zh-Hans": "<localized Simplified Chinese caption>",
        "ko-KR": "<localized Korean caption>"
      }
    }
  }
}
```

Manifest requirements:

- `id` is stable and referenced by page frontmatter.
- `status` is `placeholder`, `draft`, or `reviewed`.
- `topicSlugs` names the pages that may reference the asset.
- Every used variant has localized `alt` text and caption text for all four
  locales.
- Video assets must add transcript or caption metadata before public launch.

Placeholder assets are allowed during authoring, but public-release signoff
must either replace them with reviewed media or mark the referencing page as
non-public.

## Initial Page Scope

The first useful user-doc set should focus on four user outcomes:

- Getting started: install, first launch, open a first project.
- Manual image split: create and refine layers from a flat image.
- Auto Setup: generate a safe starting rig and review what is saved.
- Viewer/API usage: preview a model and understand how external tools connect.

Each page should use the same structure:

```text
# Title
One-sentence outcome.

## What You Need
Short prerequisites.

## Steps
Numbered, task-oriented steps.

## Check Your Result
Observable success state.

## If Something Looks Wrong
Short, user-safe troubleshooting links.

## Next
The next workflow page.
```

Avoid implementation terms, private preview diagnostics, raw error payloads,
and internal package names. User docs can say what the user sees and what action
to take; developer docs own implementation detail.

For the current authoring sequence, final screenshots and videos are deferred
until the written workflow is stable. Follow
[User Docs Content Production Design](user-docs-content-production.md) for the
English-first, localization, and website-scaffold order.

## `docs:user:check` Strengthening

The current gate validates slug parity, `status: stub`, and `.en` media fallback
for non-English pages. The next implementation should extend it to validate the
full contract above.

Required checks:

- Locale roots are exactly `en`, `ja`, `zh-Hans`, and `ko-KR`.
- Every locale has the same page slug set as `en`.
- Every Markdown page under `docs/user/`, including `docs/user/index.md`, has
  valid frontmatter.
- `locale` and `slug` frontmatter match the file path.
- `status` is one of `draft`, `reviewed`, or `stub`.
- Release-candidate mode fails on `status: stub` and on any published route
  that references media with `status: "placeholder"` or `status: "draft"`.
- Release-candidate mode fails on public pages that remain `draft` unless a
  tracked publication manifest marks the route as unpublished.
- Every page `media` ID resolves to a manifest under `docs/user/assets/**`.
- Every referenced asset variant exists, or a `.neutral` variant exists.
- Non-English pages never fallback to `.en` media.
- Manifest `alt` and `caption` strings exist for every supported locale.
- Video manifests include captions or transcripts before public launch.
- Public-copy/IP scanning is not replaced by this gate; `docs:user:check`
  should call out when `check:docs-public-surface` is also required.

Recommended modes:

```text
npm run docs:user:check
npm run docs:user:check -- --release-candidate
```

The default mode should be friendly for active authoring. Release-candidate
mode should be strict enough for `vivi2d.com` publication.

The future website build and deployment job must run release-candidate mode, not
only the default authoring mode. Local authoring checks are allowed to pass with
draft pages and placeholder media; deployment checks are not.

Draft publication is controlled by a publication manifest, not by navigation
alone. Navigation exclusion only hides a link; it must not be treated as
unpublication.

Publication manifest example:

```json
{
  "locales": ["en", "ja", "zh-Hans", "ko-KR"],
  "routes": [
    {
      "slug": "workflows/auto-setup",
      "published": true,
      "includeInNavigation": true,
      "includeInSearch": true
    },
    {
      "slug": "workflows/manual-image-split",
      "published": false,
      "includeInNavigation": false,
      "includeInSearch": false
    }
  ]
}
```

If `published` is `false`, the website build must emit no route, sitemap entry,
search record, route metadata, or navigation entry for that slug. A draft page is
allowed during release-candidate mode only when every locale for that slug is
unpublished by this manifest.

The `locales` array is part of the route-generation contract. A route entry
applies to every listed locale, so the website build expands each route as
`/{locale}/latest/{slug}` and must not publish pages by walking files directly.
Adding or removing a supported user-doc locale requires updating this manifest,
the locale directory set, and `docs:user:check` in the same change.

Every slug present in `docs/user/en/` must have an explicit publication-manifest
entry. A slug missing from the manifest is a `docs:user:check` error in both
default and release-candidate modes; contributors should never rely on implicit
published or unpublished defaults.

The reverse direction is also required: every manifest route slug must resolve
to an English source page under `docs/user/en/`. A route entry without an
English source page is invalid even when `published` is `false`, because future
website route generation must not create placeholder 404 routes from manifest
data alone.

## Review Ownership

Before public launch, translated user docs and reviewed media need named review
ownership. `docs/user/review-ownership.json` is the tracked reviewer registry for
release-candidate checks; CODEOWNERS may add PR routing, but it does not replace
the machine-checkable registry.

Reviewer ownership controls must already exist before the first reviewed
localized page or reviewed media asset lands. A PR must not introduce
`status: "reviewed"` localized content or reviewed media in the same change
that first creates the reviewer registry or CODEOWNERS coverage.

`docs/user/review-ownership.json` must itself have an explicit CODEOWNERS entry
owned by maintainers or documentation leads, not only by the locale reviewers it
authorizes. This prevents a single PR from self-authorizing a new locale reviewer
and marking pages reviewed in the same change. The allowed CODEOWNERS for this
file are listed in `.github/docs-maintainers.json`; `check:docs-architecture`
must fail if the CODEOWNERS entry names anyone outside that allowlist.

Minimum ownership requirements:

- Each locale root has at least one named reviewer group or reviewer handle.
- Media replacement PRs require documentation-owner review and public-surface
  review.
- A non-English page cannot move from `draft` to `reviewed` unless the locale
  review metadata names the reviewer and review date.
- In release-candidate mode, a reviewed non-English page's
  `translation.reviewerHandle` must be listed under that locale in
  `docs/user/review-ownership.json`.
- In release-candidate mode, a reviewed media manifest's `review.reviewerHandle`
  must be listed under `media.reviewers` in `docs/user/review-ownership.json`.
- CODEOWNERS must explicitly cover `/docs/user/ja/`,
  `/docs/user/zh-Hans/`, `/docs/user/ko-KR/`, `/docs/user/assets/`, and
  `/docs/user/review-ownership.json` before any page or media asset under those
  paths can use `status: "reviewed"`.
- Release-candidate signoff must confirm that every public page and every
  reviewed media manifest has a current reviewer record.

`docs:user:check -- --release-candidate` validates the tracked reviewer
registry regardless of CODEOWNERS coverage, but CODEOWNERS is still required so
PR routing cannot rely only on self-declared frontmatter. In CI, set
`DOCS_REVIEW_OWNERSHIP_BASE_REF` to the target branch, such as `origin/main`,
so `check:docs-architecture` can verify that reviewer ownership controls
pre-existed the reviewed-content change.

## Public-Surface Gate Relationship

`docs:user:check` validates structure and localization completeness.
`npm run check:docs-public-surface` validates public-copy and IP safety.

Both must scan:

- Markdown body and frontmatter.
- User-doc JSON manifests.
- Alt text, captions, and transcript metadata.
- Generated route metadata from `apps/vivi2d-com/route-metadata.json`.

`check:docs-public-surface` must remain locale-aware. It should reject unsafe
compatibility claims, private implementation terminology, and unsupported
language-support claims in English, Japanese, Simplified Chinese, and Korean.

## Website Architecture

The first `vivi2d.com` website should be a product portal, not an application
shell and not the full documentation tree. It should introduce Vivi2D, explain
the public-release status, and route users to the dedicated documentation host.
This mirrors the split used by projects that keep a short home page on the main
domain and put long-form guides on a docs subdomain.

Recommended route shape:

```text
vivi2d.com/
docs.vivi2d.com/en/latest/
docs.vivi2d.com/ja/latest/
docs.vivi2d.com/zh-Hans/latest/
docs.vivi2d.com/ko-KR/latest/
docs.vivi2d.com/{locale}/latest/{slug}
```

Route behavior:

- `vivi2d.com/` shows a short product intro and a documentation language
  selector.
- `vivi2d.com/docs` is a compatibility entry point that redirects to
  `docs.vivi2d.com/en/latest/`.
- `docs.vivi2d.com/{locale}/latest/...` uses explicit locale routing.
- The `latest` segment is the initial channel. Future versioned docs may add
  additional channel names without changing the portal URL.
- Browser-language negotiation may suggest a locale, but user selection wins.
- The site must not silently render English body content on non-English routes.
- Search indexes are generated per locale.
- Route metadata is generated from page frontmatter and media manifests.

Deferred infrastructure decision:

- Domain registrar: Cloudflare Registrar.
- DNS: Cloudflare.
- First host: Cloudflare Pages or Vercel.
- DNS names: `vivi2d.com` for the portal, `docs.vivi2d.com` for user
  documentation, and future `api.vivi2d.com` / `cdn.vivi2d.com` records if they
  become useful.

Website scaffolding under `apps/vivi2d-com/` is intentionally minimal. It uses
`npm run docs:site:build` for local builds and `npm run docs:site:check` for
route-publication validation. The deployment target is Cloudflare Pages or
Vercel, with Cloudflare DNS. Local builds can generate same-origin docs links;
portal deployments should set `VIVI_DOCS_BASE_URL=https://docs.vivi2d.com` so
the root page links to the docs subdomain.

## Contributor Workflow

When adding or changing a user-doc page:

1. Add the English page first only as a local draft.
2. Add matching localized pages in all supported locales before opening the PR.
3. Add or update media manifests for referenced assets.
4. Keep placeholder media explicit with `status: "placeholder"`.
5. Run `npm run docs:user:check`.
6. Run `npm run check:docs-public-surface`.
7. For release-candidate docs, run `npm run docs:user:check -- --release-candidate`.

PRs that update public user docs should mention which pages changed, which
media assets were added or replaced, and whether translations are human-reviewed
or still draft.

When a non-English page moves to `status: "reviewed"`, use tooling to update
`translation.sourceContentHash`; contributors should not hand-write that digest.

## Implementation Status

Completed in the initial user-docs implementation slice:

- `docs/user/{en,ja,zh-Hans,ko-KR}/` now carries matching Markdown slugs for
  the starter user-documentation set.
- `docs/user/publication-manifest.json` explicitly controls publication for
  every English slug and every supported locale.
- `scripts/check-user-docs.mjs` validates frontmatter, locale parity,
  publication-manifest coverage, media manifests, release-candidate status, and
  reviewed translation source hashes.
- `scripts/check-user-docs.test.mjs` covers representative success and failure
  cases for publication routes, release-candidate drafts, translation hash
  requirements, and localized media metadata.
- Placeholder media manifests exist for the first workflow pages so later visual
  assets can be swapped without changing page contracts.
- `docs:user:check`, `docs:user:check:release`, and
  `check:docs-public-surface` are part of the normal quality-gate path.
- `apps/vivi2d-com/` builds a root portal with a documentation language
  selector, emits `/docs/` as a compatibility redirect, emits only
  publication-manifest routes under `/{locale}/latest/...`, and keeps
  deterministic route metadata in `apps/vivi2d-com/route-metadata.json`.
- `docs:site:check` proves unpublished routes are not generated and that the
  tracked route metadata matches the current publication manifest.

Deferred until the media and publication PR:

- Replace placeholder assets with reviewed screenshots and videos before any
  route is marked `published: true`.
