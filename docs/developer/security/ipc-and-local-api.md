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

### Saving And Exporting Files

Project saves and exports write a temporary sibling, flush it, and rename it
over the selected regular file. A failed write or rename preserves the previous
file; this is per-file replacement, not a transaction across an export bundle or
a power-loss durability guarantee. Existing linked export paths are rejected.
Saving directly through a file symlink is also unsupported: select the regular
target or use Save As with a new regular file.

New files request POSIX mode `0600` to avoid making artwork readable by other
local accounts by default. Existing regular-file permission bits are used for
temporary-file creation, still subject to the process umask. Windows uses the
destination directory's inherited ACLs; `0600` is not a Windows privacy guarantee.
Sharing exports with another account or a local web server requires an explicit
permissions decision by the user.

Replacement requires write permission on the containing directory and creates a
new file identity. It does not preserve the old inode, ownership, custom ACLs, or
extended attributes. Temporary-file cleanup is best effort if the filesystem
refuses deletion. Export checks reject existing link traps; they do not claim
race-proof protection against a same-user process concurrently replacing parent
directories.

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
