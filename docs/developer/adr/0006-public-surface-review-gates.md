# ADR 0006: Public Surface Review Gates

Status: accepted

## Context

Vivi2D has several public or public-adjacent surfaces: README files,
developer docs, localized user docs, samples, package outputs, screenshots,
workflow recordings, captions, metadata, and future website routes. These
surfaces can accidentally expose unsupported claims, credentials, private data,
or internal terminology.

## Decision

Every new public-facing surface must have a named review gate before it becomes
part of the standard release path. Existing public-surface gates scan docs,
samples, package outputs, release metadata, and localized copy. New task guides
also define which gate proves a contributor change is safe.

Scanner allowlists must be narrow and explain the surface and reason. False
positives should be fixed by tightening the rule or adding a narrow reviewable
allowlist, not by removing the gate.

## Consequences

- Public docs and examples stay safer by default.
- Adding a new docs, sample, media, or package surface requires gate ownership.
- Contributors get clearer feedback when a public-surface boundary is touched.
- Release candidates have a stronger audit trail for public copy and examples.

