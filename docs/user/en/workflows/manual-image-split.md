---
title: "Manual Image Split"
description: "Prepare flat artwork by creating reviewed layer masks."
locale: "en"
slug: "workflows/manual-image-split"
status: "draft"
audience: ["artist","rigger"]
workflow: "manual-image-split"
media:
  - "manual-image-split.mask-editor"
---
# Manual Image Split

Use Manual Image Split when a flat or partly flattened image needs separate parts before setup.

## What Manual Image Split Does

Manual Image Split lets you mark regions that later workflows can treat as separate parts. It is especially useful when the source artwork is a single PNG or when a PSD has large combined layers.

The goal is not to make perfect final artwork. The goal is to create reviewed regions that are safe enough for Auto Setup to understand.

## What You Need

- A copy of the source artwork.
- A plan for the major regions: face, eyes, mouth, hair, body, clothing, accessories, and background if needed.
- Enough zoom to inspect edges.
- Time to fix warnings before applying.

## Plan Regions Before Drawing

Start with broad, meaningful parts:

- Face and skin areas that should stay stable.
- Eyes and mouth that need clean separation.
- Hair front, side hair, and back hair if they overlap.
- Body, collar, sleeves, and clothing details.
- Accessories that should move separately.

Avoid making too many tiny regions on the first pass. Small fragments are harder to review and often create extra cleanup work.

## Draw Masks

1. Open Manual Image Split from the project that contains the source artwork.
2. Create the main masks first.
3. Use broad strokes for interior areas and careful edges near the face, eyes, and mouth.
4. Use lasso-like selection for smooth hair and cloth outlines when available.
5. Zoom in around eyelashes, mouth corners, hair tips, and accessories.
6. Keep masks understandable by naming them after the visible part.

## Review Common Warnings

Take warnings seriously:

- **Empty mask:** the region has no useful pixels.
- **Overlap:** two regions claim the same pixels.
- **Lost opaque pixels:** visible artwork is not covered by accepted regions.
- **Tiny island:** the mask has small disconnected pieces that may be accidental.
- **Protected area nearby:** the mask may include face, eye, or mouth pixels that should stay stable.

Warnings do not always mean the split is unusable, but they mean you should inspect the area before applying.

## Underpaint And Cleanup

Some movements reveal what was hidden behind hair, clothing, or accessories. Manual split work may show cleanup suggestions or underpaint previews.

Use this rule:

- Preview underpaint is for inspection.
- Accepted underpaint or reviewed cleanup can be used later.
- Do not treat generated preview content as final artwork unless the workflow explicitly asks you to accept it.

## Apply The Split

Apply only when:

- Every important visible region is covered.
- Face, eyes, and mouth are clean.
- Hair and accessories do not accidentally include protected details.
- Remaining warnings are understood.
- You have saved a project copy.

## Check Your Result

After applying, you should see useful layer regions that Auto Setup can inspect. The canvas should not lose important pixels, and the layer list should be easier to reason about than the original flat image.

## If Something Looks Wrong

- If a face detail moved into a hair mask, undo and redraw that edge.
- If a mask is too broad, split it into a smaller region.
- If a mask is too fragmented, merge or redraw it.
- If duplicate outlines appear, note the area and review cleanup before Auto Setup.
- If you are unsure, save a copy and keep the pre-split version.

## Next

[Auto Setup](auto-setup.md)
