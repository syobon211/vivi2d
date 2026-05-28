# IPC And Local API Boundary

Electron IPC and the local Viewer API are privileged boundaries. Treat renderer
requests, Viewer API clients, imported files, provider responses, and local
service output as untrusted input.

## Electron IPC

- Renderer code must use preload-exposed APIs.
- Main/preload handlers validate payloads before privileged file, URL, or
  process effects.
- Channel changes must update the relevant IPC contract and tests.

Relevant gates:

```bash
npm run check:ipc-contract
npm run check:ipc-contract-sync
npm run check:security-patterns
```

## Local Viewer API

- Disabled by default.
- Loopback-only.
- Browser clients require approved Origin binding.
- Native origin-less clients still require token authentication.
- Pairing is user-mediated.
- Requests are scope-checked and rate-limited.

Protocol and client details live in
[`../api/viewer-api.md`](../api/viewer-api.md).

## Logging And Diagnostics

Do not log tokens, full local paths, provider prompts, service URLs with
credentials, private artwork names, or raw imported payloads. Public screenshots,
workflow recordings, and issue bundles must use sanitized summaries.
