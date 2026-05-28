# Documentation Architecture

This document defines where Vivi2D documentation should live before the first
public OSS release. It is intentionally about information architecture, not
feature planning. Historical roadmap and review-loop notes should move out of
the tracked documentation tree before publication.

## Current Status

The initial documentation migration has been applied:

- canonical contributor, API, IP, security, release, ADR, and baseline docs live
  under `docs/developer/`
- localized user-doc skeletons live under `docs/user/`
- historical roadmap, plan, design, and audit files are archived locally under
  ignored `docs/backlog/`
- tracked archival decisions live in
  `docs/developer/quality/docs-migration-manifest.json`

Future documentation changes should preserve this layout and update the
relevant gates when paths or public documentation surfaces change.

## Goals

- Keep the repository root README short, English-only, and easy to scan.
- Keep contributor-facing documentation English-only and versioned with code.
- Keep user-facing documentation localized for every supported UI locale:
  `en`, `ja`, `zh-Hans`, and `ko-KR`.
- Move design roadmaps, review scratchpads, and implementation planning notes
  into an ignored backlog so they do not become accidental public promises.
- Preserve machine-readable baselines, ADRs, release policies, IP policy,
  security policy, and specs as tracked developer documentation.
- Make the future `vivi2d.com` site consume tracked user documentation and
  media assets without mixing those assets into the root README.

## Reference Shape

The root README should follow the same spirit as small OSS package READMEs such
as `vercel-labs/wterm`: project summary, packages/features, development setup,
and license. It should not become a manual.

The user docs should follow the broad shape of Inochi2D-style documentation:
product sections, getting started paths, first-model workflows, reference
topics, FAQ, and language-specific pages. Vivi2D should make this more
workflow-first and media-heavy.

## Top-Level Layout

```text
README.md
CHANGELOG.md
LICENSE
SECURITY.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md

docs/
  developer/
  user/
  backlog/              # ignored; local-only historical roadmap archive

apps/
  vivi2d-com/           # minimal portal scaffold and route metadata
```

`docs/backlog/` already exists in `.gitignore`. Files placed there should not be
tracked. If a tracked roadmap is archived there, remove it from the Git index
instead of committing it at the new path.

## Root README

`README.md` is English-only and should contain only:

- one-sentence project description
- current pre-1.0 status
- package/workspace overview
- install/setup commands
- build/test commands
- links to user docs and developer docs
- license

It should not contain:

- detailed workflows
- feature roadmaps
- historical design decisions
- screenshots or large media galleries
- long API references
- legal/IP analysis beyond short links
- localized copies

## Developer Documentation

Developer docs are English-only and tracked under `docs/developer/`.

Recommended structure:

```text
docs/developer/
  index.md
  documentation-architecture.md
  architecture/
    overview.md
    system-map.md
    package-graph.md
    editor-runtime-boundary.md
  contributing/
    setup.md
    testing.md
    task-guides/
      index.md
      viewer-api.md
      auto-setup.md
      i18n.md
      sdk-samples.md
    pr-recipes.md
    troubleshooting.md
    package-boundaries.md
    release-process.md
    documentation.md
    i18n/
  security/
    threat-model.md
    security-policy.md
    ipc-and-local-api.md
  ip/
    policy.md
    clean-room-notes/
      mask-shape-handle-suggestions.md
  api/
    index.md
    spec/
      runtime-spec-v1.md
    migrations/
    web-sdk.md
    viewer-api.md
    provider-sdk.md
  quality/
    release-policy.md
    public-release-checklist.md
    public-api-status.md
    docs-migration-manifest.json
    baselines/
  adr/
```

ADR files under `docs/developer/adr/` should keep the existing numbered
convention: `NNNN-short-kebab-title.md`, where `NNNN` is a zero-padded
monotonic sequence. Each ADR should include status, context, decision, and
consequences sections.

Versioned specifications use parallel files, not in-place rewrites. Runtime
spec revisions live under `docs/developer/api/spec/` so the spec files,
versioning index, and migration notes stay in one API documentation domain. For
example, `runtime-spec-v1.md` remains immutable except for clarifications, while
a breaking revision becomes `runtime-spec-v2.md` and must be introduced by an
ADR plus migration/conformance notes. The API index should link every active
and historical spec version and link to the authoritative support-status
ledger. Any PR that adds a new `runtime-spec-vN.md` file must update
`docs/developer/api/index.md` and add migration/conformance notes under
`docs/developer/api/migrations/` in the same PR. Each `runtime-spec-vN.md` file
must link back to `docs/developer/api/index.md` so direct readers can find newer
or older spec versions. `docs/developer/architecture/overview.md` must link to
`api/index.md` for the runtime spec versioning index so architecture readers
can discover the active and historical spec list without owning spec
versioning.

SDK and protocol API references use the same rule once they become
experimental/public compatibility surfaces. Before that point, `web-sdk.md`,
`viewer-api.md`, and `provider-sdk.md` describe the current preview shape and
may change in place. For this policy, "a stable version is first promised"
means a PR explicitly sets that API/protocol document's frontmatter to
`stability: stable` and updates
`docs/developer/quality/public-api-status.md` to mark the same surface stable.
That same PR must rename the unversioned file to an explicit `*-v1.md` file
and update `api/index.md`. After that, breaking revisions must be added as
parallel files such as `web-sdk-v2.md`, `viewer-api-v2.md`, or
`provider-sdk-v2.md`, with `api/index.md` linking each version and the matching
notes under `docs/developer/api/migrations/`.

`docs/developer/api/index.md` is only a navigation index for API/spec
references and versioned links. It should link to
`docs/developer/quality/public-api-status.md`, but it should not maintain its
own independent status ledger. `docs/developer/quality/public-api-status.md` is
the release-gate status ledger: it records which packages/APIs are internal,
experimental, or public and which gates remain before promotion.

Developer-doc files have these initial responsibilities:

| New file | Responsibility |
| --- | --- |
| `docs/developer/index.md` | developer-doc landing page linking architecture, contributing, security, IP, API, quality, ADR sections, and this documentation architecture |
| `docs/developer/architecture/overview.md` | architecture landing page; links package graph, editor/runtime boundary, and `api/index.md` for runtime spec/version navigation |
| `docs/developer/architecture/system-map.md` | high-level Editor, Viewer, SDK, Runtime, Provider, and trust-boundary diagrams |
| `docs/developer/architecture/package-graph.md` | package dependency graph, allowed dependency directions, and workspace ownership map |
| `docs/developer/architecture/editor-runtime-boundary.md` | boundary between editor-only authoring data, runtime/public payloads, and SDK-facing surfaces |
| `docs/developer/contributing/setup.md` | local development setup and required tool versions |
| `docs/developer/contributing/testing.md` | test matrix, common gates, and when to run expensive E2E |
| `docs/developer/contributing/task-guides/` | task-oriented contributor maps for common change areas |
| `docs/developer/contributing/pr-recipes.md` | common pull-request checklists for UI, E2E, public API, and user-doc changes |
| `docs/developer/contributing/troubleshooting.md` | sanitized contributor troubleshooting for common gate failures |
| `docs/developer/contributing/package-boundaries.md` | contributor-facing rules that enforce the dependency directions and ownership boundaries documented in `architecture/package-graph.md` |
| `docs/developer/contributing/release-process.md` | release candidate flow, publication checklist links, branch/tag conventions, and release artifact handoff rules |
| `docs/developer/contributing/documentation.md` | authoring style, localization workflow, and media naming conventions; owns the written spec for `docs:user:check` behavior; defers to this file for structural IA rules |
| `docs/developer/security/threat-model.md` | detailed attack-surface inventory, trust boundaries, assumptions, and out-of-scope threats |
| `docs/developer/security/security-policy.md` | developer-facing security policy, gate ownership, and links to `threat-model.md` for the authoritative boundary model |
| `docs/developer/security/ipc-and-local-api.md` | Electron IPC, local Viewer API, loopback, token, and Origin boundary guidance |
| `docs/developer/api/index.md` | API/spec navigation only |
| `docs/developer/api/spec/` | versioned runtime specification files |
| `docs/developer/api/migrations/` | migration and conformance notes for runtime spec, SDK, and protocol version changes |
| `docs/developer/api/web-sdk.md` | Web SDK current/preview API reference |
| `docs/developer/api/viewer-api.md` | Viewer API current/preview protocol and client API reference |
| `docs/developer/api/provider-sdk.md` | Provider SDK current/preview API reference |
| `docs/developer/quality/release-policy.md` | release policy, supported publication channels, and release gate ownership |
| `docs/developer/quality/public-release-checklist.md` | public-release checklist, including documentation signoff and the selected Git history publication model |
| `docs/developer/quality/public-api-status.md` | public API/package status ledger |
| `docs/developer/quality/docs-migration-manifest.json` | machine-checkable record of archived planning docs, promoted targets, and explicit drop rationales |

`@vivi2d/web` implementation work remains gated by
`npm run check:sdk-unlock:web`. That command permits the current Phase 1
programmatic SDK implementation work only; it does not approve npm publication
or a stable compatibility promise.

Localization contributor metadata under `docs/developer/contributing/i18n/`
should preserve the current two-file shape unless a future i18n PR deliberately
splits it:

```text
docs/developer/contributing/i18n/
  README.md
  translation-review-manifest.json
```

`docs/developer/contributing/documentation.md` owns the general documentation
authoring and localization workflow. `docs/developer/contributing/i18n/README.md`
is narrower: it explains how to update
`translation-review-manifest.json`, how reviewer assignments are recorded, and
which locale-review metadata must be refreshed when strings change.
Localized user-facing guides belong under `docs/user/{locale}/...`.

## User Documentation

User docs are tracked under `docs/user/` and localized for every supported UI
locale. The content should be written for artists, riggers, streamers, and
people evaluating Vivi2D, not for repository contributors.
The detailed frontmatter, media, route, and website contract lives in
[`architecture/user-docs-site.md`](architecture/user-docs-site.md).

Recommended structure:

```text
docs/user/
  index.md
  assets/
    images/
    videos/
    thumbnails/
  en/
    index.md
    getting-started/
      install.md
      first-launch.md
      open-your-first-project.md
    workflows/
      psd-to-rig.md
      manual-image-split.md
      auto-setup.md
      viewer.md
      export.md
    reference/
      file-formats.md
      keyboard-shortcuts.md
      settings.md
    troubleshooting/
      import-errors.md
      display-and-gpu.md
      localization.md
    faq.md
  ja/
    index.md
    getting-started/
      install.md
      first-launch.md
      open-your-first-project.md
    workflows/
      psd-to-rig.md
      manual-image-split.md
      auto-setup.md
      viewer.md
      export.md
    reference/
      file-formats.md
      keyboard-shortcuts.md
      settings.md
    troubleshooting/
      import-errors.md
      display-and-gpu.md
      localization.md
    faq.md
  zh-Hans/
    index.md
    getting-started/
      install.md
      first-launch.md
      open-your-first-project.md
    workflows/
      psd-to-rig.md
      manual-image-split.md
      auto-setup.md
      viewer.md
      export.md
    reference/
      file-formats.md
      keyboard-shortcuts.md
      settings.md
    troubleshooting/
      import-errors.md
      display-and-gpu.md
      localization.md
    faq.md
  ko-KR/
    index.md
    getting-started/
      install.md
      first-launch.md
      open-your-first-project.md
    workflows/
      psd-to-rig.md
      manual-image-split.md
      auto-setup.md
      viewer.md
      export.md
    reference/
      file-formats.md
      keyboard-shortcuts.md
      settings.md
    troubleshooting/
      import-errors.md
      display-and-gpu.md
      localization.md
    faq.md
```

`docs/user/index.md` is the locale-agnostic user-docs entry point. It should be
small and implementation-neutral: a locale selector, links to each supported
locale root, and optional future website handoff notes. It must not contain
English-only workflow content that bypasses localized pages.

Each locale should keep the same slug structure so links can switch languages
without changing topic identity. Media assets should be either language-neutral
or explicitly scoped by locale:

```text
docs/user/assets/images/workflows/auto-setup/preview-panel.neutral.png
docs/user/assets/images/workflows/auto-setup/preview-panel.en.png
docs/user/assets/images/workflows/auto-setup/preview-panel.ja.png
docs/user/assets/videos/workflows/manual-split/lasso-smoothing.en.webm
```

User-doc JSON files are allowed only for documented metadata surfaces such as
media manifests, caption indexes, transcript indexes, or future search-route
metadata. Each JSON metadata surface must be named in
`docs/developer/contributing/documentation.md` before it is added under
`docs/user/`, and it is always scanned as public copy.

Documentation maintainer guidance belongs in
`docs/developer/contributing/documentation.md`, not in the published user-docs
tree. The `docs/user/` root should contain locale content and shared assets
only.

Locale fallback rule:

- Published user-doc pages must have slug parity across `en`, `ja`, `zh-Hans`,
  and `ko-KR`.
- Non-English locale directories must mirror the `en/` slug structure exactly;
  locale-specific additions need matching stub or translated pages in every
  other locale before they are published.
- The future `docs:user:check` gate must validate slug parity across all four
  locales before release-candidate signoff.
- The website must not silently render English body copy on a non-English route.
- Stub routes must render an explicit localized "not available yet" page in the
  requested route locale.
- During drafting, a missing locale may use an explicit localized
  "not available yet" stub, but that stub must be tracked as incomplete and
  must block release-candidate documentation signoff.
- Draft stubs must use frontmatter such as `status: stub`. The future
  `docs:user:check` gate and the public release checklist must fail release
  candidate signoff when any published slug still has `status: stub`.
- Language-neutral media uses the `.neutral` suffix. Locale-specific media uses
  the BCP 47 locale suffix, such as `.en`, `.ja`, `.zh-Hans`, or `.ko-KR`.
- Media lookup uses locale-specific assets first, then `.neutral`. It must not
  fall back from a non-English locale to `.en` media. If English media should be
  shared by all locales, store it as a `.neutral` asset instead of `.en`. If
  neither locale-specific nor neutral media exists, the page is incomplete and
  must fail release-candidate signoff.

The minimal website shell lives under `apps/vivi2d-com/` and consumes tracked
user-doc route metadata. The main domain, `vivi2d.com`, is the product portal;
the long-form user documentation should live on `docs.vivi2d.com` when public
hosting is enabled. That keeps localized user docs versioned in Git while
allowing the portal, documentation routing, search index, and deployment config
to evolve separately.

Recommended website responsibilities:

- keep `vivi2d.com` as the portal and `vivi2d.com/docs` as a redirect
- route `docs.vivi2d.com/{locale}/latest/...`
- default locale negotiation with explicit selector
- media optimization and captions
- workflow cards and step-by-step tutorials
- search over localized content
- no internal roadmap pages

## Backlog Documentation

`docs/backlog/` is ignored and local-only. It is for historical planning notes,
Claude/GPT review prompts, phase plans, and design-roadmap scratchpads. It must
not be used as a canonical source for code behavior, release gates, security
policy, or public claims.

Archival procedure:

1. Inspect the file and promote any still-canonical information into
   `docs/developer/` or `docs/user/`.
2. Copy or move the historical file into `docs/backlog/YYYY-MM/`.
3. Add or update a matching entry in
   `docs/developer/quality/docs-migration-manifest.json`.
4. Remove the original tracked file with `git rm`.
5. Do not add the `docs/backlog/` copy.

The migration manifest is the durable audit trail for ignored backlog
archival. Each entry must include the original source path, the ignored backlog
destination, promoted tracked targets, dropped sections with explicit reasons,
reviewer, and review date. Every archived source must have exactly one manifest
entry, and each entry must include at least one promoted target or an explicit
drop rationale. The manifest must not claim `docs/backlog/` as canonical.

Public-release history policy:

- `docs/developer/quality/public-release-checklist.md` must record the selected
  Git history publication model before the first public OSS release.
- Option A preserves full Git history. It requires a tracked
  "pre-public historical docs are non-canonical" notice plus history-aware
  public-copy, IP, and private-marker scans over reachable history.
- Option B publishes through a clean public mirror or initial import. It
  requires preserving private audit history internally and documenting who owns
  the internal audit archive and provenance requests for public artifacts.
- Public release is blocked until one model is selected and its checks pass.

## Migration Phases

### Phase 1: Documentation inventory and README reset

- Replace the current root README with a minimal English README.
- Add `docs/developer/index.md`.
- Add task guides, PR recipes, troubleshooting, and system diagrams when
  contributor guidance expands beyond setup/testing/package boundaries.
- Add `docs/user/index.md` as the locale selector and user-docs entry point.
- Add locale skeleton indexes under `docs/user/{en,ja,zh-Hans,ko-KR}/`.
- Keep old docs in place until links are updated.

Completion criteria:

- Root README links to `docs/developer/` and future user docs instead of
  duplicating their content.
- `docs/developer/index.md` exists and links this architecture document.
- `docs/developer/index.md` links task guides, PR recipes, troubleshooting,
  and system diagrams when those files exist.
- `docs/user/index.md` exists and links to each supported locale root.
- Each user-doc locale has an `index.md` and the initial slug skeleton.
- `git diff --check` and existing documentation scanners pass.

### Phase 2: Developer docs promotion

- Move canonical docs into `docs/developer/`.
- Update all script paths that read moved baselines or policy files.
- Keep locale review metadata under `docs/developer/contributing/i18n/`; it is
  contributor review metadata, not published user-guide content.
- Create `docs/developer/contributing/documentation.md` and define the
  `docs:user:check` behavior for slug parity, stub detection, and media
  fallback validation.
- Keep root `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md` as
  GitHub entry points, but link them to deeper developer docs.
- Keep root `SECURITY.md` limited to vulnerability disclosure instructions,
  supported reporting channels, and current supported-release scope.
  `docs/developer/security/security-policy.md` owns developer-facing security
  architecture, threat model scope, local API boundaries, IPC rules, and
  release-gate security checks.

Completion criteria:

- All promoted canonical docs have no stale links to old `docs/*.md` paths.
- Any moved baseline path has matching script/workflow updates in the same PR.
- `docs/developer/quality/public-release-checklist.md` includes the interim
  manual check for `status: stub` pages until `docs:user:check` exists.
- `docs/developer/contributing/documentation.md` specifies `docs:user:check`
  behavior for slug parity, stub detection, and media fallback before the gate
  is implemented.
- `docs/developer/api/spec/runtime-spec-v1.md` links back to
  `docs/developer/api/index.md`.
- Root `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md` still exist.
- `npm run check:quality` passes.

### Phase 3: Backlog archival

- Archive roadmap/plan/audit scratch documents into ignored `docs/backlog/`.
- Remove tracked references to archived files.
- Add a documentation lint rule that fails if new tracked docs are named
  `*roadmap*.md`, `*-plan.md`, `*implementation-plan*.md`, `*-audit.md`,
  or `*review-prompt*.md` outside `docs/backlog/`.
- Archive existing scratch `*-design.md` files through the explicit migration
  list above, but do not globally ban `*-design.md`: tracked developer docs may
  legitimately use that suffix for canonical architecture, protocol, or
  security design references.
- Implement this as `npm run check:docs-architecture`, backed by a script such
  as `scripts/check-docs-architecture.mjs`, and add it to the standard quality
  gate once the migration lands.
- Make `check:docs-architecture` require tracked task guides, contributor PR
  recipes, troubleshooting, system diagrams, and ADRs when those docs are part
  of the developer-doc set.
- Make `check:docs-architecture` reject roadmap-style scheduling language in
  ADR files. ADRs record context, decision, and consequences; implementation
  schedules remain in ignored backlog notes.
- Make `check:task-guide-paths` validate task-guide `Primary Files` lists.
- Make `check:task-guide-gates` validate task-guide `Tests And Gates` lists.
- Make `check:troubleshooting-content` scan troubleshooting examples for
  synthetic, sanitized output.
- Make `check:docs-architecture` verify that every file in the explicit
  archival list has exactly one
  `docs/developer/quality/docs-migration-manifest.json` entry, each entry has
  at least one promoted target or explicit drop rationale, and no tracked links
  still point at archived source paths.
- Make `check:docs-architecture` validate SDK/protocol stability promotion:
  unversioned `web-sdk.md`, `viewer-api.md`, and `provider-sdk.md` must not
  contain `stability: stable` frontmatter, and any `*-v1.md` stable API doc
  must have a matching `docs/developer/quality/public-api-status.md` entry and
  `docs/developer/api/index.md` link in the same change.
- Make `check:docs-architecture` reject unregistered `docs/user/**/*.json`
  files. Every user-doc JSON metadata surface must be listed in the allowlist
  maintained by `docs/developer/contributing/documentation.md` before it can be
  scanned by `check:docs-public-surface`.

Completion criteria:

- The explicit backlog list no longer exists as tracked `docs/*.md` files.
- Canonical content from archived files has been promoted or intentionally
  dropped in `docs/developer/quality/docs-migration-manifest.json`.
- The migration manifest covers every archived source exactly once and is
  validated by `npm run check:docs-architecture`.
- The documentation lint rule rejects new tracked roadmap/planning scratch docs
  outside ignored `docs/backlog/`.
- `npm run check:docs-architecture` exists and is included in the standard
  quality gate.
- `check:docs-architecture` rejects non-atomic SDK/protocol stable promotion.
- `check:docs-architecture` rejects user-doc JSON metadata files that are not
  allowlisted by the documentation authoring spec.
- `docs/developer/quality/public-release-checklist.md` records the selected
  Git history publication model or explicitly blocks public release until that
  model is chosen.
- `git status --short --ignored docs/backlog` shows backlog copies ignored, not
  staged.

### Phase 4: User docs site preparation

- Add first workflow docs in all four locales.
- Add media asset conventions and caption requirements.
- Implement `docs:user:check` for slug parity, `status: stub` detection, media
  fallback validation, and release-candidate documentation signoff.
- Implement `npm run check:docs-public-surface` for public-copy, IP, and
  private-marker scanning across documentation and future generated routes.
- Implement the gate against the Phase 2 written spec in
  `docs/developer/contributing/documentation.md`; if the behavior changes,
  update that spec in the same PR before changing code.
- Keep `apps/vivi2d-com/` as a minimal scaffold until the first deployment
  target for `vivi2d.com` is chosen. Any deployment PR must name the web-infra
  owner and define the build, preview, and release-surface scan commands.

Completion criteria:

- `docs:user:check` passes for slug parity and media fallback.
- `docs:user:check` behavior matches the written spec in
  `docs/developer/contributing/documentation.md`.
- `npm run check:docs-public-surface` scans root public docs, developer docs,
  user docs, user-doc metadata, media captions/transcripts, locale-specific
  copy, and generated `apps/vivi2d-com` route metadata.
- `check:docs-public-surface` is included in the standard release-quality gate
  before public user-doc release.
- Before deploying `apps/vivi2d-com/`, the PR names the web-infra owner,
  deployment target, build command, preview command, and release-surface scan.
- Release-candidate signoff has zero `status: stub` pages.
- User-doc pages do not silently fallback to English on non-English routes.
- Website scaffolding consumes tracked user-doc route metadata without exposing
  `docs/backlog/`.

`check:docs-public-surface` must cover at least:

- `README.md`
- `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`
- `docs/developer/**/*.md`
- `docs/user/**/*.md`
- documented `docs/user/**/*.json` metadata surfaces only
- user-doc media manifests, captions, alt text, and transcript files under
  `docs/user/assets/**`
- generated route metadata from `apps/vivi2d-com`

The gate combines a public-copy/IP scanner, locale-aware forbidden terminology
for `en`, `ja`, `zh-Hans`, and `ko-KR`, third-party product reference allowlist
entries with required section and reason, private deformation terminology
scanning, media metadata/caption scanning, and synthetic self-tests that inject
forbidden terms into each user-doc locale. `docs:user:check` does not replace
this scanner; it only validates user-doc structure, stubs, and media fallback.
`check:docs-public-surface` scans only allowlisted user-doc JSON metadata
surfaces; unregistered JSON files must already fail `check:docs-architecture`.

## Invariants

- Root README remains English-only and short.
- Developer docs remain English-only.
- User docs cover `en`, `ja`, `zh-Hans`, and `ko-KR`.
- Roadmaps and review scratchpads are not tracked as canonical documentation.
- Documentation lint blocks new tracked roadmap or planning scratch files named
  `*roadmap*.md`, `*-plan.md`, `*implementation-plan*.md`, `*-audit.md`, or
  `*review-prompt*.md` outside ignored `docs/backlog/`.
- Backlog archival decisions are tracked in
  `docs/developer/quality/docs-migration-manifest.json`; migration PR
  descriptions are not the durable audit record.
- Documentation lint must not globally ban `*-design.md`; canonical
  architecture, protocol, IP, and security design references may live under
  `docs/developer/`.
- New runtime spec versions update `docs/developer/api/index.md` in the same PR.
- Versioned runtime/API changes add matching migration/conformance notes under
  `docs/developer/api/migrations/`.
- Runtime spec files live under `docs/developer/api/spec/`, not
  `docs/developer/architecture/`.
- Runtime spec files link to `docs/developer/api/index.md`.
- Architecture overview links to `docs/developer/api/index.md` for runtime spec
  version navigation instead of linking a single spec version directly.
- API status information lives in `docs/developer/quality/public-api-status.md`;
  `docs/developer/api/index.md` links to it instead of duplicating status text.
- SDK/protocol API docs are preview-mutable until the same PR sets
  `stability: stable` frontmatter, updates
  `docs/developer/quality/public-api-status.md`, and renames the document to an
  explicit `*-v1.md` file.
- User-doc release checks reject `status: stub` pages for release-candidate
  signoff. This is manual via
  `docs/developer/quality/public-release-checklist.md` until the future
  `docs:user:check` gate exists.
- `docs:user:check` enforces that `.en` media never acts as fallback for
  non-English locales; shared media must use `.neutral`.
- `apps/vivi2d-com/` remains a minimal scaffold until a web-infra owner,
  deployment target, preview command, and release-surface scan are recorded for
  a public deployment.
- The first public OSS release must select and pass a tracked Git history
  publication model in `docs/developer/quality/public-release-checklist.md`.
- IP/security/release docs remain tracked.
- Quality-gate baselines remain tracked.
- Any public docs that mention third-party products must be in explicitly
  labeled reference/IP sections or forbidden by the public-copy scanner.
- Public documentation surfaces are scanned by `npm run check:docs-public-surface`;
  `docs:user:check` must not be treated as a substitute for public-copy/IP
  scanning.
