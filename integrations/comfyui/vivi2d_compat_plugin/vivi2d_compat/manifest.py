from __future__ import annotations

"""Read and write the Vivi2D bridge manifest at the ComfyUI plugin boundary.

The manifest is local tool output, so this module validates size, schema, and
layer-count limits before Vivi2D or PSD export code trusts any fields.
"""

import json
import math
import re
import uuid
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
MAX_MANIFEST_LAYERS = 127
# 4096x4096 RGBA scanlines require slightly more than 64 MiB once filter
# bytes and PNG framing are included. The aggregate plus the manifest remains
# within the provider SDK's 200 MiB default output budget.
MAX_LAYER_IMAGE_BYTES = 65 * 1024 * 1024
MAX_TOTAL_LAYER_IMAGE_BYTES = 198 * 1024 * 1024
MAX_IMAGE_SIDE = 8192
MAX_CANVAS_PIXELS = 4096 * 4096
MAX_TOTAL_LAYER_PIXELS = 64 * 1024 * 1024
MAX_IDENTIFIER_UTF8_BYTES = 256
MAX_DISPLAY_TEXT_UTF8_BYTES = 1024
MAX_IMAGE_PATH_UTF8_BYTES = 4096
MAX_SAFE_INTEGER = (1 << 53) - 1

_DRIVE_PATH = re.compile(r"^[A-Za-z]:/")
_URI_SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")
_ECMASCRIPT_TRIM_CHARS = (
    "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680"
    "\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u2028\u2029\u202f\u205f\u3000\ufeff"
)


@dataclass(slots=True)
class ManifestCanvas:
    width: int
    height: int


def schema_path() -> Path:
    return Path(__file__).resolve().parent / "schema" / "vivi2d_manifest_v1.json"


def load_schema() -> dict[str, Any]:
    return json.loads(schema_path().read_text(encoding="utf-8"))


def _is_finite_number(value: Any) -> bool:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _is_safe_integer(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    if isinstance(value, float) and (not math.isfinite(value) or not value.is_integer()):
        return False
    return -MAX_SAFE_INTEGER <= value <= MAX_SAFE_INTEGER


def _assert_bounded_string(value: str, field: str, max_bytes: int) -> None:
    if not value.strip(_ECMASCRIPT_TRIM_CHARS) or "\0" in value:
        raise RuntimeError(f"Vivi2D manifest {field} is invalid.")
    try:
        byte_length = len(value.encode("utf-8"))
    except UnicodeEncodeError as exc:
        raise RuntimeError(f"Vivi2D manifest {field} is invalid UTF-8.") from exc
    if byte_length > max_bytes:
        raise RuntimeError(
            f"Vivi2D manifest {field} exceeds the maximum supported length."
        )


def _assert_relative_image_path(value: str, field: str) -> None:
    normalized = value.replace("\\", "/").strip(_ECMASCRIPT_TRIM_CHARS)
    if (
        normalized.startswith("/")
        or _DRIVE_PATH.match(normalized)
        or _URI_SCHEME.match(normalized)
    ):
        raise RuntimeError(f"Vivi2D manifest {field} must be a relative path.")
    segments = [segment for segment in normalized.split("/") if segment]
    if not segments or any(segment in (".", "..") for segment in segments):
        raise RuntimeError(f"Vivi2D manifest {field} contains invalid traversal.")
    if segments[0] in ("output", "temp"):
        raise RuntimeError(
            f"Vivi2D manifest {field} uses a reserved output namespace."
        )


def _validate_manifest_semantics(manifest: dict[str, Any]) -> None:
    canvas = manifest["canvas"]
    width = canvas["width"]
    height = canvas["height"]
    if not _is_safe_integer(width) or not _is_safe_integer(height):
        raise RuntimeError("Vivi2D manifest canvas dimensions must be safe integers.")
    if width > MAX_IMAGE_SIDE or height > MAX_IMAGE_SIDE:
        raise RuntimeError("Vivi2D manifest canvas exceeds the maximum supported side.")
    if width * height > MAX_CANVAS_PIXELS:
        raise RuntimeError("Vivi2D manifest canvas exceeds the maximum supported area.")

    generator = manifest["generator"]
    _assert_bounded_string(
        generator["plugin_version"],
        "generator.plugin_version",
        MAX_IDENTIFIER_UTF8_BYTES,
    )
    if generator["plugin_version"] != VIVI2D_PLUGIN_VERSION:
        raise RuntimeError("Vivi2D manifest generator version is unsupported.")
    _assert_bounded_string(
        generator["model"],
        "generator.model",
        MAX_IDENTIFIER_UTF8_BYTES,
    )
    _assert_bounded_string(
        generator["model_version"],
        "generator.model_version",
        MAX_IDENTIFIER_UTF8_BYTES,
    )

    layer_ids: set[str] = set()
    leaf_tokens: set[str] = set()
    total_layer_pixels = 0
    for index, layer in enumerate(manifest["layers"]):
        field = f"layers[{index}]"
        _assert_bounded_string(layer["id"], f"{field}.id", MAX_IDENTIFIER_UTF8_BYTES)
        _assert_bounded_string(
            layer["name"], f"{field}.name", MAX_DISPLAY_TEXT_UTF8_BYTES
        )
        _assert_bounded_string(
            layer["label"], f"{field}.label", MAX_DISPLAY_TEXT_UTF8_BYTES
        )
        _assert_bounded_string(
            layer["psd_leaf_token"],
            f"{field}.psd_leaf_token",
            MAX_IDENTIFIER_UTF8_BYTES,
        )
        _assert_bounded_string(
            layer["image_path"],
            f"{field}.image_path",
            MAX_IMAGE_PATH_UTF8_BYTES,
        )

        if layer["id"] in layer_ids:
            raise RuntimeError(f"Vivi2D manifest contains a duplicate layer id at {field}.id.")
        layer_ids.add(layer["id"])
        if layer["psd_leaf_token"] in leaf_tokens:
            raise RuntimeError(
                "Vivi2D manifest contains a duplicate PSD leaf token at "
                f"{field}.psd_leaf_token."
            )
        leaf_tokens.add(layer["psd_leaf_token"])

        if not _is_safe_integer(layer["order"]):
            raise RuntimeError(f"Vivi2D manifest {field}.order must be a safe integer.")
        _assert_relative_image_path(layer["image_path"], f"{field}.image_path")

        left, top, right, bottom = layer["bbox"]
        if not all(_is_safe_integer(value) for value in (left, top, right, bottom)):
            raise RuntimeError(
                f"Vivi2D manifest {field}.bbox must contain safe integers."
            )
        if (
            left < 0
            or top < 0
            or right <= left
            or bottom <= top
            or right > width
            or bottom > height
        ):
            raise RuntimeError(f"Vivi2D manifest {field}.bbox is outside the canvas.")
        total_layer_pixels += (right - left) * (bottom - top)
        if total_layer_pixels > MAX_TOTAL_LAYER_PIXELS:
            raise RuntimeError("Vivi2D manifest layers exceed the maximum total area.")

        if not _is_finite_number(layer["confidence"]):
            raise RuntimeError(f"Vivi2D manifest {field}.confidence must be finite.")
        depth_stats = layer["depth_stats"]
        if not all(
            _is_finite_number(depth_stats[value]) for value in ("min", "mean", "max")
        ):
            raise RuntimeError(f"Vivi2D manifest {field}.depth_stats must be finite.")
        if not (
            depth_stats["min"] <= depth_stats["mean"] <= depth_stats["max"]
        ):
            raise RuntimeError(f"Vivi2D manifest {field}.depth_stats is inconsistent.")


def _validate_manifest(manifest: dict[str, Any]) -> None:
    layers = manifest.get("layers")
    if isinstance(layers, list) and len(layers) > MAX_MANIFEST_LAYERS:
        raise RuntimeError("Vivi2D manifest contains too many layers.")
    try:
        validate(instance=manifest, schema=load_schema())
    except ValidationError as exc:
        raise RuntimeError("Vivi2D manifest does not match the expected schema.") from exc
    _validate_manifest_semantics(manifest)


def build_manifest(
    *,
    result: DecomposeResult,
    canvas_width: int,
    canvas_height: int,
    layer_image_paths: list[str],
) -> dict[str, Any]:
    if len(result.layers) > MAX_MANIFEST_LAYERS:
        raise RuntimeError("Vivi2D manifest contains too many layers.")
    if len(layer_image_paths) != len(result.layers):
        raise RuntimeError("Vivi2D manifest layer image count is inconsistent.")

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
    try:
        serialized = json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise RuntimeError("Vivi2D manifest is not valid finite JSON.") from exc
    _validate_manifest(manifest)
    encoded = serialized.encode("utf-8")
    if len(encoded) > MAX_MANIFEST_BYTES:
        raise RuntimeError("Vivi2D manifest exceeds the maximum supported size.")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary_path.open("xb") as handle:
            written = handle.write(encoded)
            if written != len(encoded):
                raise OSError("short manifest write")
        temporary_path.replace(path)
    finally:
        temporary_path.unlink(missing_ok=True)


def _parse_finite_float(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError("non-finite JSON number")
    return parsed


def _reject_nonfinite_constant(_value: str) -> None:
    raise ValueError("non-finite JSON constant")


def read_manifest(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        encoded = handle.read(MAX_MANIFEST_BYTES + 1)
    if len(encoded) > MAX_MANIFEST_BYTES:
        raise RuntimeError("Vivi2D manifest exceeds the maximum supported size.")
    try:
        text = encoded.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError("Vivi2D manifest is not valid UTF-8.") from exc
    try:
        data = json.loads(
            text,
            parse_float=_parse_finite_float,
            parse_constant=_reject_nonfinite_constant,
        )
    except (json.JSONDecodeError, ValueError) as exc:
        raise RuntimeError("Vivi2D manifest is not valid JSON.") from exc
    if not isinstance(data, dict):
        raise RuntimeError("Vivi2D manifest must be a JSON object.")
    _validate_manifest(data)
    return data
