---
title: "Import Errors"
description: "Recover safely when artwork does not open."
locale: "en"
slug: "troubleshooting/import-errors"
status: "draft"
audience: ["artist","rigger"]
---
# Import Errors

Use this page when artwork does not open, imports only partly, or produces an unexpected project state.

## First Rule: Keep The Original Safe

Do not repeatedly modify the only copy of a source file while debugging. Make a test copy and work from that.

## Common Causes

| Symptom | Likely area to check |
| --- | --- |
| File does not appear in the picker | File type, extension, or OS permissions |
| Import starts then fails | File size, unsupported structure, or corrupted source |
| Canvas is blank but layers exist | Display issue or hidden layers |
| Layers import with confusing names | Source artwork organization |
| Only a flat image imports | The source may not contain usable layer data |

## Basic Recovery Steps

1. Try opening a small known-good file.
2. Move a copy of the failing file into a normal project folder.
3. Confirm the extension matches the actual file type.
4. If the file is very large, make a smaller test copy.
5. If the source is a PSD, open it in your drawing app and save a clean copy.
6. If only one file fails, keep it unchanged and continue with a copied version.

## PSD-Specific Checks

In your drawing app, check:

- The file opens without repair prompts.
- Important layers are visible.
- Layer names are readable.
- Locked or special layers are intentional.
- The canvas size is reasonable for a first test.
- There are no cloud-sync placeholder layers or missing linked resources.

Then save a new copy and import that copy into Vivi2D.

## PNG Or Flat Image Checks

For a flat image:

- Confirm the image opens in a normal image viewer.
- Check that transparency looks correct.
- Avoid huge dimensions for the first test.
- Use Manual Image Split after import if the image opens correctly.

## Check Your Result

You know the import path is working when:

- A known-good file opens.
- The canvas updates.
- The layer list or source layer appears.
- Selecting a layer updates Properties.

If only your original source fails, the issue is probably in that source file or its current location.

## Reporting Safely

When asking for help, share:

- File type.
- Approximate dimensions.
- Approximate layer count.
- The visible action that failed.
- Whether a known-good test file opens.

Do not share:

- Private artwork.
- Full local filesystem paths.
- Client names.
- Raw stack traces with local paths.
- Access tokens or cloud sync URLs.

## Next

[Display And GPU](display-and-gpu.md)
