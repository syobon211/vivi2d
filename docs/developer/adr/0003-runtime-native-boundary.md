# ADR 0003: Runtime, WASM, And Native Boundary

## Status

Accepted for the pre-public OSS refactor.

## Context

Vivi2D needs an embeddable runtime that can eventually target Web Components,
WASM, native hosts, and C ABI consumers. Freezing editor internals as runtime
API would make future security and compatibility work expensive.

## Decision

Use Runtime Spec v1 as the contract. The TypeScript runtime remains the
reference oracle. WASM and native implementations are private alternate
evaluators until conformance, packaging, support policy, and legal/API review
gates are complete.

## Consequences

- Renderer adapters should consume runtime snapshots, not editor project trees.
- Native and WASM artifacts stay private until release gates are complete.
- C ABI and WASM wrappers are siblings over the same native core rather than one
  wrapping the other.
