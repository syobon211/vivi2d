# Editor And Runtime Boundary

Vivi2D separates authoring data from runtime/public payloads. This separation is
one of the main OSS-readiness guardrails.

## Editor-Only Data

Editor-only data may include:

- draft Auto Setup state
- manual split editing buffers
- local motion preview diagnostics
- provider proposal review state
- UI selections, warnings, and temporary repair suggestions

Editor-only data must not be serialized into public runtime payloads, SDK
fixtures, provider artifacts, or public user documentation examples unless a
specific public schema has been reviewed.

## Runtime/Public Data

Runtime/public data may include:

- public-profile `.vivi` model data
- layers, meshes, bones, static skin weights, IK, physics, masks, and controller
  values that pass public-profile validation
- runtime render snapshots
- stable or preview API envelopes documented in
  [`../api/index.md`](../api/index.md)

## Safe Promotion Rule

Authoring helpers can generate runtime-safe operations only through reviewed
plans, such as `SafeAutoSetupPlan`. The plan output must be validated before it
is applied or exported.

Never promote:

- preview geometry buffers
- parameter-indexed mesh deltas
- solver internals
- provider raw IDs, prompts, service URLs, or private artifact paths
- private deformation terminology in public schemas or docs

## Checks

Relevant gates include:

- `npm run check:architecture-boundaries`
- `npm run check:package-boundaries`
- `npm run check:ip-product-profile`
- `npm run check:local-motion-private-markers`
- `npm run check:release-surface`
