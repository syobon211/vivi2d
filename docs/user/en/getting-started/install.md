---
title: "Install Vivi2D"
description: "Choose the safest way to get and launch Vivi2D."
locale: "en"
slug: "getting-started/install"
status: "draft"
audience: ["artist","rigger"]
---
# Install Vivi2D

Use this page to decide where to get Vivi2D, where to place it, and what to check before opening real artwork.

## What You Need

- A Windows PC or another system supported by the build you are using.
- A trusted Vivi2D release, preview build, or local development checkout.
- A normal project folder such as `Documents/Vivi2D Projects/`, not a temporary download folder.
- A copy of your artwork. Keep original PSD or PNG files separate from test projects.

## Choose A Build Source

Use the safest source available for your situation.

| Situation | Recommended path |
| --- | --- |
| A public release is available | Download it from the official release page and keep the archive name unchanged. |
| You are testing a preview build | Use the exact build link and checksum from the release or test note. |
| No packaged build is available yet | Follow the repository README and run a development build locally. |
| You found a mirror or repackaged build | Do not use it unless the Vivi2D project explicitly points to it. |

If a release provides a checksum or signature, verify it before launching the app. If no checksum is listed, treat the build as a local test build and avoid private client artwork until you trust the source.

## Install Or Unpack

1. Create a folder for Vivi2D builds, for example `C:/Users/<you>/Apps/Vivi2D/`.
2. Move or extract the downloaded build into that folder.
3. Do not run Vivi2D directly from a browser download cache, compressed archive preview, cloud sync conflict folder, or system-protected directory.
4. Keep builds separated by version if you are testing multiple builds.
5. If Windows warns about an unsigned or unknown app, confirm that the build came from the expected Vivi2D source before allowing it.

## First Launch Check

1. Start Vivi2D.
2. Confirm the window title says `Vivi2D Editor`.
3. Confirm the first empty workspace opens without a project error.
4. Confirm the default public UI is English and the default theme is dark.
5. Open Settings only if you want to choose Japanese, Simplified Chinese, or Korean.
6. Close and reopen the app once if you changed language or display settings.

## Keep Projects Separate

Use separate folders for:

- Original artwork from your drawing app.
- Vivi2D project copies.
- Export tests.
- Optional local-tool output.
- Bug-report screenshots that contain only synthetic or redacted artwork.

This separation makes it much easier to undo experiments and avoid accidentally sharing private client files.

## Updating Vivi2D

1. Save and close all projects.
2. Keep the previous build until the new build opens your project copy correctly.
3. Install the new build into a new versioned folder.
4. Open a copied project first, not your only working file.
5. If the project behaves differently, keep both builds and report the visible behavior.

## Check Your Result

You are ready for the next page when:

- Vivi2D opens consistently.
- The app title and empty workspace look correct.
- You know where your test projects will be stored.
- You have at least one backup of the source artwork.

## If Something Looks Wrong

- If the app does not open, move it to a normal user folder and try again.
- If security software blocks launch, verify the build source before adding an exception.
- If the UI opens but text is clipped or mixed-language, continue to [Language And Text Display](../troubleshooting/localization.md).
- If you report a launch issue publicly, do not include full local paths, private artwork, access tokens, or client names.

## Next

[First Launch](first-launch.md)
