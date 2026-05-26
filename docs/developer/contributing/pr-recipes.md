# Common PR Recipes

Use these recipes as lightweight checklists. They do not replace task guides or
the pull request template.

## UI Change

- Update localized copy in all supported UI locales.
- Run `npm run i18n:check:all`.
- Run focused unit or component tests for the changed surface.
- Run the smallest relevant Playwright project.
- If the change touches `src/components/auto-setup/**` or
  `src/lib/auto-setup*.ts`, also complete the
  [Auto Setup task guide](task-guides/auto-setup.md) checklist and obtain
  IP/public-surface review signoff before merge.
- Include screenshots or video when visible behavior changes.
- Run public-copy scanning if docs, screenshots, or release recordings change.

## New E2E Coverage

- Place the spec in the smallest correct Playwright project.
- Use repository-owned synthetic fixtures.
- Avoid private assets, local paths, credentials, and host-specific output.
- Update `scripts/check-e2e-project-coverage.mjs` expectations when the project
  matrix changes.
- Run `npm run check:task-guide-paths` if documented ownership paths changed.
- Keep workflow recordings release-safe.

## Public API Or Package Surface Change

- Update `docs/developer/quality/public-api-status.md`.
- Update the matching `docs/developer/api/*.md` file.
- Run package-boundary, pack-content, release-surface, and external-consumer
  checks.
- Run `npm run check:task-guide-paths` and
  `npm run check:task-guide-gates` when ownership paths or required gates move.
- Do not promise stable compatibility without versioned docs and an ADR.

## User Docs Change

- Keep slug parity across `en`, `ja`, `zh-Hans`, and `ko-KR`.
- Mark incomplete drafts with `status: stub`.
- Run `npm run docs:user:check`.
- Run `npm run check:docs-public-surface`.
- Use `.neutral` media for shared assets. Do not rely on `.en` fallback for
  non-English pages.
- Keep screenshots, captions, transcripts, and metadata release-safe.

