# Vivi2D <version> Alpha

This is an experimental pre-1.0 Vivi2D source/provenance release.

## What Is Included

- Source review archive generated from the release tag.
- Source review manifest with file hashes and tree hash.
- Repository-wide CycloneDX SBOM generated from the root lockfile.
- Third-party notices.
- Release record and SHA-256 checksums for attached artifacts.

## What Is Not Included

- No Electron installer or desktop app package is attached in this alpha.
- No standalone native runtime, WASM runtime, or C ABI binary is attached.
- No ComfyUI, See-through, model weights, Python wheels, or custom-node bundle
  is attached.
- `@vivi2d/web` is distributed through npm when its separate npm alpha release
  gates and trusted publisher configuration are complete.

## Verification

Download `checksums.txt` and verify each attached artifact before using it.

```sh
sha256sum -c checksums.txt
```

On Windows PowerShell, compare each artifact with:

```powershell
Get-FileHash .\vivi2d-<version>-source-review.zip -Algorithm SHA256
```

## Release Record

- Git tag: `v<version>`
- Git commit: `<commit-sha>`
- SBOM: `vivi2d-<version>.cdx.json`
- Source archive: `vivi2d-<version>-source-review.zip`
- Source manifest: `vivi2d-<version>-source-review-manifest.json`

## SBOM Scope

The attached CycloneDX SBOM is repository-wide and generated from the root
lockfile. It is not a byte-for-byte manifest of a desktop installer or an npm
package tarball.

## Known Limitations

- APIs, file formats, package boundaries, and release processes may change
  before 1.0.
- Native/WASM binary distribution requires separate checksum, signing,
  sanitizer, and legal/API review.
- ComfyUI automation requires a matching local Vivi2D compat plugin when it is
  used as a supported path. The direct See-through workflow remains a
  best-effort local fallback, not a bundled or release-supported integration.
- ComfyUI and See-through bundle distribution requires separate license,
  provenance, dependency, and source/weight review.

## Security

Report security issues through the private channel documented in `SECURITY.md`.
Do not open public issues with vulnerability details.
