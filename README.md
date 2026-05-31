# Vivi2D

[![Status: pre-1.0 alpha](https://img.shields.io/badge/status-pre--1.0%20alpha-f0b429)](#getting-started)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Release: Windows installer alpha](https://img.shields.io/badge/release-Windows%20installer%20alpha-6f42c1)](#releases)
[![Website: vivi2d.com](https://img.shields.io/badge/website-vivi2d.com-0f6e8f)](https://vivi2d.com)

2D creation for everyone. Vivi2D is an experimental editor, viewer, and web SDK
tooling for layered artwork workflows and embeddable web integrations.

<p align="center">
  <a href="docs/assets/readme/vivi2d-workflow-demo.webm">
    <img src="docs/assets/readme/vivi2d-workflow-demo.gif" alt="Vivi2D workflow demo: image to See-through decomposition to reviewed Auto Setup and motion preview" width="920">
  </a>
</p>

<p align="center">
  <strong>Image -> See-through decomposition -> reviewed Auto Setup -> motion preview.</strong>
</p>

Vivi2D is pre-1.0. APIs, file formats, package boundaries, and release policy
may change before the first public release.

The public portal is [vivi2d.com](https://vivi2d.com). Release artifacts remain
canonical on [GitHub Releases](https://github.com/syobon211/vivi2d/releases).

Vivi2D uses its own source-preserving project and runtime formats. Public
packages and docs should not imply compatibility with unrelated animation
authoring products or third-party workflow formats.

## What Vivi2D Is

Vivi2D is an editor and playback toolkit for source-preserving 2D character
projects. The current focus is layered artwork import, reviewed rig setup,
viewer workflows, and a small web SDK for public-profile model playback.

## What Vivi2D Is Not

Vivi2D is not a compatibility layer for other animation authoring products, a
replacement file format for third-party tools, or a promise that private editor
draft data is safe to publish. Public packages consume reviewed Vivi2D public
profiles only.

## Packages

| Path | Status | Purpose |
| --- | --- | --- |
| `src/`, `electron/` | internal app | Desktop editor app. |
| `packages/viewer` | internal app / preview API | Standalone viewer app and local Viewer API preview. |
| `packages/web` | experimental public package | `@vivi2d/web` browser SDK for public-profile model playback. |
| `packages/viewer-api-client` | internal preview workspace | Client helpers for the local Viewer API. |
| `packages/provider-sdk` | internal preview workspace | Provider integration contracts and examples. |
| `packages/model`, `packages/runtime`, `packages/runtime-wasm`, `packages/runtime-native` | internal workspaces | Model/runtime implementation packages that are not independently published yet. |

See [developer docs](docs/developer/index.md) for architecture and contribution
details. User-facing guides will live under [user docs](docs/user/index.md).

## Releases

Pre-1.0 alpha releases are published on
[GitHub Releases](https://github.com/syobon211/vivi2d/releases). Download
release artifacts only from the release page and verify them with
`checksums.txt`.

The current public release is `v0.1.0-alpha.2`, a Windows installer alpha for
early testing. It includes an unsigned Windows x64 NSIS installer, source review
archive, SBOM, third-party notices, checksums, and installer release record.

The first `v0.1.0-alpha.1` release remains the source/provenance-only baseline.
Published npm packages, native/WASM standalone binaries, and ComfyUI bundles are not
included until they are explicitly announced in release notes.

The Windows installer alpha is unsigned. It may show browser, `Unknown
publisher`, or Microsoft Defender SmartScreen warnings. Download installers only
from GitHub Releases and verify `checksums.txt` before running them.

## Getting Started

For the quickest local trial, use the Windows x64 installer from
`v0.1.0-alpha.2` on GitHub Releases. It is unsigned and intended for early
testing, so verify `checksums.txt` and use test artwork first.

If you prefer to run from source, use the developer setup below. If you only
want to follow progress, watch GitHub Releases and the user documentation.

## Current Limitations

- The Windows desktop installer is unsigned alpha software and may trigger
  browser, `Unknown publisher`, or SmartScreen warnings.
- No macOS, Linux, MSI, MSIX, Winget, or Microsoft Store installer is published
  yet.
- No npm package is published yet.
- ComfyUI, ComfyUI-See-through, model weights, and custom-node bundles are not
  bundled with Vivi2D.
- ComfyUI automation is supported through Vivi2D's compat plugin. The legacy
  direct See-through workflow is maintained only as a best-effort local
  fallback because upstream custom-node outputs can change.
- Public packages and release artifacts are limited to reviewed Vivi2D
  public-profile surfaces.
- Demo media uses synthetic project assets and is not a compatibility claim for
  third-party tools.

## Development

Requirements:

- Node.js 22 for local development and CI project commands
- npm 10+ for local development
- Playwright browsers for browser/Electron checks

GitHub Actions are pinned to Node 24-compatible action releases. Vivi2D project
commands still run on Node.js 22, with release publication workflows pinning
Node.js 22.14.0 and npm 11.5.1 or newer where npm provenance is required.

Install dependencies:

```bash
npm ci
npx playwright install chromium firefox webkit
```

Run the editor:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Run the standard local quality gate:

```bash
npm run check:quality
```

Run stricter pre-release workflow recording when needed:

```bash
npm run check:quality:e2e-workflow-record
```

## Documentation

- [Project portal](https://vivi2d.com)
- [Public docs entry point](https://docs.vivi2d.com)
- [Developer documentation](docs/developer/index.md)
- [User documentation index](docs/user/index.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## Roadmap

- Improve Windows installer signing, first-launch review evidence, and download
  copy after the unsigned installer alpha.
- Prepare an `@vivi2d/web` npm alpha for reviewed public-profile playback.
- Add macOS/Linux or store-distributed desktop builds only after separate
  installer contracts are reviewed.
- Stabilize the public runtime/profile contract for external engine adapters.
- Build a Unity SDK alpha for loading reviewed Vivi2D public-profile models.
- Add Unity samples, package metadata, checksums, and release notes before
  publishing Unity SDK artifacts.
- Expand user documentation with screenshots, short videos, and localized
  walkthroughs.
- Build out the `vivi2d.com` portal with release links, docs entry points, and
  showcase material.

## Acknowledgements

Vivi2D's optional local decomposition workflow can consume outputs from
[See-through](https://github.com/shitagaki-lab/see-through), an independent
open-source research project for single-image anime layer decomposition.
See-through is not bundled with Vivi2D. Current ComfyUI use should install the
Vivi2D compat plugin alongside ComfyUI-See-through so Vivi2D can verify node
contracts and import reviewed layer manifests directly.

If you use See-through results in academic or published work, please cite the
See-through paper as requested by its upstream project.

## Contact

- Bugs and feature requests: use GitHub Issues.
- Questions and community chat: a public community space is planned.
- Security reports: follow [SECURITY.md](SECURITY.md). Do not report
  vulnerabilities in public issues, discussions, chat, screenshots, or logs.

## License

Apache-2.0. See [LICENSE](LICENSE).
