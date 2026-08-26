from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

import numpy
from PIL import Image

from .manifest import (
    MAX_LAYER_IMAGE_BYTES,
    MAX_TOTAL_LAYER_IMAGE_BYTES,
    read_manifest,
)

_SAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")
MAX_IMAGE_SIDE = 8192
MAX_LAYER_PIXELS = 4096 * 4096
MAX_CANVAS_PIXELS = 4096 * 4096
MAX_TOTAL_LAYER_PIXELS = 64 * 1024 * 1024
MAX_PSD_BYTES = 200 * 1024 * 1024


def _safe_filename_prefix(filename_prefix: str) -> str:
    cleaned = _SAFE_FILENAME_CHARS.sub("_", str(filename_prefix).strip())[:64]
    cleaned = cleaned.strip("._-")
    return cleaned or "vivi2d_export"


def _assert_image_bounds(width: int, height: int, label: str, max_pixels: int) -> int:
    if width <= 0 or height <= 0:
        raise RuntimeError(f"{label} has invalid dimensions.")
    if width > MAX_IMAGE_SIDE or height > MAX_IMAGE_SIDE:
        raise RuntimeError(f"{label} exceeds the maximum supported dimensions.")
    pixels = width * height
    if pixels > max_pixels:
        raise RuntimeError(f"{label} exceeds the maximum supported pixel count.")
    return pixels


def _load_pytoshop() -> tuple[Any, Any]:
    try:
        from pytoshop import enums
        from pytoshop import codecs as pytoshop_codecs
        from pytoshop.user import nested_layers
    except ImportError:
        raise RuntimeError(
            "Server-side PSD export requires pytoshop>=1.2.1. "
            "Install the dependency in the ComfyUI environment before using "
            "ViviSeeThroughExportPSD."
        ) from None

    if not hasattr(pytoshop_codecs, "packbits"):
        try:
            import packbits  # type: ignore
        except ImportError:
            raise RuntimeError(
                "Server-side PSD export requires the packbits package to be "
                "available in the ComfyUI environment."
            ) from None
        pytoshop_codecs.packbits = packbits

    return enums, nested_layers


def _resolve_manifest_path(manifest_path: Path, output_root: Path | None) -> Path:
    if output_root is None:
        return manifest_path.resolve()

    resolved_root = output_root.resolve()
    candidate = manifest_path if manifest_path.is_absolute() else resolved_root / manifest_path
    resolved_candidate = candidate.resolve()
    try:
        resolved_candidate.relative_to(resolved_root)
    except ValueError:
        raise RuntimeError("Manifest path must stay within the ComfyUI output root.") from None
    return resolved_candidate


def _resolve_output_dir(output_dir: Path, output_root: Path | None) -> Path:
    resolved_output_dir = output_dir.resolve()
    if output_root is None:
        return resolved_output_dir

    resolved_root = output_root.resolve()
    try:
        resolved_output_dir.relative_to(resolved_root)
    except ValueError:
        raise RuntimeError("PSD output directory must stay within the ComfyUI output root.") from None
    return resolved_output_dir


def _resolve_layer_path(manifest_dir: Path, image_path: str) -> Path:
    relative_path = Path(image_path)
    if relative_path.is_absolute():
        raise RuntimeError("Layer image path must be relative to the manifest directory.")

    resolved_manifest_dir = manifest_dir.resolve()
    resolved_candidate = (resolved_manifest_dir / relative_path).resolve()
    try:
        resolved_candidate.relative_to(resolved_manifest_dir)
    except ValueError:
        raise RuntimeError("Layer image path escapes the manifest directory.") from None
    return resolved_candidate


def _layer_name(name: str, psd_leaf_token: str) -> str:
    return f"v2d[{psd_leaf_token}] {name}"


def _inspect_layer_image(layer_path: Path) -> tuple[int, int, int, int]:
    with layer_path.open("rb") as handle:
        encoded_bytes = handle.seek(0, 2)
        handle.seek(0)
        if encoded_bytes > MAX_LAYER_IMAGE_BYTES:
            raise RuntimeError("Layer image exceeds the maximum encoded size.")
        with Image.open(handle) as image:
            if image.format != "PNG":
                raise RuntimeError("Layer image must be a PNG file.")
            pixel_count = _assert_image_bounds(
                int(image.width),
                int(image.height),
                "Layer image",
                MAX_LAYER_PIXELS,
            )
            return int(image.width), int(image.height), pixel_count, encoded_bytes


def _normalize_rgba_image(
    layer_path: Path,
    *,
    expected_width: int,
    expected_height: int,
) -> numpy.ndarray:
    with layer_path.open("rb") as handle:
        encoded_bytes = handle.seek(0, 2)
        handle.seek(0)
        if encoded_bytes > MAX_LAYER_IMAGE_BYTES:
            raise RuntimeError("Layer image exceeds the maximum encoded size.")
        with Image.open(handle) as image:
            if image.format != "PNG":
                raise RuntimeError("Layer image must be a PNG file.")
            _assert_image_bounds(
                int(image.width),
                int(image.height),
                "Layer image",
                MAX_LAYER_PIXELS,
            )
            if image.width != expected_width or image.height != expected_height:
                raise RuntimeError("Layer image dimensions changed during PSD export.")
            rgba_image = image.convert("RGBA")
            rgba = numpy.asarray(rgba_image, dtype=numpy.uint8)
    if rgba.ndim != 3 or rgba.shape[2] != 4:
        raise RuntimeError("Expected an RGBA layer image.")
    return rgba


def _resolve_layer_image_for_export(
    manifest_dir: Path,
    layer: dict[str, Any],
) -> tuple[Path, int, int, int, int]:
    image_path = _resolve_layer_path(manifest_dir, str(layer["image_path"]))
    if not image_path.exists():
        raise RuntimeError("Layer image referenced by manifest is missing.")
    width, height, pixel_count, encoded_bytes = _inspect_layer_image(image_path)
    left, top, right, bottom = layer["bbox"]
    if width != right - left or height != bottom - top:
        raise RuntimeError("Layer image dimensions do not match the manifest bbox.")
    return image_path, width, height, pixel_count, encoded_bytes


def _to_pytoshop_layer(
    *,
    nested_layers: Any,
    enums: Any,
    layer: dict[str, Any],
    image_path: Path,
    width: int,
    height: int,
) -> Any:
    rgba = _normalize_rgba_image(
        image_path,
        expected_width=width,
        expected_height=height,
    )

    left, top, right, bottom = layer["bbox"]
    if (right - left) != width or (bottom - top) != height:
        raise RuntimeError("Layer image dimensions do not match the manifest bbox.")

    channels = {
        0: numpy.ascontiguousarray(rgba[:, :, 0]),
        1: numpy.ascontiguousarray(rgba[:, :, 1]),
        2: numpy.ascontiguousarray(rgba[:, :, 2]),
        enums.ChannelId.transparency: numpy.ascontiguousarray(rgba[:, :, 3]),
    }

    return nested_layers.Image(
        name=_layer_name(str(layer["name"]), str(layer["psd_leaf_token"])),
        top=int(top),
        left=int(left),
        bottom=int(bottom),
        right=int(right),
        channels=channels,
        color_mode=enums.ColorMode.rgb,
    )


def export_psd_from_manifest(
    *,
    manifest_path: Path,
    output_dir: Path,
    filename_prefix: str,
    output_root: Path | None = None,
) -> Path:
    enums, nested_layers = _load_pytoshop()

    resolved_manifest_path = _resolve_manifest_path(manifest_path, output_root)
    manifest = read_manifest(resolved_manifest_path)
    manifest_dir = resolved_manifest_path.parent
    _assert_image_bounds(
        int(manifest["canvas"]["width"]),
        int(manifest["canvas"]["height"]),
        "Manifest canvas",
        MAX_CANVAS_PIXELS,
    )

    sorted_layers = sorted(manifest["layers"], key=lambda layer: int(layer["order"]))
    psd_layers = []
    total_layer_pixels = 0
    total_layer_image_bytes = 0
    for layer in sorted_layers:
        resolved_layer = _resolve_layer_image_for_export(
            manifest_dir,
            layer,
        )
        image_path, width, height, pixel_count, encoded_bytes = resolved_layer
        if total_layer_image_bytes + encoded_bytes > MAX_TOTAL_LAYER_IMAGE_BYTES:
            raise RuntimeError("Layer images exceed the maximum total encoded size.")
        if total_layer_pixels + pixel_count > MAX_TOTAL_LAYER_PIXELS:
            raise RuntimeError("Layer images exceed the maximum total pixel count.")
        psd_layer = _to_pytoshop_layer(
            nested_layers=nested_layers,
            enums=enums,
            layer=layer,
            image_path=image_path,
            width=width,
            height=height,
        )
        total_layer_pixels += pixel_count
        total_layer_image_bytes += encoded_bytes
        psd_layers.append(psd_layer)

    resolved_output_dir = _resolve_output_dir(output_dir, output_root)
    resolved_output_dir.mkdir(parents=True, exist_ok=True)
    psd_path = resolved_output_dir / f"{_safe_filename_prefix(filename_prefix)}.psd"

    psd = nested_layers.nested_layers_to_psd(
        psd_layers,
        color_mode=enums.ColorMode.rgb,
        size=(
            int(manifest["canvas"]["height"]),
            int(manifest["canvas"]["width"]),
        ),
    )

    temporary_path = psd_path.with_name(f".{psd_path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary_path.open("xb") as handle:
            psd.write(handle)
        if temporary_path.stat().st_size > MAX_PSD_BYTES:
            raise RuntimeError("PSD output exceeds the provider output byte limit.")
        temporary_path.replace(psd_path)
    finally:
        temporary_path.unlink(missing_ok=True)

    return psd_path
