# User Docs Content Production Design

This document defines how Vivi2D should turn the tracked `docs/user/`
structure into publication-ready user documentation while deferring final
screenshots and videos to a later media pass.

It complements [User Docs And Website Architecture](user-docs-site.md), which
owns the route, frontmatter, localization, media, and validation contracts.
The later screenshot and video replacement pass is defined in
[User Docs Media Production Design](user-docs-media-production.md).

## Goals

- Make English user docs useful enough to guide a new user without screenshots.
- Keep Japanese, Simplified Chinese, and Korean pages synchronized with the
  English source instead of drifting as separate drafts.
- Prepare a minimal `vivi2d.com` documentation shell without publishing draft
  or placeholder routes.
- Keep screenshots and videos out of this content pass except for stable media
  IDs, manifest references, and explicit future replacement notes.

## Non-Goals

- Do not capture or replace final screenshots and videos in this pass.
- Do not mark localized pages `reviewed` unless the translation review metadata
  is current and the reviewer is authorized by `docs/user/review-ownership.json`.
- Do not mark any route `published: true` until the page text, localized copy,
  media assets, public-surface scan, and release-candidate docs check all pass.
- Do not add a CMS or duplicate user docs outside `docs/user/`.

## Production Order

The work should move in this order:

1. Stage A: English canonical content.
2. Stage B: localized content for `ja`, `zh-Hans`, and `ko-KR`.
3. Stage C: minimal `vivi2d.com` site scaffold.
4. Later media pass: final screenshot/video replacement and release-candidate
   promotion.

This order keeps the source text stable before translation and lets the future
site consume the same validation rules before any public route is enabled.

The labels above intentionally replace earlier ad-hoc numbering. In the product
discussion, Stage A corresponds to item 1, Stage B corresponds to item 3, and
Stage C corresponds to item 4 because final media insertion is deferred.

## Publication Readiness Workflow

The `docs/user/` structure, route manifest, reviewer registry, and validation
gates define how pages become publication-ready without weakening the current
safety model.

Use this workflow for documentation PRs that move pages toward publication:

1. Inventory the current route set and keep every route unpublished.
2. Rewrite English P0/P1 pages until they are useful without screenshots.
3. Add or update placeholder media manifests before adding media IDs to page
   frontmatter.
4. Draft localized pages for the same P0/P1 route set.
5. Keep localized pages as `draft` until authorized human review is complete.
6. Replace placeholder media in a later media pass.
7. Bind reviewed translations to the current English source and media metadata.
8. Promote only complete routes in `docs/user/publication-manifest.json`.

Do not combine route publication with broad content rewrites. Route promotion
should be a small, reviewable change after text, localized copy, media, and
release-candidate gates are already green.

## Route Publication Priorities

### P0: First Successful Session

These pages help a new user reach a loaded project and understand the primary
creation path.

| Slug | Audience | Outcome | Media coverage |
| --- | --- | --- | --- |
| `getting-started/install` | artist, rigger | Install or launch Vivi2D safely. | Future optional install visual; no current manifest. |
| `getting-started/first-launch` | artist, rigger | Understand the first screen, language, theme, and no-project state. | Future optional launch visual; no current manifest. |
| `getting-started/open-your-first-project` | artist, rigger | Open a project or artwork and verify canvas, layers, and properties update. | Current manifest: `getting-started.first-project`. |
| `workflows/psd-to-rig` | artist, rigger | Understand the high-level path from layered art to a reviewed starting rig. | Future optional overview visual; no current manifest. |
| `workflows/manual-image-split` | artist, rigger | Split flat artwork into accepted masks before Auto Setup. | Current manifest: `manual-image-split.mask-editor`; future optional lasso video. |
| `workflows/auto-setup` | artist, rigger | Generate and review a safe starting setup. | Current manifest: `auto-setup.preview-panel`; future optional saved/discarded visual. |

### P1: Preview, Export, And Recovery

These pages make the product understandable after the first rigging pass.

| Slug | Audience | Outcome | Media coverage |
| --- | --- | --- | --- |
| `workflows/viewer` | streamer, artist | Load and inspect a model in the Viewer. | Future Viewer visuals; no current manifest. |
| `workflows/export` | artist, rigger | Choose the right export path and verify output. | Future export visuals; no current manifest. |
| `workflows/viewer-api` | developer, streamer | Understand local Viewer API pairing and safe connection basics. | Current manifest: `viewer-api.browser-sample`; future optional pairing video. |
| `troubleshooting/import-errors` | artist, rigger | Recover from unsupported, corrupt, or unexpected input files. | Future synthetic troubleshooting visual; no current manifest. |
| `troubleshooting/display-and-gpu` | artist, streamer | Diagnose blank canvas, GPU, and display issues. | Future synthetic troubleshooting visual; no current manifest. |
| `troubleshooting/localization` | all | Change language and report localization issues safely. | Future locale settings visual; no current manifest. |

### P2: Reference And FAQ

These pages can ship after P0/P1, but a coherent public documentation slice is
better when they are present in draft form.

| Slug | Audience | Outcome | Media coverage |
| --- | --- | --- | --- |
| `reference/file-formats` | artist, developer | Know what files are supported and what is experimental. | none initially |
| `reference/keyboard-shortcuts` | artist, rigger | Find shortcuts without opening the app. | Future shortcut dialog visual; no current manifest. |
| `reference/settings` | all | Understand language, theme, and workflow settings. | Future settings menu visual; no current manifest. |
| `faq` | all | Answer common early questions. | none initially |

## Page-Level Writing Notes

Use the task-page shape defined in [Stage A](#stage-a-english-canonical-content).
Reference pages can use tables, but still need a one-sentence outcome, caveats
for the current release status, "when to use this" framing, and links back to
workflows.

Per-page requirements:

- `getting-started/install`: explain the current release status, where build or
  local development instructions live, and what to do if no packaged build is
  available yet. Do not promise release artifacts before they exist.
- `getting-started/first-launch`: explain the English default, dark default,
  settings menu, and no-project state.
- `getting-started/open-your-first-project`: start with a copy of artwork,
  describe supported inputs at a high level, and verify canvas, layers, and
  properties.
- `workflows/psd-to-rig`: frame Auto Setup as a reviewed starting point, not
  one-click perfect rigging.
- `workflows/manual-image-split`: explain accepted masks, lasso/brush choices,
  warnings, and why preview underpaint is not automatically applied.
- `workflows/auto-setup`: explain detection level, saved operations, discarded
  preview data, warnings, and when to cancel instead of applying.
- `workflows/viewer`: explain model loading, backgrounds, HUD, reactions, and
  the difference between previewing and authoring.
- `workflows/export`: explain available export targets, experimental caveats,
  and safe output verification.
- `workflows/viewer-api`: explain local-only pairing, scopes, and revocation in
  user language. Keep protocol details in developer docs.
- Troubleshooting pages: use only synthetic errors, never stack traces, local
  paths, scanner internals, or raw provider payloads.

The bullets above are authoring requirements. When turning them into user copy,
use user-visible labels and actions rather than internal diagnostic or
implementation vocabulary.

## Media Slot Inventory

The current manifest IDs below already exist and can be used in page
frontmatter, but they are placeholders unless their manifest says
`status: "reviewed"`. Manifest existence is not publication readiness. Future
slots are named as coverage requirements, not as valid frontmatter IDs. Create
or update a media manifest before adding any future slot to page frontmatter.

| Slot | Manifest state | Kind | Used by |
| --- | --- | --- | --- |
| First project import | Current placeholder: `getting-started.first-project` | image | `getting-started/open-your-first-project` |
| Manual split mask editor | Current placeholder: `manual-image-split.mask-editor` | image | `workflows/manual-image-split` |
| Auto Setup review panel | Current placeholder: `auto-setup.preview-panel` | image | `workflows/auto-setup` |
| Viewer API browser sample | Current placeholder: `viewer-api.browser-sample` | image | `workflows/viewer-api` |
| Install or launch state | Future manifest required before use | image | `getting-started/install`, `getting-started/first-launch` |
| PSD-to-rig overview | Future manifest required before use | image | `workflows/psd-to-rig` |
| Lasso smoothing workflow | Future manifest required before use | video | `workflows/manual-image-split` |
| Saved versus discarded Auto Setup review | Future manifest required before use | image | `workflows/auto-setup` |
| Viewer loaded model and side sheet | Future manifest required before use | image | `workflows/viewer` |
| Export dialog and result check | Future manifest required before use | image | `workflows/export` |
| Synthetic troubleshooting visuals | Future manifest required before use | image | `troubleshooting/*` |
| Shortcut and settings reference visuals | Future manifest required before use | image | `reference/keyboard-shortcuts`, `reference/settings` |

Media naming rules:

- Use `.neutral` when the visual has little or no readable UI copy.
- Use locale-specific assets when UI labels are central to the instruction.
- Never use English media as fallback for non-English pages.
- Every final video needs captions or transcript metadata before publication.

## Minimal Slice Selection Criteria

A small public slice is safer than publishing every page at once. Select routes
that form a complete user journey and avoid areas whose public behavior is not
stable yet.

A coherent first slice should usually include:

- one entry page that explains the initial app state,
- one page for opening or importing artwork,
- one page for preparing flat or layered artwork,
- one page for Auto Setup review,
- one page for Viewer preview,
- at least one troubleshooting page for import or localization confusion,
- the FAQ if it answers launch-blocking questions.

`getting-started/install` may stay unpublished until packaged release artifacts
exist. `workflows/psd-to-rig` may stay unpublished if it is still only a concept
overview. `workflows/viewer-api`, `workflows/export`, and deep reference pages
should stay unpublished until their public behavior and screenshots are stable.

## Publication Promotion Checklist

Route-promotion gates must run on the final tree, after the target route entry
has `published: true`. A pre-promotion green run is useful while preparing
content, but it does not prove that the site, sitemap, search metadata,
navigation, media-review checks, and route-publication checks exercise the route
as published.

Use this sequence for each route-promotion PR:

1. Complete English, localized pages, reviewed media, and reviewer ownership.
2. Change only the target route entry to `published: true`, with navigation and
   search flags set intentionally.
3. Run the release gates on that final tree.
4. Merge only if the final tree is green.

The root locale-selector route (`slug: ""`) can be promoted only when it is
`status: "reviewed"`, has deterministic localized route metadata, and the site
build emits no unpublished documentation routes.

When promoting a route, change the existing route entry in place while keeping
the file-level `locales` array, which is a sibling of `routes`, and all other
route entries intact:

```json
{
  "slug": "workflows/auto-setup",
  "published": true,
  "includeInNavigation": true,
  "includeInSearch": true
}
```

The final tree must satisfy:

- English page is `status: "reviewed"`.
- All three localized pages are reviewed by authorized reviewers.
- Referenced media is reviewed.
- Media alt, caption, and transcript metadata is complete.
- No route relies on placeholder images or videos.
- `docs:user:check:release` passes.
- `docs:site:check` passes.
- `check:docs-architecture` passes.
- `check:docs-public-surface` passes.
- `check:release-surface` passes.

## Stage A: English Canonical Content

English pages are the canonical source for slug shape, content structure,
translation binding, and website metadata. They should be written first and
kept in `status: "draft"` until the media pass and release review are done.

### Priority Set

Author pages in this order:

| Priority | Slugs | Purpose |
| --- | --- | --- |
| P0 | `getting-started/install`, `getting-started/first-launch`, `getting-started/open-your-first-project` | Get a first-time user to a loaded project. |
| P0 | `workflows/psd-to-rig`, `workflows/manual-image-split`, `workflows/auto-setup` | Explain the main creation workflow from source art to a starting rig. |
| P1 | `workflows/viewer`, `workflows/export`, `workflows/viewer-api` | Explain preview, export, and external integration basics. |
| P1 | `troubleshooting/import-errors`, `troubleshooting/display-and-gpu`, `troubleshooting/localization` | Give safe, user-facing recovery paths. |
| P2 | `reference/file-formats`, `reference/keyboard-shortcuts`, `reference/settings`, `faq` | Provide lookup material after the core workflow is understandable. |

The root locale selector, `docs/user/index.md`, stays short and should not
carry product claims that are not also supported by the user-doc pages.

### Page Shape

Every English page should use task-oriented sections unless the page is a
reference page:

```text
# Title
One-sentence outcome.

## What You Need
Short prerequisites.

## Steps
Numbered actions.

## Check Your Result
Observable success state.

## If Something Looks Wrong
Safe recovery paths and links.

## Next
The next useful page.
```

Reference pages may replace `Steps` with categorized tables, but they still
need a short outcome, safe caveats, and related links.

### Writing Rules

- Prefer user-visible terms such as "layer", "mask", "Auto Setup", "Viewer",
  "warning", and "cleanup".
- Avoid implementation terms such as private solver names, preview geometry,
  internal package names, raw protocol payloads, and scanner mechanics.
- Explain what will be saved and what remains preview-only when the distinction
  affects the user's trust.
- Keep troubleshooting output synthetic. Do not paste local stack traces,
  filesystem paths, provider payloads, or private artwork names.
- Keep each page usable without final screenshots by naming the panel, button,
  or visible UI state the user should look for.
- `npm run check:docs-public-surface` scans all committed `docs/user/` content,
  including draft and unpublished pages. Do not rely on publication-manifest
  exclusion to hide unsafe copy, private terminology, local paths, or
  unsupported compatibility claims.

### Media-Free Authoring Rule

Pages may keep `media` frontmatter IDs that point to placeholder manifests, but
the body text must not depend on an unavailable screenshot for comprehension.

Allowed wording:

```text
The Auto Setup review panel lists saved operations, discarded preview data, and
warnings before you apply the result.
```

Avoid wording that blocks understanding until the media pass:

```text
Click the highlighted item in the screenshot below.
```

If a visual is necessary, write the explanation as text first and leave the
media as supporting material for the later replacement pass.

### English Completion Criteria

The English content pass is complete when:

- Every P0 and P1 slug has practical user-facing body text.
- Every page links to the next page or a troubleshooting page where appropriate.
- `npm run docs:user:check` passes.
- `npm run check:docs-public-surface` passes.
- No page uses screenshot-only instructions.
- Placeholder media remains explicit and every referenced media ID has a
  manifest.

## Stage B: Localized Content

Localized pages are peer user docs, not thin placeholders. They should preserve
the English workflow order and safety boundaries while using natural Japanese,
Simplified Chinese, and Korean.

### Translation Source Of Truth

- English remains `sourceLocale: "en"`.
- The localized page's `translation.sourceSlug` must match the English slug.
- `translation.sourceContentHash` must be generated from the current English
  source using the checker-defined normalization, including page media IDs.
- Contributors should not hand-write source hashes. Release review should use
  repo tooling or reviewer-owned scripts that call the same hash implementation
  as `scripts/check-user-docs.mjs`. If a dedicated helper command is added, it
  must replace ad-hoc hash update instructions in tracked docs.
- A matching `sourceContentHash` proves only that the translation review is
  current for the English source and referenced media metadata. It does not
  replace authorized reviewer ownership.

### Localization Sequence

For each English page that reaches the English completion criteria:

1. Update `ja`, `zh-Hans`, and `ko-KR` body text.
2. Keep `status: "draft"` until human review is complete.
3. Run `npm run docs:user:check`.
4. Run `npm run check:docs-public-surface`.
5. Run `npm run check:docs-architecture` when review ownership, CODEOWNERS,
   publication metadata, or user-doc contracts change.
6. Move a localized page to `status: "reviewed"` only when the reviewer is
   authorized, the current source hash is recorded, and reviewer ownership
   controls already existed before this reviewed-content change.

### Translation Quality Rules

- Preserve product names and UI labels exactly when they are visible in the app.
- Translate explanatory text naturally instead of mirroring English sentence
  order.
- Avoid claiming compatibility with third-party products or formats beyond the
  explicit file-format support documented in tracked reference pages.
- Do not introduce Traditional Chinese support claims into `zh-Hans` pages.
- Do not translate internal diagnostics, code identifiers, or package names
  unless the page is intentionally a developer-facing page, which user docs are
  not.

### Review States

Use these states consistently:

| State | Meaning | Public launch behavior |
| --- | --- | --- |
| `draft` | Translated or in-progress text exists, but review is not complete. | Allowed only for unpublished routes. |
| `reviewed` | Authorized human review is current for the English source hash. | Required for published routes. |
| `stub` | Local scratch only. | Must not be committed. |

### Localized Completion Criteria

The localized content pass is complete when:

- Each P0 and P1 English page has non-placeholder localized body text in all
  three non-English locales.
- Localized pages preserve the same workflow sequence and safety warnings.
- No localized page silently falls back to English body copy.
- `npm run docs:user:check` passes.
- `npm run check:docs-public-surface` passes.
- `npm run check:docs-architecture` passes for changes to review ownership,
  CODEOWNERS, publication metadata, or documentation contracts.
- Before the first localized page or media asset is marked `reviewed`, the
  target branch already contains CODEOWNERS coverage for
  `/docs/user/ja/`, `/docs/user/zh-Hans/`, `/docs/user/ko-KR/`,
  `/docs/user/assets/`, and `/docs/user/review-ownership.json`.
- The CODEOWNER for `docs/user/review-ownership.json` must be listed in
  `.github/docs-maintainers.json` under the review ownership owner allowlist.
- Release-candidate mode may still fail while authoring is in progress because
  the root locale selector is not reviewed, published routes reference
  non-reviewed media, or reviewed translation hashes have drifted. It should not
  fail because of malformed localization metadata.

## Stage C: Minimal `vivi2d.com` Site Scaffold

The site scaffold should prove that tracked docs can become a website without
duplicating content or publishing drafts.

### Scaffold Scope

The initial scaffold lives in `apps/vivi2d-com/`. It names:

- web-infrastructure owner: Vivi2D maintainers until a dedicated web owner is
  assigned,
- build command: `npm run docs:site:build`,
- local validation command: `npm run docs:site:check`,
- deployment target: Cloudflare Pages or Vercel,
- generated-route public-surface scan command:
  `npm run check:docs-public-surface`.

The first scaffold should include:

- a route generator that reads `docs/user/publication-manifest.json`,
- Markdown/frontmatter loading that reuses the same validation contract as
  `docs:user:check`,
- explicit locale routes under `/{locale}/latest/...` for the docs host,
- a root portal with a documentation language selector,
- generated route metadata for published routes only,
- no route, sitemap entry, search record, or metadata for unpublished routes.
- generated route metadata for published routes is included in
  `npm run check:docs-public-surface`.

### Publication Manifest Rules

The website must not publish by walking the filesystem. It must publish only
routes with `published: true` in `docs/user/publication-manifest.json`.

For each unpublished route:

- no page route is emitted,
- no sitemap entry is emitted,
- no search record is emitted,
- no Open Graph or route metadata file is emitted,
- no navigation link points to the route.

For each published route:

- every locale must have a page,
- every locale page must be `status: "reviewed"`,
- referenced media must be reviewed or intentionally omitted from the route,
- release-candidate docs checks and public-surface checks must pass.

### Site Localization Rules

- `/docs/en/...`, `/docs/ja/...`, `/docs/zh-Hans/...`, and `/docs/ko-KR/...`
  are explicit routes.
- Browser-language detection may suggest a locale on the root route, but it
  must not rewrite user choice.
- Non-English routes must never render English body content.
- Search indexes are locale-specific.
- Generated metadata must use localized frontmatter, not English fallback.

### Site Scaffold Completion Criteria

The scaffold is ready when:

- `apps/vivi2d-com/` can build from tracked docs without a CMS.
- `npm run docs:site:check` proves unpublished draft pages are not routable.
- Generated route metadata is tracked in `apps/vivi2d-com/route-metadata.json`
  and included in `npm run check:docs-public-surface`.
- The build and validation commands are documented in developer docs.
- The deployment target is recorded as Cloudflare Pages or Vercel, with DNS
  managed by Cloudflare.

## Later Media Pass

The final screenshot/video pass should happen after the English and localized
text is stable. Follow
[User Docs Media Production Design](user-docs-media-production.md) for source
fixture policy, capture requirements, locale variants, accessibility metadata,
review ownership, and gates. That pass should:

- replace placeholder manifests with reviewed images and videos,
- add localized alt text, captions, and transcripts,
- run public-surface checks over media metadata,
- run layout and route smoke checks for all four locales,
- update publication manifest entries only after media and text are ready.

This separation prevents media churn from invalidating translation review while
the written workflow is still changing.

### Media Replacement Re-Review Runbook

Replacing placeholder media is expected to invalidate reviewed translations when
the English page's `media` list, referenced media metadata, or referenced media
file bytes change. This is a feature of `sourceContentHash`, not a failure mode:
screenshots and videos can change what the localized page is describing.
Media review coupling is global per referenced media ID: changing Japanese alt
text, Korean captions, a neutral image file, or any other public media metadata
for that ID invalidates every reviewed translation that references it. Keep
routes unpublished until the affected locale reviewers refresh the pages.

For each media replacement PR:

1. Replace the placeholder asset and update its manifest, localized alt text,
   caption, and transcript metadata.
2. Run `npm run docs:user:check` to identify every localized page whose
   reviewed source binding became stale.
3. Re-read the affected localized pages against the new media.
4. Update `translation.sourceContentHash` only through the approved hash
   generation path that shares code with `scripts/check-user-docs.mjs`.
5. Require the authorized locale reviewer to refresh `reviewDate` before the
   page can remain `status: "reviewed"`.
6. Run `npm run docs:user:check:release` and
   `npm run check:docs-public-surface` before any route is marked
   `published: true`.

Do not bulk-update stale hashes without re-review. If many pages become stale
after one media pass, keep the affected routes unpublished until review catches
up.

## Required Gates

For content-only changes:

```sh
npm run docs:user:check
npm run check:docs-public-surface
npm run check:docs-architecture
```

Gate ownership:

- `docs:user:check` is backed by `scripts/check-user-docs.mjs`.
- `check:docs-public-surface` is backed by
  `scripts/check-docs-public-surface.mjs` and scans committed documentation
  surfaces, not only published routes.
- `check:docs-architecture` is backed by
  `scripts/check-docs-architecture.mjs` and protects documentation structure,
  registered user-doc JSON surfaces, contributor-facing doc contracts, and
  reviewer ownership routing for reviewed localized content. In CI, run it with
  `DOCS_REVIEW_OWNERSHIP_BASE_REF` set to the target branch when a PR introduces
  reviewed localized pages or reviewed media.

For release-candidate content:

```sh
npm run docs:user:check:release
npm run check:docs-public-surface
npm run check:docs-architecture
npm run check:release-surface
```

`check:release-surface` is backed by `scripts/check-release-surface.mjs` and is
part of the broader release-quality gate. It does not replace
`docs:user:check:release`; both are required because route publication and
package/release-surface safety are different concerns.

For website scaffold changes, run the site build, generated route metadata
scan, and focused route-publication test:

```sh
npm run docs:site:build
npm run docs:site:check
npm run check:docs-public-surface
```
