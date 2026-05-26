from __future__ import annotations

"""Read and write the Vivi2D bridge manifest at the ComfyUI plugin boundary.

The manifest is local tool output, so this module validates size, schema, and
layer-count limits before Vivi2D or PSD export code trusts any fields.
"""

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from jsonschema import ValidationError, validate

from .capabilities import (
    VIVI2D_MANIFEST_SCHEMA,
    VIVI2D_PLUGIN_NAME,
    VIVI2D_PLUGIN_VERSION,
)
from .backend import DecomposeResult

MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_MANIFEST_LAYERS = 256


@dataclass(slots=True)
class ManifestCanvas:
    width: int
    height: int


def schema_path() -> Path:
    return Path(__file__).resolve().parent / "schema" / "vivi2d_manifest_v1.json"


def load_schema() -> dict[str, Any]:
    return json.loads(schema_path().read_text(encoding="utf-8"))


def _validate_manifest(manifest: dict[str, Any]) -> None:
    try:
        validate(instance=manifest, schema=load_schema())
    except ValidationError as exc:
        raise RuntimeError("Vivi2D manifest does not match the expected schema.") from exc

    layers = manifest.get("layers")
    if isinstance(layers, list) and len(layers) > MAX_MANIFEST_LAYERS:
        raise RuntimeError("Vivi2D manifest contains too many layers.")


def build_manifest(
    *,
    result: DecomposeResult,
    canvas_width: int,
    canvas_height: int,
    layer_image_paths: list[str],
) -> dict[str, Any]:
    layers: list[dict[str, Any]] = []
    for index, layer in enumerate(result.layers):
        layers.append(
            {
                "id": layer.id,
                "name": layer.name,
                "label": layer.label,
                "order": layer.order,
                "psd_leaf_token": layer.id,
                "image_path": layer_image_paths[index],
                "bbox": list(layer.bbox),
                "confidence": layer.confidence,
                "left_right_split": layer.left_right_split,
                "front_back_split": layer.front_back_split,
                "depth_stats": asdict(layer.depth_stats),
            }
        )

    manifest: dict[str, Any] = {
        "schema_version": VIVI2D_MANIFEST_SCHEMA,
        "generator": {
            "plugin": VIVI2D_PLUGIN_NAME,
            "plugin_version": VIVI2D_PLUGIN_VERSION,
            "model": result.model,
            "model_version": result.model_version,
        },
        "canvas": asdict(ManifestCanvas(width=canvas_width, height=canvas_height)),
        "layers": layers,
    }
    _validate_manifest(manifest)
    return manifest


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def read_manifest(path: Path) -> dict[str, Any]:
    if path.stat().st_size > MAX_MANIFEST_BYTES:
        raise RuntimeError("Vivi2D manifest exceeds the maximum supported size.")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Vivi2D manifest is not valid JSON.") from exc
    if not isinstance(data, dict):
        raise RuntimeError("Vivi2D manifest must be a JSON object.")
    _validate_manifest(data)
    return data
