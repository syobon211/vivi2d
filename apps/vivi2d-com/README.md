# vivi2d.com Scaffold

This is the first minimal scaffold for the future Vivi2D portal and user
documentation site. It consumes tracked content from `docs/user/` and
intentionally avoids a CMS or copied page data.

## Current Scope

- Build a root portal page for `vivi2d.com`.
- Link the portal to `https://docs.vivi2d.com/` as the reserved public docs
  entry point.
- Emit `/docs/` as a compatibility redirect to the same public docs entry point.
- Read `docs/user/publication-manifest.json` as the only publication source.
- Emit `/{locale}/latest/{slug}/` documentation routes only when a manifest route is
  `published: true`.
- Emit canonical `robots.txt` and `sitemap.xml` files for `https://vivi2d.com`.
- Emit Cloudflare Workers static assets `_headers` with reviewed security
  headers for the public portal.
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

The public Docs link points at `https://docs.vivi2d.com/`. Until hosted docs are
published there, configure that hostname in Cloudflare as a temporary redirect
to the GitHub `docs/` tree. For a later deployment that publishes generated docs
routes directly, set the documentation target explicitly:

```sh
VIVI_DOCS_BASE_URL=https://docs.vivi2d.com npm run docs:site:build
```

Local and early public builds leave `VIVI_DOCS_BASE_URL` empty so the portal
does not link directly to unpublished generated docs routes.

## Cloudflare Workers Deploy

The portal is configured for Cloudflare Workers static assets through the root
`wrangler.jsonc`. The dashboard's Git deploy setup should use:

```text
Project name: vivi2d
Root directory: /
Build command: npm run docs:site:build
Deploy command: npx wrangler deploy
Variables: none required
```

`wrangler.jsonc` intentionally has no Worker script entry point. Wrangler uploads
the generated files from `apps/vivi2d-com/dist/` as static assets, keeping the
initial portal deployment to HTML/CSS only. After the first successful deploy,
attach the custom domain `vivi2d.com` from the Worker's Settings > Domains page.

For the reserved docs host before hosted docs are published:

```text
DNS record: CNAME docs -> vivi2d.com, proxied
Redirect rule: docs.vivi2d.com/* -> https://github.com/syobon211/vivi2d/tree/main/docs
Status code: 302 Temporary Redirect
```

Use a temporary redirect so the hostname can later serve generated docs without
browsers retaining a permanent GitHub redirect.

The generated `_headers` file applies a strict static-site security profile:
`nosniff`, strict referrer policy, permissions restrictions, frame denial, HSTS
without `includeSubDomains`, and a CSP with `script-src 'none'`. If hosted docs
routes later need client-side scripts, remove those scripts or update the CSP in
the same change that publishes the routes.

## Hosting Plan

The planned public deployment is:

- domain registration through Cloudflare Registrar,
- DNS through Cloudflare,
- `vivi2d.com` as the product portal,
- `docs.vivi2d.com` as the reserved user documentation host,
- `vivi2d.com/docs` as a compatibility redirect to `docs.vivi2d.com/`,
- initial static hosting through Cloudflare Workers static assets,
- optional future subdomains such as `api.vivi2d.com` and `cdn.vivi2d.com`.

The current deployment surface is the root portal plus a reserved docs hostname.
Hosted user docs remain unpublished until the documentation media/review pass is
complete.
