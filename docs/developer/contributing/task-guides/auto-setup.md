# Auto Setup Task Guide

## When To Use This Guide

Use this guide for Auto Setup workflows, manual split integration, accepted
masks, motion handle suggestions, stress checks, cleanup summaries, safe plan
validation, and Auto Setup review UI.

## Ownership And Boundaries

- Preview-only data must never enter saved project data, runtime payloads,
  provider artifacts, public docs, or sample outputs.
- Accepted masks and cleanup plans need strong stale-state checks before they
  are used to produce a safe plan.
- Generated or diagnostic details must be projected into public-safe summaries
  before they leave editor-only code.
- Public UI copy should be action-oriented and must not expose internal
  algorithm names or detection mechanics.
- Contributor-facing docs may cite `check:auto-setup-ip-compliance`; they must
  not describe lower-level scanner mechanics, detection thresholds, or
  enforcement internals.

## Primary Files

- `src/components/auto-setup/**`
- `src/lib/auto-setup*.ts`
- `packages/editor-core/src/safe-auto-setup-plan.ts`
- `packages/editor-core/src/motion-*.ts`
- `packages/editor-core/src/manual-split-*.ts`

## Tests And Gates

```bash
npm run check:auto-setup-ip-compliance
npm run check:docs-public-surface
npm run check:architecture-boundaries
npm run test:e2e:workflows
npm run test:e2e:visual
```

Also run the focused editor-core or component tests that cover the changed
helper or panel.

## Safe Change Pattern

1. Keep domain logic in editor-core or feature helpers before touching React UI.
2. Keep review UI as a projection of safe summaries, not raw diagnostics.
3. Validate stale-state preconditions before compiling a safe setup plan.
4. Re-run the Auto Setup compliance gate when touching boundaries, copy, or
   accepted-mask inputs.
5. Capture screenshots or short videos for visible review-panel changes.

## Common Failure Modes

- A UI edit preserves stale review data after a handle or mask changes.
- A diagnostic helper returns raw source-derived details instead of a bounded
  summary.
- A cleanup plan is accepted without rechecking target layer or mask state.
- A copy change introduces internal terminology into visible UI.
- A fix changes Auto Setup UI without updating workflow E2E coverage.

## PR Checklist

- Safe plan output contains only approved operation summaries.
- Preview-only data is blocked from save/export/runtime/provider/public paths.
- Stale-state checks cover the source layer, accepted mask, placement, and
  relevant target layers.
- Auto Setup task-guide content or UI copy received IP/public-surface review
  when changed.
- Focused tests and relevant E2E gates are listed in the PR.

## Related Docs

- [`../../architecture/editor-runtime-boundary.md`](../../architecture/editor-runtime-boundary.md)
- [`../../ip/policy.md`](../../ip/policy.md)
- [`../../quality/public-api-status.md`](../../quality/public-api-status.md)
- [`../testing.md`](../testing.md)
