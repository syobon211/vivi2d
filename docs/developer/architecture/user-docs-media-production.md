# User Docs Media Production Design

This document defines the media pass for Vivi2D user documentation. It turns
placeholder screenshots and videos under `docs/user/assets/` into reviewed
public documentation media without weakening localization, publication, IP, or
security boundaries.

It complements:

- [User Docs And Website Architecture](user-docs-site.md), which owns the
  frontmatter, route, media manifest, website, and validation contracts.
- [User Docs Content Production Design](user-docs-content-production.md), which
  owns the English-first writing, localization, site-scaffold, and route
  promotion sequence.

## Goals

- Replace placeholder media with screenshots and videos that teach the workflow
  without requiring implementation knowledge.
- Keep every captured asset reproducible from synthetic public fixtures.
- Preserve locale parity for media-heavy pages across `en`, `ja`, `zh-Hans`,
  and `ko-KR`.
- Make media replacement intentionally invalidate translation review when the
  visual or media copy changes what a localized page describes.
- Keep public docs free of private artwork, local paths, tokens, credentials,
  stack traces, internal diagnostics, private deformation terminology, and
  unsupported third-party compatibility claims.
- Provide a repeatable review path before any route is marked
  `published: true`.

## Non-Goals

- Do not publish routes as part of the media pass by default. Publication is a
  separate promotion PR that runs gates on the final `published: true` tree.
- Do not capture private user artwork, client projects, issue repro files, or
  third-party product UI.
- Do not use screenshots or videos to document unstable internals, scanner
  mechanics, raw protocol payloads, provider payloads, or debug overlays.
- Do not treat a visually acceptable screenshot as a replacement for localized
  alt text, captions, transcripts, or reviewer ownership.

## Media Pass Order

Use this order for every media replacement batch:

1. Select the route slice and media IDs to replace.
2. Prepare or refresh synthetic public fixture projects.
3. Capture draft images and videos from the current app.
4. Update media manifests with localized alt text, captions, and transcripts.
5. Run authoring gates and inspect the generated site locally.
6. Request media, localization, public-copy, and IP review.
7. If a changed media ID is referenced by already reviewed localized pages,
   downgrade those localized pages to `status: "draft"` in the same PR before
   changing the media manifest. This keeps the tree structurally honest while
   review is stale.
8. Move media manifests to `status: "reviewed"` only after authorized review.
9. Refresh affected translation source hashes only after localized re-review
   and only through an approved helper that shares the same hash implementation
   as `scripts/check-user-docs.mjs`.
10. Promote routes only in a separate final-tree route promotion change.

The media pass may be split into multiple small PRs, but each PR must leave the
tracked docs in a structurally valid state. A PR must not create a temporary
state where a reviewed translation still claims to match old media metadata.

## Source Fixture Policy

Every final screenshot or video must be derived from a synthetic, reviewable
source fixture.

Allowed source material:

- Hand-made sample artwork created for Vivi2D documentation.
- Simple geometric or mascot-like fixtures created specifically for docs.
- Repository-generated fixtures with tracked provenance.
- Public-domain or permissively licensed material only when license, source,
  and transformation notes are recorded and the asset does not imply
  third-party product compatibility.

Disallowed source material:

- Private user projects, client artwork, bug-report attachments, or local
  machine screenshots.
- Third-party product logos, branded UI, marketplace assets, or compatibility
  comparison images.
- Screenshots containing real usernames, filesystem paths, access tokens,
  pairing codes, network credentials, issue URLs with private query strings, or
  local stack traces.
- Provider output that has not passed the same public-surface and provenance
  review as first-party media.

Recommended fixture layout for future media work:

```text
docs/user/source-fixtures/
  first-project/
    README.md
    fixture.json
  manual-image-split/
    README.md
    fixture.json
  auto-setup-review/
    README.md
    fixture.json
  viewer-api/
    README.md
    fixture.json
```

Fixture manifests should record source ownership, license/provenance, intended
pages, capture commands, and whether the fixture is safe for public screenshots.
They intentionally use `fixture.json`, not `manifest.json`, because
`docs/user/assets/**/manifest.json` is reserved for media manifests and is
validated by `scripts/check-user-docs.mjs`. If this directory is added, it must
be registered as a distinct user-doc JSON metadata surface and included in
`docs:user:check`, `check:docs-public-surface`, and release-surface scans before
the first fixture lands.

The first public media pass should use only Vivi2D-owned fixture artwork. If an
exception ever introduces third-party source material, the exception must add
license/provenance notes, update the third-party notices flow, and pass
`notices:check` before the asset can be reviewed.

## Capture Environment

Each reviewed media asset should be reproducible enough that another maintainer
can refresh it without guessing.

For every capture, record:

- app commit SHA,
- capture date,
- operating system,
- locale,
- theme,
- viewport size,
- display scale or device pixel ratio,
- source fixture ID,
- exact workflow state,
- capture command or script,
- post-processing command, if any.

Do not place this data in user-facing captions. It belongs in fixture manifests,
capture metadata, or PR notes. If a tracked capture metadata file is added
later, it should use a non-media name such as
`docs/user/media-reviews/<media-id>.capture.json`. It must not live under
`docs/user/assets/**/manifest.json`, because that path is reserved for media
manifests. Any new capture metadata path must be registered with
`check:docs-architecture`, `docs:user:check`, `check:docs-public-surface`, and
release-surface scans before it is used.

Capture metadata must be normalized before it is tracked:

- OS is recorded as family plus major version only, such as `Windows 11`.
- Commands use repository-relative paths.
- Hostnames, usernames, home directories, absolute local paths, shell history,
  environment variables, and credentials are forbidden.
- Capture commands must be reproducible without local machine names.

Default capture settings:

| Setting | Default | Notes |
| --- | --- | --- |
| Theme | dark | Matches OSS default app presentation. |
| Locale | page-specific | Use locale-specific captures when UI text is central. |
| Desktop viewport | `1280x720` | Baseline for workflow screenshots and videos. |
| Narrow viewport | `720x600` | Use for pages that teach responsive layout or dialogs. |
| Format, image | PNG source; optimized web derivative optional | Keep text legible. Avoid lossy JPEG for UI. |
| Format, video | WebM source; MP4 derivative optional | Public pages need captions or transcripts. |

## Capture Hygiene

Media files can carry hidden metadata even when the visible pixels look safe.
Every final asset must pass a hygiene step before being tracked.

Required cleanup:

- Strip EXIF, XMP, ICC comments, PNG textual chunks, and other image metadata
  that can reveal host software, user names, paths, or timestamps beyond the
  intentional capture date.
- Strip video container metadata using an equivalent of
  `ffmpeg -map_metadata -1`.
- Re-encode or rewrite assets only through deterministic commands recorded in
  capture metadata or PR notes.
- Inspect full-resolution pixels for private text, watermarks, local paths,
  tokens, debug overlays, and private project names.

`check:docs-public-surface` scans text files and SVG text, but it is not an OCR
or full OCR scanner. `npm run docs:media:check` validates media file type,
canonical asset paths, byte-size ceilings, common image/video metadata, and
unsafe SVG structure. The media reviewer remains the explicit line of defense
for full-resolution pixel text that cannot be detected without OCR.

## Locale And Variant Policy

Media variants are part of the localization contract. Do not rely on English
screenshots for non-English pages when visible UI copy is important.

Use `neutral` variants only when:

- the image contains no readable UI copy,
- the image is a diagram with locale-independent labels,
- the visual is decorative and the localized caption explains the user action,
  or
- locale-specific text would not change the instruction.

Use locale-specific variants when:

- the screenshot shows menu labels, dialog labels, warnings, or buttons that the
  user must find,
- the video demonstrates a localized workflow,
- the page text says to look for a visible label,
- text layout, clipping, or glyph rendering is part of the point being taught.

Media lookup order stays:

1. locale-specific asset,
2. neutral asset,
3. no fallback.

Non-English pages must never implicitly use an English-only image or video.

## Media Manifest Lifecycle

Media manifest status means:

| Status | Meaning | Publication behavior |
| --- | --- | --- |
| `placeholder` | A safe placeholder exists so pages can be authored. | Blocks public release for routes that reference it. |
| `draft` | Real media exists but review is incomplete. | Blocks public release for routes that reference it. |
| `reviewed` | Authorized media review is complete and metadata is current. | Allowed for published routes when page review also passes. |

The publication block is enforced by release-candidate gates, especially
`docs:user:check:release` and `check:release-surface`. The default
`docs:user:check` mode is an authoring gate and may allow unpublished draft
routes to reference placeholder or draft media.

When replacing a placeholder:

1. Keep the existing media ID stable unless the media now represents a different
   concept.
2. Replace or add asset files under `docs/user/assets/images/` or
   `docs/user/assets/videos/`.
3. Update manifest `status`, `variants`, `alt`, `caption`, and video transcript
   metadata.
4. Keep `topicSlugs` limited to pages that are allowed to reference the asset.
5. Run checks before changing any route publication state.

Manifest copy must be readable in every supported locale even while the media
is `placeholder` or `draft`. Mojibake and untranslated filler are not allowed
as tracked documentation content.

## Current Placeholder Inventory

The following placeholders already exist and should be replaced first:

| Manifest ID | Current kind | Route | Replacement target |
| --- | --- | --- | --- |
| `getting-started.first-project` | image | `getting-started/open-your-first-project` | Editor with a synthetic first project loaded, canvas visible, layers and properties understandable. |
| `manual-image-split.mask-editor` | image | `workflows/manual-image-split` | Manual Image Split workspace with accepted masks, quality warnings, and a clear synthetic subject. |
| `auto-setup.preview-panel` | image | `workflows/auto-setup` | Auto Setup review panel showing saved operations, discarded preview data, warnings, and no private diagnostic terms. |
| `viewer-api.browser-sample` | image | `workflows/viewer-api` | Browser sample connected through the public Viewer API client flow with tokens and local endpoints redacted or synthetic. |

Future media slots from the content-production design should not appear in page
frontmatter until a manifest exists.

## Per-Asset Capture Requirements

### First Project

Use a synthetic project that clearly shows:

- a loaded canvas,
- at least two layers with safe names,
- properties or canvas information updating,
- no local path or private filename,
- no unreleased feature labels unless the page explains them as experimental.

Prefer locale-specific screenshots because layer panels, toolbar labels, and
status text are likely visible.

### Manual Image Split

Use simple synthetic artwork with separable face, hair, body, or accessory
regions. The capture should show:

- the Manual Image Split workspace,
- one accepted or in-progress mask,
- a warning or quality panel when useful,
- user-facing tool names rather than internal algorithm names.

Do not capture private segmentation debug views, raw mask hashes, provider
proposal IDs, or internal worker diagnostics.

### Auto Setup Review Panel

The capture should teach what happens before Apply:

- saved operations,
- discarded preview data,
- actionable warnings,
- confidence or review status in user language,
- no private preview, solver, geometry, vertex, or deformation terminology.

If warnings are demonstrated, use a synthetic issue such as "outline may remain
visible" or "review this motion area" rather than raw internal metric names.
If the live UI itself displays forbidden public terminology, do not hide it with
cropping or post-processing. Treat the UI copy as a pre-publication blocker,
fix the UI first, and capture the corrected product surface.

### Viewer API Browser Sample

Use the public SDK or Viewer API sample path only. The capture must show:

- a successful local pairing or connection state,
- safe request status,
- revocation or disconnect affordance if visible,
- no bearer tokens, pairing secrets, localhost paths with private query
  strings, stack traces, or raw protocol payloads.

If the page needs protocol details, link to developer docs instead of placing
them in the user screenshot.

Prefer synthetic tokens produced by a fixture over post-capture redaction. If a
real token or URL ever appears in a draft capture, replace the capture rather
than blurring it. Single-color solid rectangles are the only acceptable
post-processing redaction; blur, mosaic, and pixelation are not acceptable
because they can preserve recoverable information.

## Video Requirements

Videos are useful for lasso smoothing, review panel flow, Viewer pairing, and
export verification. They also carry more public-surface risk than still
images.

Every final video needs:

- a matching manifest with `kind: "video"`,
- localized caption or transcript metadata for all supported locales,
- a poster image or fallback still once the manifest schema supports poster
  files and includes poster bytes in the translation source hash,
- no audio unless intentionally recorded and transcript-reviewed,
- no cursor movement over private data,
- no visible local filesystem path, terminal, browser profile, or private
  notification.

Reviewed videos are fail-closed today: `scripts/check-user-docs.mjs` rejects
`kind: "video"` with `status: "reviewed"` until localized captions/transcripts
and poster metadata are enforced by the validator. A scalar transcript is
allowed only for local draft experiments and must not satisfy reviewed video
status. If audio is necessary, provide locale-specific video variants or
locale-specific audio/caption tracks; otherwise prefer silent video with
localized captions or transcripts.

Video post-processing must not add burned-in English instructions to a
locale-neutral asset. If text overlays are necessary, create locale-specific
variants or use website captions outside the video file.

Before the first reviewed video lands, update the media manifest schema,
`scripts/check-user-docs.mjs`, `mediaSourceRecordForHash`, and website renderer
to support poster metadata. Poster path, poster file digest, and poster alt text
must participate in translation source hash calculation.

## Public-Copy And IP Safety

All media-related copy is public copy, even when the route is unpublished.

Allowed public wording:

- "saved operations",
- "discarded preview data",
- "review warnings",
- "cleanup",
- "local Viewer connection",
- "synthetic sample project".

Avoid public user-doc wording such as:

- private solver names,
- keyform, morph target, shape key, cage, lattice, or vertex delta terminology,
- raw provider model names,
- internal diagnostic IDs,
- scanner thresholds,
- compatibility claims with third-party products,
- "works like" or "compatible with" comparison language.

If a third-party format or tool must be mentioned in a user doc, the reference
must already be allowed by the locale-aware public-copy scanner and be framed as
an import/export or interoperability fact, not as a product-comparison claim.

## Accessibility

Media is part of the accessibility surface.

For every reviewed image:

- alt text must describe the user-relevant state, not merely say
  "screenshot",
- captions should explain why the image matters,
- all images need user-relevant localized alt text under the current schema.
  Decorative images should be avoided in the first public documentation slice
  unless a future schema adds an explicit `decorative` flag and validator
  support.

For every reviewed video:

- captions or transcripts are required before publication,
- action steps should be understandable without audio,
- flashing or rapid motion should be avoided,
- pause and replay controls must be provided by the site.

Alt text and captions must be reviewed in every supported locale before the
referencing route can be published.

## Translation And Source Hash Behavior

Media changes can invalidate reviewed translations. This is intentional.

`sourceContentHash` includes the ordered page media list and referenced media
metadata. A change to any of the following can require localized review refresh:

- page `media` frontmatter,
- manifest status,
- variant path,
- media file bytes,
- localized alt text,
- localized captions,
- transcript metadata.

Because media review coupling is global per referenced media ID, a Japanese
caption edit can invalidate a Korean page that references the same media ID.
That broad coupling is acceptable for the current release-prep phase because it
keeps media-heavy public docs conservative. If this becomes too noisy later,
split the hash into page text and locale-specific media-review hashes in a
separate architecture change.

Do not bulk-update stale translation hashes without rereading the affected
localized page against the new media.

An approved hash-refresh helper does not exist yet. Before the first PR that
keeps localized pages `reviewed` after media replacement, add a helper such as
`npm run docs:user:rehash` that shares the same normalization implementation as
`scripts/check-user-docs.mjs`. The helper must not silently preserve reviewed
status. It should either downgrade stale pages to draft or require an explicit
review-refresh input from an authorized reviewer.

## Review Ownership

Reviewed media requires an authorized reviewer from
`docs/user/review-ownership.json`. CODEOWNERS must already protect
`/docs/user/assets/` and the reviewer registry before a media manifest can move
to `status: "reviewed"`.

Media review must cover:

- source fixture provenance,
- absence of private data,
- hidden image/video metadata removal,
- full-resolution pixel inspection for private or forbidden text,
- localized alt/caption/transcript quality,
- UI readability,
- public-copy/IP safety,
- route relevance,
- file size and format suitability,
- whether route publication remains blocked or can proceed.

Locale review remains separate from media review. A media reviewer can approve
the asset as public-safe, but localized pages still need authorized locale
review before publication.

Reviewer ownership changes must be separate from media review PRs. Do not add a
new media reviewer and mark media `reviewed` in the same change. Until
`docs/user/review-ownership.json` defines a structured exception schema, no
single handle may appear under both `media.reviewers` and any `locales.*`
reviewer list. `scripts/check-user-docs.mjs` enforces that fail-closed rule.

## Local QA Checklist

Before requesting review, run:

```sh
npm run docs:user:check
npm run docs:media:check
npm run check:docs-public-surface
npm run docs:site:check
npm run check:docs-architecture
git diff --check
```

For media replacements that could be part of a public launch candidate, also
run:

```sh
npm run docs:user:check:release
npm run check:release-surface
```

If a change modifies capture tooling, website rendering, localized UI surfaces,
or workflow videos, add the relevant app or E2E gates in the PR description.
For example, a localized Auto Setup screenshot refresh should include the
workflow or visual smoke that proves the captured UI still renders correctly in
that locale.

## Media Gate: `docs:media:check`

The media gate is implemented by `scripts/check-user-docs-media.mjs`. It is a
blocking prerequisite before any media manifest moves to `status: "reviewed"`
and before any `published: true` route references final media.

Required checks:

- every referenced media file exists and has an expected type,
- file magic matches the manifest `kind` and extension,
- images stay within documented size and dimension limits,
- PNG, JPEG, WebP, SVG, WebM, and MP4 assets stay within documented byte-size
  limits,
- PNG/JPEG/WebP metadata is stripped or absent,
- video container metadata is stripped or absent,
- SVG text, title, desc, and metadata nodes are covered by public-surface scans,
- SVG URL-bearing presentation attributes are rejected, including local fragment
  `url(#...)` references, so documentation media stays simple and portable,
- reviewed video remains blocked until poster images plus localized captions or
  transcripts are schema-enforced,
- locale-specific media is required when visible UI text is central,
- neutral media does not contain English-only instructional text,
- future capture manifests, if present, reference safe source fixtures.

Reviewer authorization, `topicSlugs` ownership, and published-route media status
are also enforced by `docs:user:check`; both gates are required because they
cover different failure modes.

## Route Promotion Boundary

Media replacement and route publication are separate decisions.

A media PR may leave routes unpublished after replacing placeholders. A route
promotion PR should be small and should:

1. start from already-reviewed text and media,
2. flip the target route's `published` flag to `true`,
3. intentionally set navigation and search flags,
4. run release gates on that final tree,
5. merge only when every locale, media asset, route metadata, and public-surface
   scan passes.

Do not claim that a pre-promotion green run proves publication readiness. The
final `published: true` tree is the only state that matters for route launch.
