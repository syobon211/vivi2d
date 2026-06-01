# Vivi2D <version> Windows Installer Alpha

This is a pre-1.0 Windows installer alpha. It is intended for early testing and
feedback, not production use.

## What Is Included

- Windows x64 NSIS installer: `vivi2d-<version>-windows-x64-setup.exe`
- Windows x64 NSIS Viewer installer for alpha.3 and later:
  `vivi2d-viewer-<version>-windows-x64-setup.exe`
- The Vivi2D Viewer installer is allowlisted only for alpha.3 and later, after
  the workflow, verifier, release record, and checksum gate cover both apps.
- Source review archive, source review manifest, SBOM, notices, checksums, and
  installer release record regenerated from tag `<tag>`
- Source commit: `<commit-sha>`
- Electron: `<electron-version>`
- Chromium major: `<chromium-major-version>`

## Signing Status

Signing status: `<signing-status>`

This Windows installer alpha is unsigned unless this section explicitly says
otherwise. Unsigned alpha installers may trigger browser download warnings,
`Unknown publisher`, or Microsoft Defender SmartScreen messages such as
`Windows protected your PC`. That is expected for this alpha channel.

Before running the installer, confirm that it came from this GitHub Release and
verify the SHA-256 entry in `checksums.txt`. Do not disable SmartScreen globally
to install Vivi2D.

For current alpha feedback, open a new GitHub issue with the relevant template:
https://github.com/syobon211/vivi2d/issues/new/choose.

## Manual Windows Review

Manual review status: `<manual-review-status>`

The release record contains the Windows VM review summary used for the draft or
publish decision.

Intentional uninstall remnants recorded for this review:

<intentional-remnants>

## Verification

Download `checksums.txt` from this release and compare the installer SHA-256
entry before running the Editor or Vivi2D Viewer installer.

```sh
certutil -hashfile vivi2d-<version>-windows-x64-setup.exe SHA256
certutil -hashfile vivi2d-viewer-<version>-windows-x64-setup.exe SHA256
```

The installer release record also stores SHA-512 digests for release artifacts.

If you install both the Editor and Vivi2D Viewer from this release, install one
app first, wait a few seconds after the installer finishes, and then run the
other installer. This avoids a transient NSIS cleanup collision observed during
rapid back-to-back silent install testing.

## First Launch

After installation, Vivi2D should open to the empty editor workspace without an
account sign-in prompt, updater prompt, telemetry prompt, or outbound network
activity attributed to the app process. If first launch behaves differently,
please open a new GitHub issue with the relevant template:
https://github.com/syobon211/vivi2d/issues/new/choose.

## Uninstall

Use Windows Settings -> Apps -> Installed apps -> Vivi2D -> Uninstall. The
installer alpha does not include an auto-update channel, so uninstalling the
application is the expected rollback path.

The alpha uninstaller removes the installed app, shortcuts, and uninstall
registration. It may leave `%APPDATA%/Vivi2D` user data and Chromium cache so a
future alpha can preserve preferences. Delete that folder manually only if you
want a fully clean test profile.

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
