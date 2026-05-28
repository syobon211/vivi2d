# Vivi2D Viewer API

The Viewer API is an experimental local automation protocol for the Vivi2D
viewer. It is intended for same-machine tools that need to read viewer-session
state, run safe viewer actions, manage stream props, or inspect tracking
calibration summaries.

This API is disabled by default, loopback-only, scoped, and user-mediated. It is
not a model authoring API and it is not a compatibility layer for third-party
avatar protocols.

Protocol status: `0.preview`

The remaining promotion gates are tracked through
`docs/developer/quality/public-api-status.md` and this API reference. The viewer
app package itself remains internal even if the local protocol is promoted.

## Overview

The API uses WebSocket messages with a Vivi2D-owned envelope:

```json
{
  "api": "ViviViewerApi",
  "version": "0.preview",
  "id": "request-1",
  "type": "viewer.api.capabilities.get",
  "data": {}
}
```

Successful responses use `ok: true`. Failures use `ok: false` plus a canonical
error object. Clients should branch on `error.code`, not on the display
message. Only the display message is localization-friendly; code paths must
continue to use the stable error code.

The current contract fixtures live under:

```text
packages/viewer/contracts/viewer-api/0.preview/
```

The previous `0.experimental` fixtures remain in the repository as migration
references. The server accepts `0.experimental` and `0.preview` during the
preview transition, but a single WebSocket session cannot switch versions after
its first valid request.

## Pairing Flow

1. The user enables the Local API in Vivi2D's Connect Center.
2. The user opens a pairing window.
3. The client sends `viewer.auth.challenge` with its app name and requested
   scopes.
4. The client displays the six-digit code returned by the challenge response.
5. The user types that code into Vivi2D and approves the request.
6. The client receives an opaque `grantId`, display-only `fingerprint`, and
   token, authenticates with the token, and then sends scoped requests.

The viewer intentionally does not show API tokens in the UI. Pairing codes are
short-lived and disappear after approval, expiry, or revocation.
Clients should read pairing code TTL, pairing window TTL, and token lifetime
metadata from capabilities instead of hard-coding timers.
If capabilities report session-only token persistence, clients should expect
tokens to stop working after viewer restart even when no elapsed-time TTL is
advertised.
`fingerprint` is only for UI display and audit messages. Grant-bound operations,
including approved prop asset handles, use the opaque grant association created
by pairing. Current socket-bound requests do not send `grantId`; the server
derives it from the authenticated socket and asset handle. Using a display
fingerprint as a grant identifier is unauthorized.

## Token Storage And Revocation

Native samples store tokens outside this repository in a user config directory
with owner-only permissions when the platform supports it. Browser samples keep
tokens in `sessionStorage` only.

Users can revoke grants or require a client to re-pair from the Connect Center.
Revocation closes active sessions and removes pending prop asset handles for
that grant. In-flight grant-bound requests are aborted on a best-effort basis;
if a renderer operation finishes after revocation, the stale result is
discarded and the client receives `grant_revoked`. Clients must treat
`grant_revoked` as final and start a new pairing flow if the user wants to
reconnect.
Grant revocation events expose only the display `fingerprint`, not the opaque
grant ID. In `0.preview`, they also include `reason: "revoked"`.
In `0.experimental` compatibility sockets, that display fingerprint may still
appear in `data.grantId`. In `0.preview`, revocation events expose
`data.fingerprint` plus `data.reason: "revoked"`.

If secure platform storage is unavailable, Vivi2D may use development-only
session grants. Plaintext persistent token storage is not a supported release
mode.

## Browser Origin Binding

Browser clients must connect with an `Origin` header that exactly matches the
origin approved during pairing. Moving the same page to a different host or port
requires a fresh grant.
Vivi2D canonicalizes origins once for grant binding, authentication,
diagnostics, and rate limits: scheme and host are lowercased, internationalized
domains are converted through the URL parser, default ports are removed, and
only `scheme://host[:port]` is compared.

Native loopback clients usually have no `Origin` header and are bound as
`no-origin`. A grant for `no-origin` cannot be reused by a browser origin, and a
browser-origin grant cannot be reused by a native no-origin client.
Browser requests with `Origin: null`, including `file://` or sandboxed pages,
are not treated as native no-origin clients and are rejected.

## Scopes

Scopes are intentionally small and risk grouped:

| Scope | Capability |
| --- | --- |
| `read:state` | Read safe viewer-session state. |
| `read:signals` | Read public control-signal summaries. |
| `read:props` | List public prop summaries. |
| `read:actions` | List safe viewer action summaries and action lifecycle events. |
| `read:calibration` | Read calibration summaries, not raw private device data. |
| `run:actions:safe` | Run approved safe viewer actions, apply expression presets, and apply bounded model transforms. |
| `write:signals` | Write bounded viewer-session control signals. |
| `write:props` | Add, update, remove, and cycle viewer props. |
| `write:calibration` | Update calibration settings through bounded schemas. |

Clients should request the narrowest scopes they need. Vivi2D does not silently
expand a grant after approval.

## Canonical Errors

Every public failure response includes this error shape. In `0.preview`, valid
known request types respond with `${type}.result` for both success and
protocol-level failures. `viewer.error` is reserved for malformed frames that
cannot be associated with a valid request type, such as malformed JSON, invalid
API/version, an unknown request type, or an over-length request ID.

```json
{
  "api": "ViviViewerApi",
  "version": "0.preview",
  "id": "request-1",
  "type": "viewer.prop.load.result",
  "ok": false,
  "data": {},
  "error": {
    "code": "scope_denied",
    "message": "scope denied",
    "retryable": false,
    "details": {
      "requiredScopes": ["write:props"]
    }
  }
}
```

Supported error codes:

| Code | Retryable meaning |
| --- | --- |
| `invalid_request` | Fix the request shape before retrying. |
| `unauthenticated` | Authenticate or pair first. |
| `scope_denied` | The grant lacks a required scope. |
| `origin_mismatch` | The request origin does not match the approved grant. |
| `rate_limited` | Retry later with backoff. |
| `payload_too_large` | Reduce a syntactically valid request payload or inline prop size. |
| `asset_unavailable` | Asset handle is expired, consumed, unauthorized, or over the asset limit. |
| `pairing_required` | Ask the user to open pairing. |
| `pairing_closed` | Start a fresh pairing flow after user action. |
| `pairing_code_mismatch` | The user-entered pairing code was wrong while attempts remain. |
| `grant_revoked` | Start a fresh pairing flow only if the user approves. |
| `host_capability_unavailable` | The host lacks a required secure capability, such as release-safe token storage. |
| `renderer_unavailable` | Retry after the viewer recovers. |
| `renderer_timeout` | Retry later with backoff. |
| `unsupported` | The feature is known but not available. |
| `internal_error` | Sanitized fallback; retry conservatively. |

Error messages are sanitized catalog strings. Details are allowlisted and do not
echo rejected values, tokens, stack traces, local paths, or raw parser messages.
Every public error code has a canonical fixture in
`packages/viewer/contracts/viewer-api/0.preview/errors.*.response.json`.
For rate limits, `details.bucket` may be `origin`, `no-origin`, or `global`.
For asset handles, wire-level `asset_unavailable.details.reason` only
distinguishes `expired`, `consumed`, `unauthorized`, and `limit_exceeded`.
`unauthorized` deliberately covers wrong grant, wrong origin, and missing
handles so clients cannot probe internal handle state.
Oversized WebSocket text frames close with `frame_too_large`. Syntactically
valid request payloads that exceed `maxRequestPayloadBytes` return
`payload_too_large`.
Asset-handle limits return `asset_unavailable` with allowlisted
`details.reason`. Some policy failures are rejected during WebSocket upgrade
when possible. If a policy violation is detected after upgrade, it is exposed as
a close reason such as `origin_mismatch`, `frame_too_large`, `binary_rejected`,
or `compression_rejected`.

## Event Subscriptions

Clients subscribe with `viewer.events.subscribe`. Events are scoped and bounded.
Slow subscribers may receive `viewer.events.dropped` when their event queue
overflows.
Clients should treat its `count` as the number of events dropped since the last
dropped-event notice for that category, not as a session total.
Its `category` describes subscription-delivery events only; automatic meta
events are not counted as dropped subscription events.
Dropped-event notices use a reserved control lane and may coalesce counts per
category so the notice itself is not lost behind the overflowing subscription
queue.
Automatic meta events such as `viewer.events.dropped` and
`viewer.api.grant.revoked` are pushed to authenticated sockets regardless of
explicit subscription state and are not legal subscribe/unsubscribe arguments.
`viewer.api.grant.revoked` is sent only to sockets bound to the revoked grant;
`viewer.events.dropped` is sent only to the socket whose event queue overflowed.

Current prop lifecycle events include:

- `viewer.prop.added`
- `viewer.prop.updated`
- `viewer.prop.removed`

Clients should use event IDs for ordering within one session and should refresh
state after any dropped-event notice.

## Prop Loading

The public API supports two prop source kinds:

- `inlineBase64`: bounded static image bytes in the request.
- `filePickerAsset`: a short-lived handle created by the user in Vivi2D.

`inlineBase64` is useful for small portable assets that fit under both the
decoded inline-prop limit and the WebSocket text-frame limit after base64 and
JSON overhead. Responses never echo the inline bytes; they expose only safe
source metadata such as MIME type, portability, and byte count.

`filePickerAsset` is used when the user selects a local image in the Overlays
panel and explicitly shares a one-time handle with an approved client. Asset
handles are opaque, random, grant-bound, origin-bound, short-lived, and consumed
only after the renderer accepts the prop load. Clients should read the per-grant
asset-handle count limit and handle TTL from capabilities.

```json
{
  "type": "viewer.prop.load",
  "data": {
    "name": "User Approved Badge",
    "source": {
      "kind": "filePickerAsset",
      "assetId": "vpa_opaque-random-id",
      "mimeType": "image/png",
      "bytes": 123456
    }
  }
}
```

API prop handles never expose local paths. If a handle expires, is consumed, is
used by an unauthorized grant or origin, is missing, or exceeds limits, the
client receives `asset_unavailable`.

Allowed API prop formats in this phase:

- static PNG
- static JPEG
- static WebP

Animated formats may be available in the local UI but are not supported through
public API handles in this phase.

## Unsupported Surfaces

The Viewer API does not support:

- remote URL prop loading
- API-supplied local filesystem paths
- API-triggered file pickers
- raw camera, microphone, tracker landmark, or private device data
- model authoring, rig authoring, or runtime deformation authoring
- package-format import/export compatibility with third-party products
- scalar controls that write mesh, lattice, shape, opacity, or draw-order deltas

If a client receives `unsupported`, it should refresh capabilities and avoid
assuming that cached experimental features still exist.

## Migration Notes From `0.experimental`

The protocol may still change before a stable `1.0` release. Breaking changes
are tracked through versioned contract fixtures and sample-client checks.

Notable `0.preview` changes:

- `viewer.auth.challenge` now returns a pending `phase` first, then
  `viewer.auth.challenge.completed` when the user approves or the challenge
  fails.
- `viewer.auth.authenticate` responds as `viewer.auth.authenticate.result` and
  returns `grantId`, display `fingerprint`, approved `scopes`, and
  `tokenPersistence`.
- Capabilities split request, event, and scope metadata into `core` and
  `extensions` sections. `requestTypes` entries are objects, not strings.
- Valid known request failures use `${type}.result`; `viewer.error` is for
  malformed or unknown frames only.
- `viewer.events.dropped` no longer includes `streamClosed`.
- Sample clients must reject unexpected error shapes and branch on
  `error.code`.
- Public examples must not commit token files, session files, local paths, or
  generated grants.

Run these local checks before relying on a protocol change:

```sh
npm run check:viewer-api-contracts
npm run check:viewer-api-samples
npm run check:viewer-api-e2e
```

Sample documentation should link back to this document or to the contract
fixtures instead of duplicating the full protocol shape, so fixture changes stay
reviewable in one place.
