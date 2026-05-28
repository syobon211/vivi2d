# @vivi2d/web

Experimental browser SDK for embedding Vivi2D public-profile `.vivi` models.

## Install / Import

Before npm publication, use this package from the Vivi2D repository or from an
explicit release tarball. After npm publication:

```sh
npm install @vivi2d/web@alpha
```

Alpha releases are intentionally published under the `alpha` dist-tag, not
`latest`. Pin an exact version in production experiments if reproducibility
matters.

```ts
import { createViviWebPlayer, loadViviWebModel } from "@vivi2d/web";
```

## Minimal Display

```ts
import { createViviWebPlayer, loadViviWebModel } from "@vivi2d/web";
import { formatViviWebError } from "./error-copy";

const canvas = document.querySelector<HTMLCanvasElement>("#vivi-canvas");
const statusElement = document.querySelector<HTMLElement>("#status");
if (!canvas || !statusElement) throw new Error("Missing sample elements");

try {
  const model = await loadViviWebModel("/generated-avatar.vivi");
  const player = await createViviWebPlayer({
    autoStart: true,
    canvas,
    model,
  });
  void player;
} catch (error) {
  statusElement.textContent = formatViviWebError(error).message;
}
```

The full monorepo example lives at
`examples/web-sdk-basic/README.md`. It includes ownership, HMR cleanup,
`AbortController`, stale-load protection, input controls, and error-copy
helpers. That example is repository content only; it is not packed into the npm
tarball.

## Load From A File Picker

```ts
const input = document.querySelector<HTMLInputElement>('input[type="file"]');
input?.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;
  const model = await loadViviWebModel(file);
  await createViviWebPlayer({ canvas, model });
});
```

Static servers should serve `.vivi` files as normal static assets. A generic
binary MIME type is acceptable. Cross-origin model loading is the host
application's responsibility and requires normal CORS headers.

## Lifecycle Controls

The basic SDK shape is:

```text
load model -> create player -> start/update/render -> set inputs -> dispose
```

`createViviWebPlayer` returns a `Promise<ViviWebPlayer>`. Apps should own one
current player, abort in-flight loads before replacement, dispose old players,
and ignore stale async completions after reload or dispose. The sample shows a
single ownership helper for this pattern.

Useful player methods:

- `start()` and `stop()` control the automatic frame loop.
- `update(deltaSeconds)` advances model state with a finite non-negative delta.
- `render()` draws the current frame.
- `resize(width, height)` changes the canvas size with positive integer bounds.
- `dispose()` is idempotent and releases renderer resources.

## Drive Inputs

Use the public parameter list from the loaded model instead of hard-coding
semantic parameter names:

```ts
for (const parameter of player.getParameters()) {
  player.setInput(parameter.id, parameter.default);
}

player.setInputs({
  [player.getParameters()[0]?.id ?? ""]: 0,
});

player.resetInputs();
```

Unknown input IDs are ignored by default. Pass `strictInputs: true` to
`createViviWebPlayer` if the host app wants unknown input IDs to throw
`VIVI_WEB_UNKNOWN_INPUT`.

## Handle Errors

SDK failures are normalized to `ViviWebError` with stable public codes. Host
apps should display fixed copy derived from `error.code`; do not render raw
messages, stack traces, causes, local paths, credentials, URLs, or model
payload snippets.

Common public codes include:

- `VIVI_WEB_FETCH_FAILED`
- `VIVI_WEB_PARSE_FAILED`
- `VIVI_WEB_VALIDATION_FAILED`
- `VIVI_WEB_INVALID_INPUT`
- `VIVI_WEB_UNKNOWN_INPUT`
- `VIVI_WEB_DISPOSED`
- `VIVI_WEB_ABORTED`

## Custom Element Alternative

The root package import is side-effect free. Register the element explicitly:

```ts
import { defineViviModelElement } from "@vivi2d/web";

defineViviModelElement();
```

```html
<vivi-model src="./character.vivi" width="320" height="480" autoplay></vivi-model>
```

If you want import-time registration for a browser page, use the explicit
side-effect entry point:

```ts
import "@vivi2d/web/auto-register";
```

The repository-local `packages/web/demo.html` remains the custom-element demo.
Open it through the repository dev server, not as a standalone `file://` page.

## Experimental Status And Compatibility

This package is pre-1.0 and marked as experimental. The custom element name,
methods, events, and file-format behavior may change before the first stable
release.

The guidance above is stable for the current Web SDK shape only. It does not
promise native runtime ABI stability, official WASM binary stability, Unity SDK
stability, or long-term low-level renderer internals.

Browser assumptions:

- Modern evergreen browser.
- ES2020-compatible runtime.
- WebGL-capable `HTMLCanvasElement`.
- Keyboard and pointer interaction for sliders and controls.

## API Reference

Primary root exports:

- `loadViviWebModel(source, options?)`
- `createViviWebPlayer(options)`
- `isViviWebError(error)`
- `ViviWebError`
- `ViviWebErrorCode`
- `ViviWebModel`
- `ViviWebPlayer`
- `defineViviModelElement(tagName?)`
- `ViviModelElement`

`loadViviWebModel` accepts public `.vivi` sources, deep-clones object input,
rejects private/authoring-only profiles, and returns an opaque `ViviWebModel`
that external code cannot construct.

Phase 1 targets `HTMLCanvasElement`. Worker-side `OffscreenCanvas` rendering is
reserved for a later SDK phase.

Thumbnails are bounded to 1,048,576 pixels and 2 MiB of data URL output. Apps
with custom frame loops can pass a `scheduler` to `createViviWebPlayer` for
deterministic tests or non-standard browser environments.

## Security And Privacy

- No telemetry or remote upload is enabled by default.
- `.vivi` files are fetched only from sources provided by the host app.
- The package is built as a browser-facing bundle and does not expose internal
  workspace packages as public npm dependencies.
- Runtime browser dependencies such as Pixi are bundled into the release files.
  If this changes, the package must move the dependency into `dependencies` or
  `peerDependencies`, update the tarball review, and refresh notices/SBOM
  records before publication.
