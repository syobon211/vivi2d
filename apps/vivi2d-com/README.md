# vivi2d.com Scaffold

This is the first minimal scaffold for the future Vivi2D portal and user
documentation site. It consumes tracked content from `docs/user/` and
intentionally avoids a CMS or copied page data.

## Current Scope

- Build a root portal page for `vivi2d.com`.
- Link the portal to the dedicated documentation host.
- Emit `/docs/` as a compatibility redirect to the English latest docs entry.
- Read `docs/user/publication-manifest.json` as the only publication source.
- Emit `/{locale}/latest/{slug}/` documentation routes only when a manifest route is
  `published: true`.
- Keep draft and placeholder documentation unroutable until the final media and
  release-candidate pass.
- Keep generated route metadata deterministic so public-surface scanners can
  inspect it.

## Commands

```sh
npm run docs:site:build
npm run docs:site:check
```

`docs:site:build` writes to `apps/vivi2d-com/dist/`, which is ignored like other
build output. `docs:site:check` builds into `tmp/`, verifies publication rules,
and confirms the tracked route metadata matches the current manifest.

For a portal deployment, set the documentation target explicitly:

```sh
VIVI_DOCS_BASE_URL=https://docs.vivi2d.com npm run docs:site:build
```

Local builds leave `VIVI_DOCS_BASE_URL` empty so generated links can be tested on
the same preview host.

## Hosting Plan

The planned public deployment is:

- domain registration through Cloudflare Registrar,
- DNS through Cloudflare,
- `vivi2d.com` as the product portal,
- `docs.vivi2d.com` as the user documentation host,
- `vivi2d.com/docs` as a compatibility redirect to
  `docs.vivi2d.com/en/latest/`,
- initial static hosting on Cloudflare Pages or Vercel,
- optional future subdomains such as `api.vivi2d.com` and `cdn.vivi2d.com`.

No deployment is configured in this scaffold yet.
