---
title: "Auto Setup"
description: "Generate a reviewed starting setup from prepared layers."
locale: "en"
slug: "workflows/auto-setup"
status: "draft"
audience: ["artist","rigger"]
workflow: "auto-setup"
media:
  - "auto-setup.preview-panel"
---
# Auto Setup

Auto Setup creates a reviewed starting point from prepared layers or accepted manual split masks.

## What Auto Setup Is For

Use Auto Setup to quickly create a first editable setup after the artwork structure is ready. It is not a replacement for review. You should still inspect what will be saved, what will be discarded, and which regions need manual attention.

## What You Need

- Separated layers or accepted manual split masks.
- A saved project copy.
- No blocking preparation warnings.
- Enough time to read the review panel before applying.

## Before You Run It

Check:

- Layer names describe visible parts.
- Face, eyes, and mouth are not mixed into moving hair or accessory regions.
- Manual split masks, if used, were accepted after review.
- The project opens correctly after saving.
- You can return to a pre-setup copy.

## Choose A Detection Level

Use the beginner level when:

- This is your first pass.
- You want fewer assumptions.
- You are testing a new artwork style.

Use the advanced level when:

- You understand the layer structure.
- You want more detailed setup suggestions.
- You are prepared to review more warnings.

If the advanced result looks noisy, cancel and try a smaller or simpler pass.

## Read The Review Panel

Before applying, look for three groups of information.

### Saved Operations

These are the reviewed operations that can become project data, such as bones, static weights, physics groups, cleanup summaries, and scalar settings.

### Discarded Preview Data

Temporary preview information and diagnostic details are discarded. The saved project should contain reviewed operations, not raw preview calculations.

### Warnings

Warnings tell you where manual review is still needed. Common examples include:

- Protected areas changed too much.
- A duplicate outline may appear.
- Hidden pixels may be revealed.
- A check was incomplete and needs manual inspection.
- A suggested handle needs user review.

## Apply Or Cancel

Apply only when:

- The saved operation list matches your expectation.
- Important warnings are resolved or understood.
- The preview does not move the wrong region.
- Face, eye, and mouth areas stay stable.
- You are comfortable editing the resulting setup.

Cancel when:

- The wrong part is selected.
- The review panel asks for manual review and you cannot inspect it yet.
- The result depends on a mask or layer you know is stale.
- You cannot explain what will be saved.

## After Applying

1. Save under a new name.
2. Preview the project at rest.
3. Open Viewer and test simple controls.
4. Return to the editor if a region moves unexpectedly.
5. Keep the pre-setup project copy until the result is stable.

## Check Your Result

You should have a clear starting setup that can be edited. The project should still be understandable: you can identify the layers, see what was created, and decide what to refine next.

## If Something Looks Wrong

- If the face changes too much, fix masks or protected regions before trying again.
- If hair shows duplicate outlines, review cleanup or underpaint before applying.
- If hidden empty pixels appear, return to Manual Image Split and inspect the source.
- If the result is too complex, use beginner mode or split the artwork into clearer regions.
- If the review panel looks stale after edits, rerun the setup from the current project state.

## Next

[Preview In Viewer](viewer.md)
