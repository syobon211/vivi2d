# Threat Model

Vivi2D is a desktop-first editor that opens user-controlled files, talks to
local services, and generates release artifacts. This document captures the
minimum threat model for the OSS-ready refactor.

## Trust Boundaries

- Renderer UI is less trusted than Electron main/preload.
- Project files, PSD files, image/audio files, and bundles are untrusted input.
- ComfyUI is an untrusted local provider, even when accessed through loopback.
- Generated assets are untrusted until validated and recorded.
- Future viewer automation clients, browser embeddings, imported props, and
  imported viewer configs are untrusted input even when they connect through
  loopback or same-machine tools.
- GitHub Actions logs, artifacts, issues, and PR comments can become public
  release surfaces.

## Key Threats

- Malicious `.vivi`, `.vivb`, `.vivid`, PSD, PNG, WebP, or audio files causing
  parser denial of service, memory exhaustion, decompression bombs, malformed
  dimensions, prototype pollution, or path confusion.
- Malicious renderer code calling privileged IPC with malformed payloads.
- Malicious ComfyUI responses using path traversal, huge downloads, forged
  history objects, fake extensions, or malformed manifests.
- Compromised ComfyUI custom nodes running arbitrary Python with the user's
  local privileges.
- Export path attacks using symlinks, junctions, UNC paths, Windows reserved
  names, case folding, or TOCTOU behavior.
- Unsafe external links using phishing, custom protocols, credential-bearing
  URLs, or broad `shell.openExternal` handling.
- Future local Viewer API misuse through hostile browser origins, DNS rebinding,
  forged `Host` headers, pairing prompt floods, stolen/revoked tokens, oversized
  messages, or slow event subscribers.
- Pairing UI denial of service through repeated local auth challenges that
  steal focus, create dialog spam, or trick the user into approving an unknown
  client.
- Imported viewer props or API prop payloads using local path disclosure,
  decompression bombs, metadata bombs, huge animation frame counts, unsupported
  formats, or script-capable image/vector formats.
- Imported viewer actions, prop configs, and tracking calibration profiles
  using prototype-pollution keys, oversized maps, unsafe script/bridge actions,
  invalid scalar ranges, or malformed action payloads.
- Portable viewer config export accidentally including credentials such as OBS
  passwords, API tokens, bridge tokens, private paths, or account identifiers.
- Supply-chain compromise through npm, Python dependencies, GitHub Actions, or
  release artifact substitution.
- Viewer tracking asset substitution through MediaPipe WASM/model drift,
  lockfile mismatch, accidental remote fallback, or unexpected user IP exposure
  if a development-only third-party asset host override is reintroduced.
- Native or WASM runtime artifacts drifting from reviewed Rust source,
  exhausting host memory, exposing raw pointers, or being loaded from ambient
  search paths instead of explicit package/release locations.
- Public repository visibility exposing historical secrets, third-party assets,
  model weights, private generated artifacts, or security discussions.

## Required Controls

- Typed IPC registry and main-process schema validation.
- Path allowlists plus platform-specific path escape tests.
- Restrictive production CSP and documented dev-only exceptions.
- Size limits and structural validation before parsing or importing files.
- Async or isolated parsing for expensive inputs; prefer subprocess or Electron
  `utilityProcess` for parser isolation where practical.
- ComfyUI I/O constrained to selected buffers or allowlisted files.
- ComfyUI JSON responses are shape-checked before they affect renderer state.
- Downloaded ComfyUI artifacts are size-limited before being returned across
  IPC.
- Magic-byte/header/structure checks for downloaded artifacts.
- Explicit timeout and cancellation for long-running workflows.
- No telemetry, crash reporting, or remote upload by default.
- Viewer automation APIs are disabled by default, loopback-only by default,
  require loopback-literal `Host`, validate browser `Origin`, reject
  DNS-rebinding-style requests, accept pairing challenges only while the user
  has opened a pairing window, require the viewer-displayed six-digit pairing
  code during approval, and use revocable/rotatable scoped tokens.
- Viewer automation write budgets are charged only after authentication and
  scope checks, and in-flight API requests are aborted or rejected if their
  grant is revoked or rotated before completion.
- Persistent viewer API grants require platform-backed secure storage. If
  secure storage is unavailable, only development-only session grants may be
  used, and plaintext persistent token storage is forbidden.
- Viewer automation messages and every new Electron IPC channel are validated
  through a typed contract with payload limits, malformed-call tests, and
  bounded event queues/backpressure.
- Viewer props are accepted only from file-picker handles, bounded inline
  bytes, or reviewed remote URLs; portable configs and API payloads must not
  carry arbitrary local path strings.
- Viewer API file-picker asset handles are created only by explicit user
  selection in the viewer UI, are opaque and one-time-use, are bound to the
  approved grant plus browser origin binding, and are removed on expiry,
  consumption, grant revocation, server stop, or renderer close.
- Viewer actions, props, and tracking calibration profiles are parsed through
  bounded schemas. Imported script/calibration actions require explicit review,
  calibration channel IDs reject prototype-pollution keys, and calibration
  stays limited to finite scalar conditioning.
- Exported viewer configs must not contain credentials, API tokens, OBS
  passwords, bridge tokens, private paths by default, or local user/account
  identifiers.
- Full git-history and hosted-surface review before public release.
- Native/WASM runtime artifacts are built from reviewed source, validated before
  embedding or release, use copy-oriented host APIs by default, declare a bounded
  WASM linear-memory maximum for internal artifacts, and are covered by browser
  smoke plus conformance fixtures before publication.
- MediaPipe WASM and model assets used by public viewer tracking are
  same-origin vendored release assets under
  `packages/viewer/public/vendor/mediapipe/tasks-vision-0.10.35/` and must
  match `packages/viewer/mediapipe-assets.lock.json`.
- `npm run check:viewer-mediapipe-assets` is the source of truth for the
  vendored MediaPipe asset set. `check:oss-readiness`,
  `check:publication-history`, `check:native-artifact-policy`, and
  `check:security-patterns` treat only that locked asset set as reviewed
  third-party runtime material.
- Remote MediaPipe CDN loading must not be required by a packaged public build.
  Refreshes must go through `npm run vendor:viewer-mediapipe-assets`, review the
  upstream version and downloaded model URLs, update the lockfile, and rerun the
  release gates.
- External links opened by Electron are restricted to HTTPS URLs without
  embedded credentials.
- CI blocks new production uses of high-risk renderer APIs such as
  `innerHTML`, `dangerouslySetInnerHTML`, `eval`, and `new Function`.
