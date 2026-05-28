# ADR 0005: Documentation Contributor Guides

Status: accepted

## Context

The repository has a clear documentation split between the root README,
developer documentation, localized user documentation, and ignored backlog
notes. Contributors still need a short path from a practical task to the files,
boundaries, and checks that matter for that task.

## Decision

Vivi2D will maintain task-oriented contributor guides under
`docs/developer/contributing/task-guides/`. These guides are maps, not API
references. Each guide lists when to use it, ownership boundaries, primary
files, required gates, safe change patterns, common failure modes, PR checklist
items, and related canonical docs.

Task-guide path and gate references are checked by repository scripts so the
guides fail closed when ownership paths or required commands drift.

## Consequences

- Contributors can start common changes without reading the whole repository.
- Task guides need regular maintenance when files or gates move.
- API details remain in `docs/developer/api/`, not duplicated in task guides.
- Security, IP, and public-surface reminders become easier to find during
  normal contribution flow.

