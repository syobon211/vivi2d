# Vivi2D

Source-preserving 2D character rigging and runtime tooling for layered artwork,
viewer workflows, and embeddable web integrations.

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
| `packages/viewer-api-client` | preview package | Client helpers for the local Viewer API. |
| `packages/provider-sdk` | preview package | Provider integration contracts and examples. |
| `packages/model`, `packages/runtime`, `packages/runtime-wasm`, `packages/runtime-native` | internal workspaces | Model/runtime implementation packages that are not independently published yet. |

See [developer docs](docs/developer/index.md) for architecture and contribution
details. User-facing guides will live under [user docs](docs/user/index.md).

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

## License

Apache-2.0. See [LICENSE](LICENSE).
