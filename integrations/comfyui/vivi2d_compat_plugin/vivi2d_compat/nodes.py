from __future__ import annotations

import re
import tempfile
import uuid
from pathlib import Path
from typing import Any

import numpy
from PIL import Image

from .backend import load_backend
from .capabilities import (
    VIVI2D_CAPABILITY,
    VIVI2D_COMPAT_METADATA,
    VIVI2D_MANIFEST_SCHEMA,
    VIVI2D_PLUGIN_VERSION,
)
from .manifest import build_manifest, write_manifest
from .psd_export import export_psd_from_manifest

_SAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")
MAX_IMAGE_SIDE = 8192
MAX_INPUT_PIXELS = 4096 * 4096
MAX_PREVIEW_PIXELS = 4096 * 4096
MAX_LAYER_PIXELS = 4096 * 4096
MAX_TOTAL_LAYER_PIXELS = 64 * 1024 * 1024


def _safe_filename_prefix(filename_prefix: str, fallback: str) -> str:
    cleaned = _SAFE_FILENAME_CHARS.sub("_", str(filename_prefix).strip())[:64]
    cleaned = cleaned.strip("._-")
    return cleaned or fallback


def _resolve_output_root() -> Path:
    try:
        import folder_paths  # type: ignore

        base = Path(folder_paths.get_output_directory())
    except Exception:
        base = Path(tempfile.gettempdir()) / "vivi2d-comfyui-output"
    return base / "vivi2d"


def _output_ref(path: Path) -> str:
    root = _resolve_output_root().parent
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def _job_dir(kind: str, filename_prefix: str) -> Path:
    job_id = f"{_safe_filename_prefix(filename_prefix, 'vivi2d')}_{uuid.uuid4().hex[:12]}"
    path = _resolve_output_root() / kind / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _assert_image_bounds(width: int, height: int, label: str, max_pixels: int) -> int:
    if width <= 0 or height <= 0:
        raise RuntimeError(f"{label} has invalid dimensions.")
    if width > MAX_IMAGE_SIDE or height > MAX_IMAGE_SIDE:
        raise RuntimeError(f"{label} exceeds the maximum supported dimensions.")
    pixels = width * height
    if pixels > max_pixels:
        raise RuntimeError(f"{label} exceeds the maximum supported pixel count.")
    return pixels


def _image_shape_pixels(image: Any, *, label: str, max_pixels: int) -> int | None:
    if isinstance(image, Image.Image):
        return _assert_image_bounds(int(image.width), int(image.height), label, max_pixels)

    shape = getattr(image, "shape", None)
    if shape is None:
        return None

    dimensions = tuple(int(value) for value in shape)
    if len(dimensions) == 4:
        if dimensions[0] <= 0:
            raise RuntimeError(f"{label} has invalid dimensions.")
        dimensions = dimensions[1:]
    if len(dimensions) not in (2, 3):
        raise RuntimeError(f"{label} has unsupported dimensions.")

    height, width = int(dimensions[0]), int(dimensions[1])
    return _assert_image_bounds(width, height, label, max_pixels)


def _to_pil_image(image: Any, *, label: str, max_pixels: int) -> Image.Image:
    array = image
    _image_shape_pixels(array, label=label, max_pixels=max_pixels)
    if hasattr(array, "cpu"):
        array = array.cpu().numpy()
    if hasattr(array, "numpy"):
        array = array.numpy()
    array = numpy.asarray(array)
    if array.ndim == 4:
        if array.shape[0] <= 0:
            raise RuntimeError(f"{label} has invalid dimensions.")
        array = array[0]
    if array.ndim not in (2, 3):
        raise RuntimeError(f"{label} has unsupported dimensions.")
    height, width = int(array.shape[0]), int(array.shape[1])
    _assert_image_bounds(width, height, label, max_pixels)
    if array.dtype != numpy.uint8:
        array = numpy.clip(array, 0.0, 1.0)
        array = (array * 255).astype(numpy.uint8)
    return Image.fromarray(array)


def _to_comfy_image(image: Image.Image) -> Any:
    import torch

    arr = numpy.asarray(image).astype(numpy.float32) / 255.0
    if arr.ndim == 2:
        arr = numpy.stack([arr, arr, arr], axis=-1)
    return torch.from_numpy(arr).unsqueeze(0)


class ViviSeeThroughDecompose:
    CATEGORY = "Vivi2D/See-through"
    FUNCTION = "decompose"
    OUTPUT_NODE = True
    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("preview", "manifest_path")
    DESCRIPTION = (
        "Run See-through decomposition and emit a Vivi2D-owned manifest path."
    )

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "image": ("IMAGE", {}),
                "seed": ("INT", {"default": 42, "min": 0}),
                "resolution": ("INT", {"default": 1280, "min": 64, "max": 8192}),
                "num_inference_steps": ("INT", {"default": 30, "min": 1, "max": 200}),
                "tblr_split": ("BOOLEAN", {"default": True}),
                "use_lama": ("BOOLEAN", {"default": True}),
                "quant_mode": (["none", "nf4"], {"default": "none"}),
                "group_offload": ("BOOLEAN", {"default": False}),
                "filename_prefix": ("STRING", {"default": "vivi2d_seethrough"}),
                "schema_version": ("STRING", {"default": VIVI2D_MANIFEST_SCHEMA}),
                "plugin_version": ("STRING", {"default": VIVI2D_PLUGIN_VERSION}),
                "capability": ("STRING", {"default": VIVI2D_CAPABILITY}),
            }
        }

    def decompose(
        self,
        image: Any,
        seed: int,
        resolution: int,
        num_inference_steps: int,
        tblr_split: bool,
        use_lama: bool,
        quant_mode: str,
        group_offload: bool,
        filename_prefix: str,
        schema_version: str,
        plugin_version: str,
        capability: str,
    ) -> tuple[Any, str]:
        if schema_version != VIVI2D_MANIFEST_SCHEMA:
            raise RuntimeError(
                f"Unsupported Vivi2D manifest schema: {schema_version}. "
                f"Expected {VIVI2D_MANIFEST_SCHEMA}."
            )
        if plugin_version != VIVI2D_PLUGIN_VERSION:
            raise RuntimeError(
                f"Unsupported Vivi2D compat plugin version: {plugin_version}. "
                f"Expected {VIVI2D_PLUGIN_VERSION}."
            )
        if capability != VIVI2D_CAPABILITY:
            raise RuntimeError(
                f"Unsupported Vivi2D compat capability: {capability}. "
                f"Expected {VIVI2D_CAPABILITY}."
            )

        _image_shape_pixels(
            image,
            label="Input image",
            max_pixels=MAX_INPUT_PIXELS,
        )

        backend = load_backend()
        output_dir = _job_dir("decompose", filename_prefix)
        layers_dir = output_dir / "layers"
        layers_dir.mkdir(parents=True, exist_ok=True)

        result = backend.decompose(
            image=image,
            seed=seed,
            resolution=resolution,
            num_inference_steps=num_inference_steps,
            tblr_split=tblr_split,
            use_lama=use_lama,
            quant_mode=quant_mode,
            group_offload=group_offload,
            output_dir=output_dir,
        )

        preview_image = _to_pil_image(
            result.preview,
            label="Preview image",
            max_pixels=MAX_PREVIEW_PIXELS,
        )
        preview_path = output_dir / "preview.png"
        preview_image.save(preview_path)

        layer_paths: list[str] = []
        total_layer_pixels = 0
        for index, layer in enumerate(result.layers):
            layer_label = f"Layer image {index}"
            planned_pixels = _image_shape_pixels(
                layer.image,
                label=layer_label,
                max_pixels=MAX_LAYER_PIXELS,
            )
            if (
                planned_pixels is not None
                and total_layer_pixels + planned_pixels > MAX_TOTAL_LAYER_PIXELS
            ):
                raise RuntimeError("Layer images exceed the maximum total pixel count.")
            layer_image = _to_pil_image(
                layer.image,
                label=layer_label,
                max_pixels=MAX_LAYER_PIXELS,
            )
            total_layer_pixels += planned_pixels or (layer_image.width * layer_image.height)
            if total_layer_pixels > MAX_TOTAL_LAYER_PIXELS:
                raise RuntimeError("Layer images exceed the maximum total pixel count.")
            filename = f"layer_{index:03d}.png"
            layer_path = layers_dir / filename
            layer_image.save(layer_path)
            layer_paths.append(str(Path("layers") / filename))

        manifest = build_manifest(
            result=result,
            canvas_width=preview_image.width,
            canvas_height=preview_image.height,
            layer_image_paths=layer_paths,
        )
        manifest_path = output_dir / "manifest.json"
        write_manifest(manifest_path, manifest)
        manifest_ref = _output_ref(manifest_path)
        return {
            "ui": {"text": [manifest_ref]},
            "result": (_to_comfy_image(preview_image), manifest_ref),
        }


class ViviSeeThroughExportPSD:
    CATEGORY = "Vivi2D/See-through"
    FUNCTION = "export_psd"
    OUTPUT_NODE = True
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("psd_path",)
    DESCRIPTION = "Export a PSD from a Vivi2D See-through manifest path."

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "manifest_path": ("STRING", {"default": ""}),
                "filename_prefix": ("STRING", {"default": "vivi2d_export"}),
            }
        }

    def export_psd(self, manifest_path: str, filename_prefix: str) -> tuple[str]:
        output_dir = _job_dir("psd", filename_prefix)
        psd_path = export_psd_from_manifest(
            manifest_path=Path(manifest_path),
            output_dir=output_dir,
            filename_prefix=filename_prefix,
            output_root=_resolve_output_root().parent,
        )
        psd_ref = _output_ref(psd_path)
        return {
            "ui": {"text": [psd_ref]},
            "result": (psd_ref,),
        }


NODE_CLASS_MAPPINGS = {
    "ViviSeeThroughDecompose": ViviSeeThroughDecompose,
    "ViviSeeThroughExportPSD": ViviSeeThroughExportPSD,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ViviSeeThroughDecompose": "Vivi See-through Decompose",
    "ViviSeeThroughExportPSD": "Vivi See-through Export PSD",
}
