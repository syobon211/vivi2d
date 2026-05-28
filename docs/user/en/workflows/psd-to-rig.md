---
title: "From Artwork To Starting Rig"
description: "Turn prepared artwork into a first editable setup."
locale: "en"
slug: "workflows/psd-to-rig"
status: "draft"
audience: ["artist","rigger"]
workflow: "psd-to-rig"
---
# From Artwork To Starting Rig

This page is the main path from source artwork to a first editable Vivi2D setup.

## Workflow Map

1. Install and launch Vivi2D.
2. Open a project copy.
3. Decide whether the artwork is already layered enough.
4. Use Manual Image Split if the artwork is flat or partly flattened.
5. Run Auto Setup only after the layer or mask structure is understandable.
6. Review the generated setup.
7. Preview in Viewer.
8. Export only after the project behaves as expected.

Each step should leave you with something you can inspect. If a step produces confusing output, go back one step instead of repeatedly applying the next tool.

## Decide: Layered Or Flat?

Use this decision guide:

| Artwork state | Best next step |
| --- | --- |
| Clean PSD with named parts | Inspect layer order, then try Auto Setup. |
| PSD with many unclear layers | Rename and simplify layers before Auto Setup. |
| Flat PNG or flattened PSD | Use Manual Image Split first. |
| Face or hair regions are mixed together | Split or mask those regions before setup. |
| Important regions are hidden by effects | Keep a source copy and create a cleaner working copy. |

## Preparation Checklist

Before Auto Setup:

- The project is saved.
- You can identify face, eyes, mouth, hair, body, and accessories.
- Moving parts are not mixed with protected face details.
- Empty or accidental helper layers are removed or hidden.
- Flat artwork has accepted masks.
- Blocking warnings have been resolved.

## Run The First Setup Pass

1. Start with the safest detection level.
2. Review the proposed operations before applying.
3. Read warnings instead of treating them as noise.
4. If the setup mentions protected areas, hidden reveals, or duplicate outlines, inspect those areas on the canvas.
5. Apply only if the saved operation list matches what you expect.
6. Save under a new name after applying.

## Review Loop

Use a loop like this:

1. Preview the result.
2. Identify the first visible issue.
3. Fix the source layer, mask, or setup setting that caused it.
4. Run the smallest needed step again.
5. Save a new project copy when the result improves.

Avoid stacking repeated setup attempts on top of a project state that already looks wrong.

## Check Your Result

You are ready for Viewer when:

- The model has a clear starting setup.
- The face and important details stay stable at rest.
- Warnings are either resolved or understood.
- You can explain what Auto Setup saved.
- You still have the source artwork and a pre-setup project copy.

## If Something Looks Wrong

- If the wrong region moves, fix layer separation or masks first.
- If hair or accessories affect the face, return to Manual Image Split and clean protected regions.
- If too many warnings appear, lower the scope of the setup and review one region at a time.
- If the generated result is not useful, cancel or revert to the saved copy.

## Next

[Manual Image Split](manual-image-split.md)
