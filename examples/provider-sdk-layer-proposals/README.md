# Provider SDK Layer Proposal Examples

These examples show the preview `@vivi2d/provider-sdk` contract for safe layer
proposal workflows.

They are intentionally small and deterministic. They do not call external
services, do not load credentials, and do not apply provider output to a project
without review.

Run from the repository root after building packages:

```sh
npm run build --workspace @vivi2d/provider-sdk
node examples/provider-sdk-layer-proposals/mask-proposal.mjs
node examples/provider-sdk-layer-proposals/alpha-matte.mjs
node examples/provider-sdk-layer-proposals/underpaint.mjs
npm run check:provider-sdk-samples
```

The examples cover:

- `maskProposal`: a provider-owned, non-protected semantic mask suggestion.
- `alphaMatte`: a matte proposal that references a reviewed mask artifact.
- `underpaint`: generated hidden content kept distinct from source artwork.

Each example prints a safe summary instead of raw artifact bytes. The summary is
limited to artifact kind, media type, byte length, provider provenance, and
review-safe metadata so sample logs do not become a data export path.
