# vivi2d-compat-comfyui

Server-side-only ComfyUI custom nodes maintained for Vivi2D.

## License and distribution

This Vivi2D compat plugin source is maintained by Vivi2D and is distributed
under the same Apache-2.0 license as the main repository.

ComfyUI and ComfyUI-See-through are separate projects. Users install them from
their own upstream sources, and this package does not bundle their source,
model weights, generated assets, or dependencies.

This package exists to stabilize the contract between Vivi2D and a
See-through-based decomposition workflow without depending on a third-party
ComfyUI wrapper plugin.

## Scope

V1 intentionally keeps the surface small:

- `ViviSeeThroughDecompose`
- `ViviSeeThroughExportPSD`

The node contract is based on:

- preview image output
- `manifest_path: STRING`
- `psd_path: STRING`

The manifest schema is versioned and owned by Vivi2D.

Returned file references should be output-relative whenever possible, for
example:

- `vivi2d/decompose/<job-id>/manifest.json`
- `vivi2d/psd/<job-id>/<filename-prefix>.psd`

That lets HTTP clients retrieve artifacts through ComfyUI `/view` without
depending on host filesystem paths.

## Current status

This directory provides a loadable plugin scaffold, capability metadata, and
stable manifest handling utilities.

One execution piece is still intentionally left behind an adapter boundary:

- the long-term maintained See-through inference backend

The current backend bridge can reuse a sibling `ComfyUI-See-through` install or
an explicit `VIVI2D_SEETHROUGH_UPSTREAM_PATH` that points to an upstream
`nodes.py`.

Current auto-discovery checks, in order:

- an already loaded upstream `ComfyUI-See-through` module
- `VIVI2D_SEETHROUGH_UPSTREAM_PATH`
- a sibling `custom_nodes/ComfyUI-See-through/nodes.py`
- a built-in `custom_nodes/ComfyUI-See-through/nodes.py` resolved from the
  active ComfyUI `main.py`
- ComfyUI `folder_paths` custom-node roots when available

Server-side PSD export now uses `pytoshop` to assemble layered PSD files from
the Vivi2D manifest and emitted layer PNG files. Vivi2D still keeps a
client-side fallback path for older compat plugins that only expose the
decompose node.

## Live smoke verification

With a running ComfyUI instance, you can run the provider smoke check from the
main Vivi2D repository:

```bash
npm run smoke:comfyui:compat
```

The script verifies:

- both compat nodes are present in `/object_info`
- decompose -> manifest export succeeds
- PSD export succeeds
- emitted `manifest_path` and `psd_path` are downloadable through `/view`

Use `--base-url` if your ComfyUI backend is not running on `127.0.0.1:8000`.

If the smoke script reports a schema/version/capability mismatch immediately
after a plugin update, fully restart the ComfyUI backend Python process before
trying again. On ComfyUI Desktop, restarting only the app window may leave the
old backend process alive.

## Package layout

```text
vivi2d-compat-comfyui/
  __init__.py
  pyproject.toml
  vivi2d_compat/
    __init__.py
    backend.py
    capabilities.py
    manifest.py
    nodes.py
    psd_export.py
    schema/
      vivi2d_manifest_v1.json
```

## Installation target

Install or symlink this directory under ComfyUI `custom_nodes/`.

## Capability metadata

The plugin exposes these values:

- `vivi2d_capability = vivi2d.seethrough.v1`
- `vivi2d_plugin_version = 0.1.0`
- `vivi2d_manifest_schema = 1.0.0`

Vivi2D should validate them before enqueuing compat workflows.
For v1, Vivi2D expects an exact plugin version match and does not treat patch
releases as compatible unless both sides are updated together.
