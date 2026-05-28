# Vivi2D Viewer API Node Client

This sample demonstrates the minimum safe flow:

1. Connect to the loopback Viewer API endpoint shown in Vivi2D.
2. Read `viewer.api.capabilities.get` before pairing and reject unknown preview
   stability or feature surface values.
3. Request pairing with read-only scopes after confirming those scopes are
   advertised by the server.
4. Type the six-digit code printed by this sample into Vivi2D's connection
   settings.
5. Approve the request in Vivi2D.
6. Store the issued token outside this repository.
7. Authenticate and call `viewer.state.get`.

Run:

```sh
node examples/viewer-api-node-client/client.mjs --endpoint ws://127.0.0.1:12345
```

Copy the current endpoint from Vivi2D's connection settings. `--port` is also
accepted when you only want to pass the numeric loopback port:

```sh
node examples/viewer-api-node-client/client.mjs --port 12345
```

Tokens are stored under your user config directory with owner-only permissions
where the platform supports it. The sample refuses to store tokens in this
repository, public user folders, temporary directories, or network-share-looking
paths.

The sample expects canonical Viewer API errors:

```json
{ "error": { "code": "scope_denied", "message": "scope denied" } }
```

Client logic should branch on `error.code`. Error messages are display text and
may change while the protocol remains `0.preview`.

For the complete error catalog and compatibility fixtures, see
`docs/developer/api/viewer-api.md` and
`packages/viewer/contracts/viewer-api/0.preview/`.
