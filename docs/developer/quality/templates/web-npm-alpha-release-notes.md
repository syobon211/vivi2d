# @vivi2d/web <version> Alpha

This is an experimental alpha release of `@vivi2d/web`.

## Install

```sh
npm install @vivi2d/web@alpha
```

## What This Alpha Supports

- Loading Vivi2D public-profile `.vivi` models in browser applications.
- Importing the side-effect-free package root from `@vivi2d/web`.
- Explicit custom-element registration through `@vivi2d/web/auto-register`.
- Optional UMD loading through `@vivi2d/web/umd`.

## Known Limitations

- The package is pre-1.0 and experimental.
- Native runtime, standalone WASM runtime, Viewer API, Provider SDK, Unity SDK,
  and ComfyUI bundles are not part of this npm package.
- This release does not claim compatibility with third-party model formats or
  products.
- Host applications remain responsible for model URLs, CORS policy, user file
  input, and treating unknown model files as untrusted input.

## Release Record

- Git commit: `<commit-sha>`
- Git tag: `web-v<version>`
- npm dist-tag: `alpha`
- Tarball SHA-256: `<sha256>`
- npm integrity: `<integrity>`
- SBOM: `<sbom-file>` (`<sbom-sha256>`)
- Provenance: npm Trusted Publishing OIDC attestation expected

## SBOM Scope

The attached CycloneDX SBOM is repository-wide and generated from the root
lockfile. It is not a byte-for-byte manifest of only the `@vivi2d/web` tarball
contents.

## Verification

The release workflow must verify that the tarball published to npm matches the
locally recorded tarball digest and that npm provenance is present for this
version.
