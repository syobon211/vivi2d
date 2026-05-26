# ADR 0001: Package Graph And Publication Boundaries

## Status

Accepted for the pre-public OSS refactor.

## Context

Vivi2D is moving from a desktop editor codebase toward a repository that can
support external contributors and selective package publication. The old
workspace shape allowed internal packages to expose `src/*`, which is convenient
before publication but risky for API stability.

## Decision

Keep the root package private. Publish only packages whose intent is marked
`experimental` or `public` in `docs/developer/quality/public-api-status.md`. Public-facing packages must
export built `dist` artifacts, not source files. Internal packages may keep
source exports only while `private: true` and `vivi2d.publication` is
`internal`.

## Consequences

- `check:package-boundaries` is the enforcement point for publication intent.
- Package names may still change before public release.
- Public API reviews should happen before flipping any package from internal to
  experimental or public.
