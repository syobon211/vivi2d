# ADR 0002: Provider And Plugin Boundary

## Status

Accepted for the pre-public OSS refactor.

## Context

ComfyUI and See-through style integrations can involve local services, generated
assets, optional Python code, and separate license obligations. Treating those
integrations as first-party editor internals would make publication and security
review harder.

## Decision

Keep provider contracts behind `packages/provider-sdk/` and concrete provider
adapters behind provider packages or separate repositories. The main editor,
runtime packages, renderers, and `@vivi2d/web` must not depend on optional
provider implementation details.

## Consequences

- Provider outputs are treated as untrusted until validated.
- Optional provider plugins can use different release cadence and licensing.
- ComfyUI distribution and Python dependency decisions remain explicit release
  gates instead of implicit editor dependencies.
