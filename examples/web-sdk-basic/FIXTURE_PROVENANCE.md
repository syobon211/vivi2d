# Generated Fixture Provenance

- Fixture path: `public/generated-avatar.vivi`
- Checksum path: `generated-avatar.vivi.sha256`
- Generator command: `npm run build:fixtures`
- Check command: `npm run build:fixtures -- --check`
- Generator source: `scripts/generate-web-sdk-basic-fixture.mjs`
- Supported regeneration runtime: Node.js 22
- Maximum fixture size: 20 KiB

The fixture is deterministic synthetic geometry for the Web SDK sample. It does
not consume third-party artwork, local user files, provider output, private
profile data, editor-only preview data, or authoring-only deformation fields.

Regeneration is a monorepo maintenance task. Copied-out users should treat the
committed `.vivi` bytes as the sample contract and should not need to regenerate
the fixture.
