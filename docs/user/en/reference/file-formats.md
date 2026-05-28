---
title: "File Formats"
description: "Understand which files are suitable for current Vivi2D workflows."
locale: "en"
slug: "reference/file-formats"
status: "draft"
audience: ["artist","developer"]
---
# File Formats

Choose input and output files based on the workflow you are testing.

## Supported Inputs

Use current app UI as the final source of truth, because support may change before public release. In general, Vivi2D workflows focus on artwork files that can become editable layers or accepted masks.

## Good Source Artwork

- Keep a copy of the original artwork before importing.
- Prefer clear layer names when the source is layered.
- For flat artwork, expect to use Manual Image Split before Auto Setup.
- Avoid using private client artwork in public bug reports or screenshots.

## Output Files

Exported files should be tested in the intended Viewer or sample before sharing. If an output path is marked experimental, treat it as a test artifact until the release notes say otherwise.

## If Something Looks Wrong

If the file extension and actual content do not match, import may fail. Use [Import Errors](../troubleshooting/import-errors.md) for safe recovery steps.

## Next

[Keyboard Shortcuts](keyboard-shortcuts.md)
