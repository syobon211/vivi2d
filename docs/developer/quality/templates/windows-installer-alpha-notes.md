# Vivi2D <version> Windows Installer Alpha

This is a pre-1.0 Windows installer alpha. It is intended for early testing and
feedback, not production use.

## What Is Included

- Windows x64 NSIS installer: `vivi2d-<version>-windows-x64-setup.exe`
- Source review archive, source review manifest, SBOM, notices, checksums, and
  installer release record regenerated from tag `<tag>`
- Source commit: `<commit-sha>`
- Electron: `<electron-version>`
- Chromium major: `<chromium-major-version>`

## Signing Status

Signing status: `<signing-status>`

Unsigned alpha installers may trigger Microsoft Defender SmartScreen or browser
download warnings. Verify checksums before running the installer.

## Manual Windows Review

Manual review status: `<manual-review-status>`

The release record contains the Windows VM review summary used for the draft or
publish decision.

## Verification

Download `checksums.txt` from this release and compare the installer SHA-256
entry before running the installer.

```sh
certutil -hashfile vivi2d-<version>-windows-x64-setup.exe SHA256
```

The installer release record also stores SHA-512 digests for release artifacts.

## Uninstall

Use Windows Settings -> Apps -> Installed apps -> Vivi2D -> Uninstall. The
installer alpha does not include an auto-update channel, so uninstalling the
application is the expected rollback path.

## What Is Not Included

- No auto-update channel or update metadata
- No macOS or Linux installer
- No MSI, MSIX, Winget, Microsoft Store, or enterprise deployment package
- No ComfyUI bundle, See-through bundle, model weights, Python wheels, or custom
  node bundle
- No standalone native runtime or standalone WASM runtime artifact
- No stable API or project-format guarantee

## Security

Report vulnerabilities through GitHub private vulnerability reporting when
available, or follow the contact path in `SECURITY.md`.
