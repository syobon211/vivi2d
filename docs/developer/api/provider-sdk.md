---
stability: preview
---

# Provider SDK Preview

`@vivi2d/provider-sdk` defines the provider boundary for external or local
services that propose artifacts to the editor. Providers are untrusted input.

## Current Scope

The SDK may describe:

- provider capabilities
- request and result limits
- artifact-root policy
- path artifact validation
- proposal summaries
- conformance helpers

The SDK must not allow providers to mutate projects directly. Host code must
validate proposals before applying editor commands.

## Current Gates

- `npm run check:provider-conformance`
- `npm run check:provider-sdk-samples`
- `npm run check:sdk-external-consumer`
- `npm run check:ip-product-profile`

The package remains internal/preview until external review and publication
gates are complete.
