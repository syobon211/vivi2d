# Contributing to Vivi2D

Thanks for helping make Vivi2D better. This project is still pre-public and
pre-1.0, so APIs, package boundaries, file formats, and release policy may
change before the first OSS release. Contributions are welcome, but changes that
touch public surfaces need extra care.

## Ground Rules

- Be kind and constructive. Follow `CODE_OF_CONDUCT.md`.
- Keep issues and pull requests focused on one problem or feature when possible.
- Do not post security vulnerabilities publicly. Use `SECURITY.md`.
- Do not add secrets, private assets, model weights, generated media, or
  third-party character art unless provenance and license review are complete.
- Avoid third-party compatibility claims in user-facing copy, public API names,
  examples, screenshots, and marketing text unless maintainers have explicitly
  approved the wording.
- Public and experimental package surfaces must match `docs/developer/quality/public-api-status.md`.

## Development Setup

Requirements:

- Node.js 22
- npm 10+
- Playwright browsers for browser and Electron E2E checks

Optional for native runtime work:

- Rust toolchain for `check:runtime-native` and related native checks

Install dependencies:

```bash
npm ci
npx playwright install chromium firefox webkit
```

Run the editor:

```bash
npm run dev
```

Run the desktop app entry after building or packaging-related changes:

```bash
npm start
```

## Common Checks

For most code changes:

```bash
npm run check:quality
```

For stricter pre-release or workflow-sensitive changes:

```bash
npm run check:quality:e2e-workflow-record
```

For focused iteration:

```bash
npm run test
npm run check:packages-types
npm run check:viewer-tests
npm run check:ipc-contract
npm run check:ipc-contract-sync
npm run check:ip-markers
npm run check:ip-product-profile
npm run check:release-surface
```

For UI or workflow changes, run the smallest relevant Playwright project first:

```bash
npm run test:e2e:smoke
npm run test:e2e:workflows
npm run test:e2e:visual
npm run test:e2e:perf
```

The full quality gate can be expensive. It is still the expected final local
gate for large pull requests and release-facing work.

Before starting or merging `@vivi2d/web` SDK implementation work, run
`npm run check:sdk-unlock:web` and review
`docs/developer/api/web-sdk.md` plus
`docs/developer/quality/public-api-status.md`. This unlocks implementation
only; npm publication still needs the release gate.

## Formatting and Style

The repository has existing formatting debt, so avoid broad formatting-only
changes unless the PR is explicitly scoped to that cleanup. Prefer running
Biome on files you touch:

```bash
npx biome check path/to/file.ts
```

Use clear names, small modules, and tests near the behavior being changed.
Production comments should explain non-obvious intent, trust boundaries, or
algorithmic tradeoffs. Do not add comments that merely restate the code.

## Architecture Expectations

Read these before significant changes:

- `docs/developer/architecture/overview.md`
- `docs/developer/architecture/system-map.md`
- `docs/developer/architecture/user-docs-site.md`
- `docs/developer/contributing/task-guides/index.md`
- `docs/developer/contributing/pr-recipes.md`
- `docs/developer/contributing/troubleshooting.md`
- `docs/developer/contributing/package-boundaries.md`
- `docs/developer/security/threat-model.md`
- `docs/developer/quality/public-api-status.md`
- `docs/developer/api/viewer-api.md`
- `docs/developer/ip/policy.md`
- `docs/developer/quality/release-policy.md`
- `docs/developer/quality/public-release-checklist.md`

Important boundaries:

- Keep runtime-neutral logic out of React and Electron-specific modules.
- Keep Electron main/preload access behind typed IPC contracts.
- Update `electron/ipc-contract.cjs` or
  `packages/viewer/electron/ipc-contract.cjs` whenever renderer-to-main IPC
  payloads change.
- Treat project files, PSDs, images, audio, provider responses, Viewer API
  clients, and imported configs as untrusted input.
- Keep optional providers isolated from runtime, renderer, and public web
  package code.
- Do not expose `src/*` from public packages casually.
- Runtime/WASM/native changes must preserve Runtime Spec conformance and public
  profile constraints.
- Viewer API changes must stay disabled by default, loopback-only, scoped,
  user-mediated, and versioned under the reviewed `0.preview` protocol until
  the `1.0` promotion gate is complete.

## Security, Privacy, and IP Checklist

Mention these in pull requests when relevant:

- Electron IPC, file paths, external URLs, provider responses, or WebSocket
  messages are validated.
- No token, private path, local user identifier, private asset, model weight, or
  generated media is committed.
- Public docs and examples use Vivi2D-owned or neutral terminology.
- ComfyUI, See-through, provider, or generated-output changes document license
  and distribution impact.
- Viewer API samples store credentials outside the repository or only in
  browser session storage.
- Public runtime/web package changes use the public model boundary.

## Pull Request Process

1. Start with the smallest coherent change.
2. Add or update tests for behavior changes.
3. Update docs when public behavior, APIs, security posture, or workflows
   change.
4. Run the relevant checks and list them in the PR template.
5. Include screenshots or videos for visible UI changes.
6. Call out unresolved risks, follow-up work, or intentionally skipped checks.

Maintainers may ask for a design note or ADR before accepting changes that
affect package boundaries, public APIs, security architecture, release policy,
native/WASM artifacts, provider distribution, or IP-sensitive terminology.

## Contribution Terms

Vivi2D is licensed under Apache-2.0. The initial OSS contribution model is DCO,
not CLA.

Outside contributions must include a `Signed-off-by` line in each commit. The
recommended way to add it is:

```bash
git commit -s
```

Maintainers should enable an automated DCO check before accepting outside pull
requests. The sign-off line should look like this:

```text
Signed-off-by: Your Name <you@example.com>
```

This means you certify that you have the right to submit the contribution under
the project license.
