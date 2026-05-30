---
title: "ComfyUI Setup"
description: "Connect Vivi2D to a local ComfyUI workspace without skipping review steps."
locale: "en"
slug: "integrations/comfyui"
status: "draft"
audience: ["artist","rigger"]
---
# ComfyUI Setup

Use this guide when you want to use ComfyUI as an optional local tool with Vivi2D. ComfyUI runs separately on your own computer. You can still use Manual Image Split, Auto Setup, and Viewer without ComfyUI.

## Release Status

This page is a draft local-experimentation guide. Do not use it as a public release install guide until the Vivi2D release notes list the pinned ComfyUI-See-through target, the Vivi2D compat plugin package, checksum or signature information, and the supported Vivi2D build range.

Until those release details exist, test only with synthetic artwork or copied projects that you are comfortable discarding. Here, synthetic artwork means a throwaway test drawing made only for setup verification, not client work or private production artwork. When release notes are available, follow the link from the official Vivi2D download or release page.

## What This Is For

ComfyUI can help prepare draft images or local helper outputs before you review them in Vivi2D. Treat every result as a proposal. Vivi2D should not silently change a project just because ComfyUI returned a file.

Use this workflow for:

- Trying a local image preparation workflow before manual review.
- Producing helper files that you will inspect before accepting.
- Keeping generated or assisted output separate from original artwork.

Do not use this workflow to:

- Replace manual review of masks, layers, or generated setup changes.
- Send private artwork to an unknown remote server.
- Import files from a ComfyUI output folder without checking what they contain.

## ComfyUI, See-through, And The Compat Plugin

There are three separate pieces. Installing one does not install the others.

- **ComfyUI** is the local app that runs image workflows.
- **ComfyUI-See-through** is the third-party custom-node plugin from [`jtydhr88/ComfyUI-See-through`](https://github.com/jtydhr88/ComfyUI-See-through). Per its upstream documentation, it runs inside ComfyUI and adds See-through helper nodes.
- **Vivi2D compat plugin** is separate from ComfyUI-See-through. It is the Vivi2D-specific ComfyUI bridge used by supported builds to check expected nodes, versions, and returned outputs.

Install the two plugins as sibling directories under ComfyUI's `custom_nodes` folder:

```text
ComfyUI/
  custom_nodes/
    ComfyUI-See-through/
    vivi2d_compat_plugin/
```

The Vivi2D compat plugin lives in the `vivi2d_compat_plugin/` directory or package for the Vivi2D build you are using. Do not copy ComfyUI-See-through into the Vivi2D compat plugin directory, and do not copy the Vivi2D compat plugin into the ComfyUI-See-through directory.

Use the compat plugin for the supported path. It gives Vivi2D a stable manifest contract instead of relying on upstream custom-node history output details. If your build does not include the Vivi2D compat plugin, use the manual review path or the legacy workflow shown by Vivi2D as a best-effort local fallback.

## Quick Folder Check

Before opening Vivi2D, check this once:

- ComfyUI opens in your browser at a local address such as `http://127.0.0.1:8188/`.
- `ComfyUI-See-through/` is inside `ComfyUI/custom_nodes/`.
- `vivi2d_compat_plugin/` is also inside `ComfyUI/custom_nodes/`, next to `ComfyUI-See-through/`.
- You restarted ComfyUI after installing or updating either plugin.
- The See-through nodes appear in ComfyUI, and Vivi2D's connection check can see the compat plugin.

If any item is missing, fix that first. Most setup failures come from putting one plugin inside the other plugin's folder, forgetting to restart ComfyUI, or connecting Vivi2D to the wrong local address.

## Before You Start

- Make a copy of the artwork or Vivi2D project.
- Install ComfyUI from the official ComfyUI source or official desktop package.
- Start ComfyUI locally and confirm that the browser UI opens on a loopback address such as `http://127.0.0.1:8188/`.
- Install custom nodes only from sources you trust. ComfyUI custom nodes can run code on your computer, including file and network access.
- Close any external access setting you do not intentionally need, such as a public tunnel, remote sharing URL, or cloud relay.
- For public Vivi2D releases, use the ComfyUI-See-through version and Vivi2D compat plugin package named in the Vivi2D release notes. If no pinned version or checksum is listed, treat the workflow as local experimentation only.
- If a release does not list a checksum, signature, or pinned upstream target for this workflow, do not treat that setup as a publish-ready path.

## Install ComfyUI

1. Choose the official install path that matches your system.
2. On Windows, the easiest route is usually the official desktop or portable build. Manual Python setup is useful only if you already maintain Python environments.
3. Launch ComfyUI once before opening Vivi2D.
4. Confirm the ComfyUI page loads in your browser.
5. Run a tiny test workflow in ComfyUI itself so you know the install works before connecting another app.

If the official instructions changed, follow the official ComfyUI documentation first. This page explains the Vivi2D side of the workflow, not the internal ComfyUI release process.

Official references:

- [ComfyUI Desktop for Windows](https://docs.comfy.org/installation/desktop)
- [ComfyUI Portable for Windows](https://docs.comfy.org/installation/comfyui_portable_windows)
- [ComfyUI GitHub README](https://github.com/comfyanonymous/ComfyUI)

## Install ComfyUI-See-through

1. Check the Vivi2D release notes first. If they list a pinned upstream release tag or commit, use that target.
2. Open the [`jtydhr88/ComfyUI-See-through`](https://github.com/jtydhr88/ComfyUI-See-through) repository only after checking whether Vivi2D has pinned a supported target.
3. For local experiments without a pinned Vivi2D target, follow that repository's current README.
4. Install it into ComfyUI's custom-node area, not into Vivi2D.
5. Restart ComfyUI.
6. Confirm the See-through nodes appear inside ComfyUI before opening Vivi2D.

The repository link opens the upstream project, not a supported Vivi2D-pinned version. When Vivi2D release notes list a tag, commit, checksum, or signed artifact, use that pinned target instead of the default branch.

ComfyUI-See-through is third-party code. Use the upstream repository, verify what you install, and avoid random mirrors.

## Install The Vivi2D Compat Plugin

1. Locate the `vivi2d_compat_plugin/` directory or package that belongs to your Vivi2D build.
2. For a public release, verify the SHA-256 checksum or signed release artifact listed in the Vivi2D release notes before installing it.
3. Install it separately from ComfyUI-See-through, as `ComfyUI/custom_nodes/vivi2d_compat_plugin/`.
4. Do not download lookalike copies from random mirrors.
5. Restart ComfyUI after installing or updating the compat plugin.
6. Later, use Vivi2D's connection check to verify the local ComfyUI setup.
7. If Vivi2D reports a missing or mismatched compat plugin, stop and use the documented package for your build.

Do not mix compat plugin files from unrelated Vivi2D versions. If you do not have the `vivi2d_compat_plugin/` directory for your build, continue without it. Legacy direct See-through workflows may still run for local experiments, but they are best-effort because upstream node names, model defaults, and output records can change.

## What Vivi2D Sends To ComfyUI

When you run this workflow, Vivi2D may send:

- Selected image bytes or a duplicate of the selected artwork.
- Workflow options or prompt text that you entered.
- Local request metadata needed to match returned files to the current run.

Vivi2D should not send your entire project file unless you explicitly choose a workflow that does so.

Vivi2D may keep local run status, selected endpoint settings, returned file paths, and safe review summaries in app state or logs. It should not persist private prompts, image bytes, or full returned files unless you import or save them.

ComfyUI and its custom nodes run locally on your computer. Custom nodes may log, cache, or write files according to their own code, so start with a copied project and avoid private client artwork until you trust the local setup.

## Prepare Vivi2D

1. Open Vivi2D.
2. Open a project copy, not the only copy of your artwork.
3. Save the project before starting local-tool work.
4. Open the integration or local-tool area when it is available in your build.
5. Use a local endpoint only, for example `http://127.0.0.1:8188/`.

If your build does not include ComfyUI support yet, stop here. Use [Manual Image Split](../workflows/manual-image-split.md) and [Auto Setup](../workflows/auto-setup.md) instead. Do not install random bridge scripts from unofficial mirrors.

## Connect To Local ComfyUI

1. Keep ComfyUI running.
2. In Vivi2D, enter the local ComfyUI address.
3. Use the test or ping action if the UI provides one.
4. If the connection works, review the reported capabilities before running a workflow.
5. If Vivi2D warns that the Vivi2D compat plugin is missing, use only the compat plugin documented for your build or continue without ComfyUI.

The connection should stay local. Avoid addresses that point to shared machines, public URLs, or services you did not start yourself.

## Run A First Safe Workflow

1. Choose a small test image or duplicate artwork.
2. Start with a low-resolution helper workflow.
3. Wait for ComfyUI to finish.
4. Let Vivi2D import the returned file through the normal review path.
5. Inspect the result in Vivi2D before accepting anything.
6. If a mask, layer, or generated setup warning appears, fix it before applying.
7. Save under a new project name after accepting reviewed output.

## What Vivi2D Should Show

After a successful run, Vivi2D should show the imported proposal or returned file in a review surface. The app should explain what can be saved and what is temporary. If you only see raw files in an output folder, do not drag them into your project blindly.

## Troubleshooting

### ComfyUI Does Not Open

- Confirm ComfyUI starts by itself before testing from Vivi2D.
- Check whether another app is already using port `8188`.
- Restart ComfyUI and try the browser page again.

### Vivi2D Cannot Connect

- Use `127.0.0.1` or `localhost`, not a public hostname.
- Confirm the port matches the ComfyUI window or launch output.
- Check firewall prompts that may block local app communication.

### See-through Nodes Are Missing

- Confirm ComfyUI-See-through is installed in the ComfyUI custom-node area.
- Restart ComfyUI after installing the plugin.
- Open ComfyUI directly and check whether the See-through nodes appear before trying Vivi2D.

### Vivi2D Compat Plugin Is Missing Or Mismatched

- The current Vivi2D build may not include the compat plugin.
- The compat plugin may be installed in the wrong directory.
- The plugin version may not match this Vivi2D build.
- Do not mix compat plugin files from unrelated versions.
- Go back to [Install The Vivi2D Compat Plugin](#install-the-vivi2d-compat-plugin), then run Vivi2D's connection check again.
- Treat the legacy direct See-through path as local experimentation only. If a release lists a compat plugin checksum, prefer that supported path.

### The Result Looks Wrong

- Cancel the import or review step.
- Try a smaller input, clearer layer separation, or a simpler workflow.
- Go back to Manual Image Split if the generated output makes important regions ambiguous.

### GPU Or Memory Errors

- Lower the image size in ComfyUI.
- Close other GPU-heavy apps.
- Run the same ComfyUI workflow alone before trying it from Vivi2D.

## Safety Checklist

Before accepting ComfyUI-assisted output, confirm:

- The endpoint is local and trusted.
- The original artwork is backed up.
- ComfyUI-See-through came from the expected repository and pinned release when one is listed.
- The Vivi2D compat plugin came from `vivi2d_compat_plugin/` for your Vivi2D build and matches the listed checksum when one is provided.
- Returned files are reviewed in Vivi2D.
- No private prompt, file path, or artwork is included in a public issue report.
- The final project still opens correctly without ComfyUI running.

## Next

[Manual Image Split](../workflows/manual-image-split.md)
