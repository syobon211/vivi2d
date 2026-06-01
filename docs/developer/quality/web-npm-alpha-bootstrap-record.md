# Web SDK npm Bootstrap Record

This record captures the one-time local bootstrap publication for
`@vivi2d/web`. It is intentionally separate from the normal GitHub Actions OIDC
publish path.

## Published Package

- Package: `@vivi2d/web`
- Version: `0.1.0-alpha.0`
- Source commit: `d15b76d77e301205793c99f7de0e6d3294431f09`
- Intended release tag: `web-v0.1.0-alpha.0`
- Publish path: local one-time bootstrap wrapper
- Provenance: none for this version; all later Web SDK alpha releases must use
  npm Trusted Publishing through GitHub Actions OIDC.

## Registry Verification

- Package access: public
- npm dist-tags after publish: `alpha: 0.1.0-alpha.0`,
  `latest: 0.1.0-alpha.0`
- Initial `latest` removal attempt: npm rejected deleting `latest` while this
  was the only package version.
- Post-bootstrap status: `@vivi2d/web@0.1.0-alpha.2` has since been published
  through GitHub Actions OIDC Trusted Publishing with npm provenance.
  `alpha` and `latest` now both point to `0.1.0-alpha.2`. `latest` is a
  convenience tag pointing to the current alpha for npm page usability only; it
  is not a stable-channel promise. This bootstrap version is deprecated with a
  message that points users to `npm install @vivi2d/web@alpha`. A
  post-`0.1.0-alpha.1`
  `npm dist-tag rm @vivi2d/web latest` attempt still returned a registry
  `400 Bad Request`; after `0.1.0-alpha.2`, the owner chose to retag `latest`
  to the current alpha instead of leaving it on the deprecated bootstrap.
- Verified npm deprecation message:
  `Bootstrap alpha. Please install current alpha builds with: npm install @vivi2d/web@alpha`
- Tarball filename: `vivi2d-web-0.1.0-alpha.0.tgz`
- Tarball SHA-256:
  `982dc5369f35cb0246c04bcdaf9dbfbad5f3a720dc0db86434f16e581babea09`
- npm integrity:
  `sha512-/I/WiO+HB4c8RxTS71aUYO16NJAJ5BKs92sSWVKRT1KD+pBoYQM0CLm8tnRsK9q0akBwdvEJdgmNsFqAj90yzA==`
- npm shasum: `5a60a49f81c18fa8169569942a751d337e8ff977`
- Packed size: 1,756,972 bytes
- Unpacked size: 7,736,106 bytes
- Entry count: 37
- Post-publish source-map scan: 14 source maps checked; no absolute local
  filesystem paths were found.

## Follow-up Boundary

npm Trusted Publishing was configured after bootstrap with:

- Provider: GitHub Actions
- Repository: `syobon211/vivi2d`
- Workflow: `publish-web-alpha.yml`
- Environment: `npm-alpha`
- Allowed action: `npm publish`

`scripts/bootstrap-web-npm-alpha-publish.mjs` is disabled after this record. It
is retained only to make the one-time exception auditable. Future
`@vivi2d/web` alpha releases must use `.github/workflows/publish-web-alpha.yml`
and `scripts/publish-web-npm-alpha.mjs`.
