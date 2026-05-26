# @vivi2d/viewer-api-client

Internal preview SDK for the local Vivi2D Viewer API.

This package helps local tools connect to a running Vivi2D Viewer over the
`0.preview` WebSocket protocol. It handles endpoint validation, capabilities,
pairing, token authentication, scope checks, request envelopes, and canonical
client errors.

## Status

This package is private/internal while the Viewer API contract is still
`0.preview`. Request names, event names, scopes, and error details may change
before the package becomes experimental.

## Entry Points

- `@vivi2d/viewer-api-client`: shared types and core helpers.
- `@vivi2d/viewer-api-client/node`: Node-friendly loopback endpoint validation.
- `@vivi2d/viewer-api-client/browser`: browser `Origin` pairing flow and
  `sessionStorage` token store.
- `@vivi2d/viewer-api-client/testing`: in-memory WebSocket fixtures for unit
  tests.

## Node Quickstart

```ts
import { createViviViewerClient } from "@vivi2d/viewer-api-client/node";
import WebSocket from "ws";

const client = createViviViewerClient({
  endpoint: "ws://127.0.0.1:58720",
  appName: "Example Local Tool",
  scopes: ["read:state"],
  webSocketFactory: (endpoint) => new WebSocket(endpoint),
});

await client.connect();

const grant = await client.pair({
  async onChallenge(challenge) {
    console.log(`Approve this code in Vivi2D: ${challenge.code}`);
  },
});

console.log({
  grantId: grant.grantId,
  scopes: grant.scopes,
});

const state = await client.state.get();
console.log({ state });

client.disconnect();
```

## Browser Quickstart

Use the browser entrypoint when your app runs in a page and needs an
Origin-bound grant:

```ts
import {
  createSessionStorageTokenStore,
  createViviViewerClient,
} from "@vivi2d/viewer-api-client/browser";

const client = createViviViewerClient({
  endpoint: "ws://127.0.0.1:58720",
  appName: "Example Browser Tool",
  scopes: ["read:state"],
  tokenStore: createSessionStorageTokenStore(),
});

await client.connect();

if (!(await client.authenticateStoredGrant())) {
  await client.pair({
    onChallenge(challenge) {
      showPairingCodeToUser(challenge.code);
    },
  });
}

const state = await client.state.get();
renderState(state);
```

Run the complete browser sample from the repository root:

```sh
npm run check:viewer-api-samples
```

The sample gate builds the package, type-checks and builds the browser example,
scans for private imports or credential-like fixtures, and runs a browser smoke
test against a local mock Viewer API server.

## Scopes And Capabilities

Call `connect()` before protected requests. The client reads
`viewer.api.capabilities.get`, validates the preview contract, and verifies that
requested scopes are advertised. High-level helpers such as `state.get()` check
scope requirements before sending protocol messages, so insufficient grants fail
locally with a canonical client error.

## Error Handling

Branch on `ViviViewerApiClientError.code`, not display text:

```ts
import { ViviViewerApiClientError } from "@vivi2d/viewer-api-client";

try {
  await client.state.get();
} catch (error) {
  if (error instanceof ViviViewerApiClientError) {
    switch (error.code) {
      case "scope_denied":
        showMessage("The approved grant is missing a required scope.");
        break;
      case "transport_timeout":
        showMessage("The Viewer API did not respond in time.");
        break;
      default:
        showMessage("The Viewer API request failed.");
        break;
    }
  }
}
```

Do not render raw `error.message`, `cause`, URLs, tokens, or stack traces in
public logs or bug reports.

## Security Notes

- Only connect to loopback Viewer API endpoints.
- Browser pages must use exact `Origin` pairing and should store grants in
  `sessionStorage` unless the host app has a stronger token policy.
- Samples must use package root/subpath exports, never `src/*` or workspace
  relative imports.
- Do not commit token stores, grant files, pairing codes, traces containing
  tokens, or full WebSocket payload logs.
