# Vivi2D

[![Status: pre-1.0 alpha](https://img.shields.io/badge/status-pre--1.0%20alpha-f0b429)](#getting-started)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Release: source/provenance only](https://img.shields.io/badge/release-source%2Fprovenance%20only-6f42c1)](#releases)

Source-preserving 2D character rigging and runtime tooling for layered artwork,
viewer workflows, and embeddable web integrations.

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

The first alpha release is source/provenance-only. It includes the source review
archive, SBOM, third-party notices, checksums, and release record. Installers,
npm packages, native/WASM binaries, and ComfyUI bundles are not included until
they are explicitly announced in release notes.

## Getting Started

Vivi2D is not yet distributed as a one-click app installer. The current public
alpha is intended for source review, early developer evaluation, and release
provenance checks.

If you want to try the editor from source, use the developer setup below. If
you only want to follow progress or wait for packaged builds, watch GitHub
Releases and the user documentation.

## Current Limitations

- No one-click desktop installer is published yet.
- No npm package is published yet.
- ComfyUI, ComfyUI-See-through, model weights, and custom-node bundles are not
  bundled with Vivi2D.
- Public packages and release artifacts are limited to reviewed Vivi2D
  public-profile surfaces.
- Demo media uses synthetic project assets and is not a compatibility claim for
  third-party tools.

## Development

Requirements:

- Node.js 22
- npm 10+
- Playwright browsers for browser/Electron checks

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

- [Developer documentation](docs/developer/index.md)
- [User documentation index](docs/user/index.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## Roadmap

- Publish the first source/provenance-only GitHub alpha release.
- Prepare an `@vivi2d/web` npm alpha for reviewed public-profile playback.
- Add packaged desktop builds after installer signing, checksums, and release
  gates are reviewed.
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
See-through is not bundled with Vivi2D.

If you use See-through results in academic or published work, please cite the
See-through paper as requested by its upstream project.

## Contact

- Bugs and feature requests: use GitHub Issues.
- Questions and community chat: a public community space is planned.
- Security reports: follow [SECURITY.md](SECURITY.md). Do not report
  vulnerabilities in public issues, discussions, chat, screenshots, or logs.

## License

Apache-2.0. See [LICENSE](LICENSE).
