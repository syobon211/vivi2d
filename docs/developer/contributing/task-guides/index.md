# Task Guides

Task guides are "where to start" maps for common contributor work. They do not
replace API references, architecture docs, or release policy. Use them to find
the primary files, safety boundaries, and gates for a focused change.

## Guides

- [Viewer API](viewer-api.md)
- [Auto Setup](auto-setup.md)
- [Internationalization](i18n.md)
- [SDK samples](sdk-samples.md)

## Shared Expectations

- Keep each pull request focused on one task area when possible.
- Follow the package boundaries documented in
  [`../package-boundaries.md`](../package-boundaries.md).
- Update public API docs when a package, protocol, or sample surface changes.
- Run the focused gates listed in the matching task guide before the broad
  quality gate.
- Escalate security, IP, release-surface, or public API uncertainty early.

## Standard Guide Shape

Each guide uses the same structure:

- **When To Use This Guide**: the kind of change covered by the guide.
- **Ownership And Boundaries**: the trust, package, public-surface, or release
  constraints that matter most.
- **Primary Files**: the first repository paths to inspect.
- **Tests And Gates**: focused commands that prove the change.
- **Safe Change Pattern**: a small workflow that avoids common mistakes.
- **Common Failure Modes**: issues contributors usually hit first.
- **PR Checklist**: review items to mention in the pull request.
- **Related Docs**: deeper references owned elsewhere.

