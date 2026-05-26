# Vivi2D Web SDK Basic Example

This example is the first programmatic `@vivi2d/web` quick-start. It loads a
generated public-profile `.vivi` fixture, creates a player, drives input values,
handles stable `ViviWebError` codes, and disposes renderer resources from host
application controls.

## Run From This Repository

From the repository root:

```sh
npm run build:fixtures -- --check
npm run build --workspace @vivi2d/web
npx vite --config examples/web-sdk-basic/vite.config.ts --host 127.0.0.1
```

Then open the printed localhost URL. The example is intentionally outside the
root workspace list and is not publishable.

## Copied-Out Usage

Before npm publication, copied-out usage is available only if you install an
explicit release tarball for `@vivi2d/web`. After npm publication, replace the
local file dependency with:

```sh
npm install @vivi2d/web
```

The pinned `typescript` and `vite` versions in this folder are the verified
sample snapshot. They are not a broad compatibility promise.

## Basic SDK Shape

The core application flow is:

```text
load model -> create player -> start/update/render -> set inputs -> dispose
```

The sample keeps ownership in one helper so reloads and Vite HMR do not leak
animation loops or WebGL resources. The helper uses `AbortController`, a
monotonic run ID, and idempotent `dispose()` calls so stale async completions
cannot overwrite the newest successful load.

## Safety Notes

- The bundled model is generated synthetic geometry only.
- The fixture is public-profile `.vivi` data and contains no third-party art.
- Model metadata and parameter names are rendered as plain text.
- Error output is fixed copy derived from `ViviWebErrorCode`; raw stack traces,
  URLs, local paths, causes, and model payload snippets are never displayed.
- Production hosts should configure their own Content Security Policy. This
  example uses bundled scripts and avoids inline application scripts.

## Browser Assumptions

Use a modern evergreen browser with an ES2020-compatible runtime and a WebGL
capable canvas. The smoke test currently targets Chromium; Firefox, WebKit, and
Safari coverage can be added when the CI matrix supports them reliably.
