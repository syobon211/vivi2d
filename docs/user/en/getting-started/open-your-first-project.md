---
title: "Open Your First Project"
description: "Open artwork and confirm that the editor state updated correctly."
locale: "en"
slug: "getting-started/open-your-first-project"
status: "draft"
audience: ["artist","rigger"]
media:
  - "getting-started.first-project"
---
# Open Your First Project

Open a safe test copy of your artwork and inspect it before running setup tools.

## What You Need

- A copy of the artwork you want to test.
- A supported file type for your current build.
- A project folder where exports and generated helper files will not overwrite source artwork.
- Time to inspect the canvas, layer list, and properties panel before applying any workflow.

## Choose The Right Input

Use layered artwork when possible. Clear layer names make every later step easier.

Good first test files:

- A small PSD with named parts such as `Face`, `Hair Front`, `Eyes`, `Mouth`, and `Body`.
- A PNG or flat image that you are comfortable splitting manually.
- A synthetic or non-client file if you are testing a new build.

Avoid starting with:

- The only copy of commissioned artwork.
- A huge file before you know the import path works.
- A file from a cloud sync folder that is still uploading.
- A file with generic layer names such as `Layer 1`, `Layer 2`, `copy copy`.

## Open Or Import

1. Choose File, then open or import your test artwork.
2. Wait until the canvas and layer list finish updating.
3. Do not run Manual Image Split or Auto Setup immediately.
4. Select a few layers and confirm the Properties panel changes.
5. Zoom to fit, then pan around the canvas.
6. Save a Vivi2D project copy before running setup tools.

## Inspect The Layer List

Check:

- Important parts are visible.
- Layer order roughly matches the artwork.
- Transparent or helper layers are not accidentally selected as character parts.
- Face, eyes, mouth, hair, body, and accessories are easy to identify.
- Hidden layers are intentionally hidden.

If the artwork is flat, this is expected to be short. Use [Manual Image Split](../workflows/manual-image-split.md) next.

## Check Your Result

You are ready for the next workflow when:

- The canvas shows the expected artwork.
- The layer list contains the expected parts or one clear flat source layer.
- Selecting a layer updates the Properties panel.
- The project has been saved as a copy.

## If Something Looks Wrong

- If the file does not open, try a smaller known-good file and read [Import Errors](../troubleshooting/import-errors.md).
- If the layer list exists but the canvas is blank, read [Display And GPU](../troubleshooting/display-and-gpu.md).
- If the layer order is confusing, fix the source artwork in your drawing app, then import again.
- If only the flat image imported, continue with Manual Image Split instead of forcing Auto Setup immediately.

## Next

[From Artwork To Starting Rig](../workflows/psd-to-rig.md)
