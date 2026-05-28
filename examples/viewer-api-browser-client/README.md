# Vivi2D Viewer API Browser Client

This sample demonstrates the browser `Origin` pairing path with the
`@vivi2d/viewer-api-client/browser` SDK entrypoint and without storing
long-lived credentials.

Build the Viewer API client package once, then run the sample from a local Vite
server and approve that exact origin in Vivi2D's connection settings.

```sh
npm run build --workspace @vivi2d/viewer-api-client
npm run dev --prefix examples/viewer-api-browser-client -- --port 58720
```

Open `http://127.0.0.1:58720/`, enter the Viewer API endpoint shown in Vivi2D,
and start pairing. The sample prints a six-digit code. Type that code into
Vivi2D to approve the request.

The browser sample reads `viewer.api.capabilities.get` before pairing, rejects
unknown preview stability or feature surface values, and only asks for scopes
that the server advertises.

Security notes:

- Tokens are kept in `sessionStorage` only and disappear when the tab session
  ends.
- The sample imports only the public `@vivi2d/viewer-api-client/browser`
  package entrypoint.
- Do not host this sample on a public or third-party domain.
- The page uses no third-party scripts, fonts, analytics, or remote assets.
- Browser grants are bound to the exact approved `Origin`; moving the page to a
  different host or port requires a fresh pairing.
- This local sample uses a CSP meta tag for portability. Production pages
  should serve CSP as an HTTP response header.
- Client logic should branch on canonical `error.code` values. Display
  messages may change while the Viewer API remains `0.preview`.
- Keep the granted scopes in memory with the session token and verify the
  required scope before enabling UI actions such as prop writes.
- Announce connection state, pairing results, and rejected requests through an
  `aria-live` region when adapting the sample into a visible browser UI.

For the complete error catalog and compatibility fixtures, see
`docs/developer/api/viewer-api.md` and
`packages/viewer/contracts/viewer-api/0.preview/`.

Run the sample gates from the repository root before changing this example:

```sh
npm run check:viewer-api-samples
```

That command builds the Viewer API client, type-checks and builds this Vite
sample, scans the sample for unsafe imports and credential-like fixtures, then
runs a browser smoke test against a local mock Viewer API WebSocket server.
