---
title: "Export"
description: "Choose an output path and verify the exported result safely."
locale: "en"
slug: "workflows/export"
status: "draft"
audience: ["artist","rigger","streamer"]
workflow: "export"
---
# Export

Export only after the project has been reviewed in the editor and Viewer.

## What Export Is For

Export creates files for a specific next step, such as local preview, sharing with a collaborator, or testing an integration. It should not be the first time you inspect the project.

## What You Need

- A saved project with no blocking review warnings.
- A target workflow, such as preview, sharing, or local integration testing.
- A destination folder that will not overwrite source artwork.
- A plan for how you will verify the exported files.

## Before Export

Check:

- The project opens correctly.
- Viewer shows the model at rest.
- Important controls or expressions have been tested.
- You know which export target you need.
- Private client artwork, prompts, or local paths will not be included in public reports.

## Choose A Destination

Use a new folder for each export attempt:

```text
MyCharacter/
  source/
  vivi2d-projects/
  exports/
    2026-05-25-test-01/
```

This makes it easier to compare exports and avoid overwriting a known-good result.

## Export Steps

1. Save the project.
2. Open export controls.
3. Choose the target that matches your next workflow.
4. Read any experimental or release-status notes shown by the app.
5. Export into a new folder.
6. Open the exported result in the expected viewer or sample.
7. Keep one known-good export for comparison.

## Verify The Export

After export, check:

- The expected files exist.
- File names are understandable.
- The exported result loads without needing files from your private working directory.
- Textures or image assets are present.
- The model looks the same as the Viewer preview, or differences are understood.

## Sharing Exports

Before sending files to someone else:

- Open the export from a clean folder.
- Remove debug logs or private notes that are not required.
- Do not include source artwork unless you intend to share it.
- Include the Vivi2D build or release note if the recipient needs the same version.

## If Something Looks Wrong

- If files are missing, export again into an empty folder and compare.
- If the exported result cannot load, verify the selected export target.
- If artwork looks different, return to Viewer and confirm the project state.
- If a recipient cannot open the files, ask what visible error they see instead of requesting private logs.

## Next

[Viewer API Basics](viewer-api.md)
