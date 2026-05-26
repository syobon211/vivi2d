# ComfyUI Plugin Layout

This document records the current Vivi2D decision for how ComfyUI custom-node
plugins should be installed, documented, and detected.

## Decision

Vivi2D expects the See-through custom nodes and the Vivi2D compat plugin to live
as sibling directories under the same ComfyUI `custom_nodes` parent:

```text
ComfyUI/
  custom_nodes/
    ComfyUI-See-through/
    vivi2d_compat_plugin/
```

The two plugin directories must not be merged into one directory. The shared
parent makes installation easy for users, while sibling directories preserve
update, license, support, and version boundaries.

## Terminology

- **ComfyUI** is the local application that runs image workflows.
- **ComfyUI-See-through** is the third-party custom-node plugin from
  `jtydhr88/ComfyUI-See-through`. It adds See-through decomposition nodes to
  ComfyUI.
- **Vivi2D compat plugin** is the Vivi2D-specific ComfyUI bridge. Its install
  directory is `vivi2d_compat_plugin`, and it exposes the node contract expected
  by `packages/provider-comfyui`.
- **`packages/provider-comfyui`** is the TypeScript-side adapter in this repo.
  It is not the Python custom-node plugin and must not be copied into ComfyUI.

## Why Sibling Directories

- Updating `ComfyUI-See-through` must not overwrite Vivi2D compat files.
- Updating `vivi2d_compat_plugin` must not modify the third-party plugin.
- Uninstall steps can remove one plugin without damaging the other.
- Version detection can report whether See-through nodes are missing or the
  Vivi2D compat plugin is missing.
- License and release reviews can treat third-party plugin code and Vivi2D
  plugin code separately.

## Detection Contract

`packages/provider-comfyui` detects the Vivi2D compat plugin by asking ComfyUI
for the expected node types:

```text
ViviSeeThroughDecompose
ViviSeeThroughExportPSD
```

The decompose node must expose defaults for:

```text
schema_version = 1.0.0
plugin_version = 0.1.0
capability = vivi2d.seethrough.v1
```

These are current pinned values, not a public stability promise. The current
provider behavior is exact-match for `schema_version`, `plugin_version`, and
`capability`. Any future compatibility range must be added as a reviewed
compatibility table in `packages/provider-comfyui` tests and release notes
before users are told that multiple plugin versions are accepted.

If the See-through plugin is missing, user-facing troubleshooting should say the
See-through nodes are missing. If the Vivi2D compat plugin is missing or
mismatched, user-facing troubleshooting should say the Vivi2D compat plugin is
missing or mismatched. These are different failures.

## Repository Boundary

This repository contains the TypeScript adapter, user/developer documentation,
and the Python custom-node source for `vivi2d_compat_plugin`. The Python source
is Vivi2D-maintained Apache-2.0 code and may be included in the public OSS
source tree when `npm run check:oss-publication` passes. That source publication
approval does not approve bundling ComfyUI, ComfyUI-See-through, model weights,
generated assets, or a combined custom-node pack.

The Python custom-node source lives under:

```text
integrations/comfyui/vivi2d_compat_plugin/
```

The install target remains:

```text
ComfyUI/custom_nodes/vivi2d_compat_plugin/
```

## Packaging Guidance

A user-friendly package may contain both custom-node directories as siblings
only after the release checklist records the additional artifact-level license,
dependency, third-party notice, checksum, and provenance decisions:

```text
vivi2d-comfyui-custom-nodes/
  ComfyUI-See-through/
  vivi2d_compat_plugin/
```

The package must not flatten the two directories together. A Vivi2D-branded
package must not imply that the third-party See-through plugin is owned by
Vivi2D or that all ComfyUI workflows are covered by Vivi2D. If Vivi2D
distributes such a package, the release checklist must cover:

- Python dependency license review.
- SPDX expression for the Vivi2D compat plugin.
- Third-party notice handling for bundled third-party code, if any.
- Checksums or provenance for the distributed archive.
- A clear statement that ComfyUI custom nodes run with local user privileges.

Until those items are complete, user docs may describe the target install
layout, but public release materials must not present a bundled custom-node pack
as ready for production use.

## Canonical Source Requirements

Before a public route or release note tells users to install the Vivi2D compat
plugin, Vivi2D must publish a canonical source record for that plugin. The
tracked source record lives at
`docs/developer/quality/comfyui-plugin-source-record.json`. It may stay
`status: "draft"` while `docs/user/publication-manifest.json` keeps
`integrations/comfyui` unpublished, but publication gates must fail if the route
is promoted before the record is complete and reviewed. The record must include:

- Package or source location.
- Plugin version.
- SHA-256 checksum or signed release artifact.
- License and SPDX expression.
- Supported Vivi2D build or version range.
- The expected install directory name: `vivi2d_compat_plugin`.

Before a public route or release note pins ComfyUI-See-through, Vivi2D must also
record the upstream release tag or commit used for testing. If a public Vivi2D
archive bundles third-party code, the archive must include the corresponding
third-party notice and provenance record.

`npm run docs:user:check:release` validates the source record when
`integrations/comfyui` is published. `npm run check:release-surface` validates
that tracked plugin source has at least an internal source record, and it
requires a complete reviewed source record for published routes or release-note
install guidance. Release notes that tell users to install the same plugin must
use the same reviewed record and must not bypass the publication gate.

## Data Flow Disclosure

User docs for this integration must disclose what Vivi2D sends to local ComfyUI
before users run a workflow. At minimum:

- Selected image bytes or a selected duplicate image.
- User-entered workflow options or prompt text, if the UI provides them.
- Local request metadata needed to match the returned files to the current run.
- No complete Vivi2D project file unless the user explicitly selects one.

User docs must also disclose local retention at a high level: Vivi2D may keep
local run status, selected endpoint settings, returned file paths, and safe
review summaries in app state or logs, but should not persist private prompts,
image bytes, or full returned files unless the user imports or saves them.

The docs must also warn that ComfyUI custom nodes run locally and may log or
store their own inputs according to the installed custom-node code.

## User Documentation Rules

User-facing docs should say:

- Install both plugin directories under `ComfyUI/custom_nodes/`.
- Keep `ComfyUI-See-through/` and `vivi2d_compat_plugin/` separate.
- Restart ComfyUI after installing or updating either directory.
- Use Vivi2D's connection check to distinguish missing See-through nodes from a
  missing Vivi2D compat plugin.

User-facing docs should not say:

- The two plugins are the same plugin.
- Installing ComfyUI-See-through also installs the Vivi2D compat plugin.
- Vivi2D officially supports every ComfyUI workflow.
- Generated outputs are safe without review.

## Required Checks When This Changes

Changes to this layout or detection contract should run:

```sh
npm run test -- packages/provider-comfyui/src/__tests__ --no-coverage
npm run check:docs-public-surface
npm run docs:user:check
npm run docs:site:check
npm run check:docs-architecture
```

If the Python custom-node plugin is added to this repository or release
artifacts, also run the release/license gates named in the public release
checklist before publication, including license policy, SBOM, pack contents,
release surface, and provenance/checksum gates.
