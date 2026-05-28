---
title: "Display And GPU"
description: "Diagnose blank canvas, redraw, and display issues."
locale: "en"
slug: "troubleshooting/display-and-gpu"
status: "draft"
audience: ["artist","streamer"]
---
# Display And GPU

Use this page when Vivi2D opens but the canvas, Viewer, or preview does not look right.

## Common Symptoms

- The canvas is blank.
- The layer list exists but artwork is not visible.
- The canvas updates only after zooming or panning.
- Viewer is black or transparent.
- Parts flicker, disappear, or redraw late.
- Text or UI looks too small, too large, or clipped.

## Quick Checks

1. Confirm the project imported without errors.
2. Confirm the layer list contains visible layers.
3. Use zoom-to-fit or reset view.
4. Select a visible layer and check whether Properties updates.
5. Try a small known-good project.
6. Restart Vivi2D after closing GPU-heavy apps.

## Separate Project Issues From Display Issues

Use this guide:

| Observation | Likely cause |
| --- | --- |
| Known-good project also looks blank | Display, GPU, or app rendering issue |
| Only one project looks blank | Project import, layer visibility, or source data issue |
| Viewer is blank but editor is fine | Viewer load or export issue |
| Canvas appears after zooming | Redraw or viewport issue |
| Only external monitor fails | OS display scaling, GPU selection, or monitor setup |

## GPU And Monitor Checks

- Close screen recorders, games, render tools, and other GPU-heavy apps.
- Try the main display if an external monitor behaves oddly.
- Check OS scaling such as 100%, 125%, or 150%.
- Avoid moving the window between monitors while a large file is loading.
- Restart the app after changing display scale.

## Viewer Display Checks

1. Load a small known-good model.
2. Use a simple background.
3. Reset the model to rest.
4. Confirm the exported file or saved project exists.
5. Return to the editor if the same part is missing there too.

## Check Your Result

The canvas or Viewer should redraw after zooming, panning, selecting a layer, or loading a known-good project. Once you can see a simple project reliably, return to your real project copy.

## Reporting Safely

Describe:

- Visible symptom.
- OS and general GPU class.
- Whether a known-good project works.
- Whether the issue appears in editor, Viewer, or both.

Share only synthetic screenshots or tightly cropped, redacted screenshots. Do not paste full local paths or crash dumps into public reports.

## Next

[Language And Text Display](localization.md)
