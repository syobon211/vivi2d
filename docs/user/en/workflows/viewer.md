---
title: "Preview In Viewer"
description: "Load a model in Viewer and inspect it before export or integration."
locale: "en"
slug: "workflows/viewer"
status: "draft"
audience: ["artist","streamer"]
workflow: "viewer"
---
# Preview In Viewer

Use Viewer to check how a model behaves outside the editing workspace.

## What Viewer Is For

Viewer is the safe place to inspect the model before export, sharing, or connecting another local tool. It helps you catch missing parts, unexpected outlines, unstable rest state, and control issues while the project is still easy to fix.

## What You Need

- A saved Vivi2D project or exported model file that Viewer can load.
- A simple background that makes outlines easy to see.
- A few minutes to test rest state, parameters, expressions, and basic motion.

## Load The Model

1. Open Viewer from Vivi2D or from the workflow that launches it.
2. Load the model or project copy you want to inspect.
3. Wait for the model to appear before changing controls.
4. If Viewer offers a background option, start with a neutral background.
5. Confirm the model appears at a comfortable scale.

## Inspect Rest State

Before moving anything, check:

- All expected parts are visible.
- No obvious duplicate outlines are visible.
- Eyes, mouth, and face details appear stable.
- Hair and accessories are not clipped.
- The model is centered enough for preview.

If rest state already looks wrong, return to the editor before testing motion.

## Test Controls

1. Move one control at a time.
2. Return the control to rest before testing the next one.
3. Watch for hidden reveals, duplicate outlines, missing parts, or face changes.
4. Test expressions separately from broad motion.
5. If the viewer supports reset, use it often.

Do not judge the model only at an extreme value. Check small, medium, and large changes.

## External Control Sessions

If another local tool controls Viewer, pair it only when you understand the prompt. Review requested scopes and close or revoke the session when testing is done. See [Viewer API Basics](viewer-api.md) for the client flow.

## Check Your Result

Viewer should load the model, respond to controls, and return to a stable rest state. You should be able to explain any warning before moving to export.

## If Something Looks Wrong

- If Viewer is blank, confirm the project was saved or exported correctly.
- If only some parts are missing, return to the editor and inspect layer visibility.
- If motion reveals empty areas, return to Manual Image Split or cleanup review.
- If controls do not reset, reopen the model and test again from rest.
- If the issue looks display-related, read [Display And GPU](../troubleshooting/display-and-gpu.md).

## Next

[Export](export.md)
