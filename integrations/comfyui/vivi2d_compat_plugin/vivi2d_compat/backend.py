from __future__ import annotations

import importlib.util
import inspect
import os
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

import numpy


@dataclass(slots=True)
class LayerDepthStats:
    min: float
    max: float
    mean: float


@dataclass(slots=True)
class DecomposedLayer:
    id: str
    name: str
    label: str
    order: int
    bbox: tuple[int, int, int, int]
    confidence: float
    left_right_split: str
    front_back_split: str
    depth_stats: LayerDepthStats
    image: object


@dataclass(slots=True)
class DecomposeResult:
    preview: object
    model: str
    model_version: str
    layers: list[DecomposedLayer]


class SeeThroughBackend(Protocol):
    def decompose(
        self,
        image: object,
        *,
        seed: int,
        resolution: int,
        num_inference_steps: int,
        tblr_split: bool,
        use_lama: bool,
        quant_mode: str,
        group_offload: bool,
        output_dir: Path,
    ) -> DecomposeResult: ...


def _plugin_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _candidate_upstream_paths() -> list[Path]:
    env_path = os.environ.get("VIVI2D_SEETHROUGH_UPSTREAM_PATH")
    candidates: list[Path] = []
    if env_path:
        candidates.append(Path(env_path))

    custom_nodes_dir = _plugin_root().parent
    candidates.append(custom_nodes_dir / "ComfyUI-See-through" / "nodes.py")
    candidates.append(custom_nodes_dir / "ComfyUI_See_through" / "nodes.py")

    main_module = sys.modules.get("__main__")
    main_file = getattr(main_module, "__file__", None)
    if main_file:
        main_base = Path(main_file).resolve().parent
        candidates.append(main_base / "custom_nodes" / "ComfyUI-See-through" / "nodes.py")
        candidates.append(main_base / "custom_nodes" / "ComfyUI_See_through" / "nodes.py")

    if sys.argv:
        argv0 = Path(sys.argv[0]).resolve()
        if argv0.suffix.lower() == ".py":
            argv_base = argv0.parent
            candidates.append(argv_base / "custom_nodes" / "ComfyUI-See-through" / "nodes.py")
            candidates.append(argv_base / "custom_nodes" / "ComfyUI_See_through" / "nodes.py")

    try:
        import folder_paths  # type: ignore

        base_path = Path(
            getattr(folder_paths, "base_path", Path(folder_paths.__file__).resolve().parent)
        )
        candidates.append(base_path / "custom_nodes" / "ComfyUI-See-through" / "nodes.py")
        candidates.append(base_path / "custom_nodes" / "ComfyUI_See_through" / "nodes.py")
        get_folder_paths = getattr(folder_paths, "get_folder_paths", None)
        if callable(get_folder_paths):
            try:
                for custom_root in get_folder_paths("custom_nodes"):
                    custom_root_path = Path(custom_root).resolve()
                    candidates.append(
                        custom_root_path / "ComfyUI-See-through" / "nodes.py"
                    )
                    candidates.append(
                        custom_root_path / "ComfyUI_See_through" / "nodes.py"
                    )
            except Exception:
                pass
    except Exception:
        pass

    # Preserve search order while removing duplicates.
    deduped: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = str(candidate).lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(candidate)
    return deduped


def _resolve_upstream_nodes_path() -> Path | None:
    for candidate in _candidate_upstream_paths():
        if candidate.is_file():
            return candidate
    return None


def _is_upstream_module(module: Any) -> bool:
    if module is None:
        return False
    required = (
        "SeeThrough_LoadLayerDiffModel",
        "SeeThrough_LoadDepthModel",
        "SeeThrough_GenerateLayers",
        "SeeThrough_GenerateDepth",
        "SeeThrough_PostProcess",
    )
    return all(hasattr(module, name) for name in required)


def _find_loaded_upstream_module() -> Any | None:
    for module in tuple(sys.modules.values()):
        if not _is_upstream_module(module):
            continue

        module_file = getattr(module, "__file__", None)
        if not module_file:
            continue

        normalized = str(module_file).replace("\\", "/").lower()
        if normalized.endswith("/comfyui-see-through/nodes.py") or normalized.endswith(
            "/comfyui_see_through/nodes.py"
        ):
            return module

    return None


@lru_cache(maxsize=1)
def _load_upstream_module() -> Any:
    loaded_module = _find_loaded_upstream_module()
    if loaded_module is not None:
        return loaded_module

    upstream_path = _resolve_upstream_nodes_path()
    if upstream_path is None:
        raise RuntimeError(
            "Could not locate ComfyUI-See-through nodes.py. "
            "Install it as a sibling custom node or configure the Vivi2D "
            "integration path."
        )

    spec = importlib.util.spec_from_file_location(
        "vivi2d_compat_upstream_seethrough",
        upstream_path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load the ComfyUI-See-through module.")

    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception:
        raise RuntimeError("Failed to load the ComfyUI-See-through module.") from None
    return module


def _call_supported_kwargs(target: Any, **kwargs: Any) -> Any:
    signature = inspect.signature(target)
    supported = {
        name: value for name, value in kwargs.items() if name in signature.parameters
    }
    return target(**supported)


def _instantiate_upstream_node(module: Any, class_name: str) -> Any:
    node_class = getattr(module, class_name, None)
    if node_class is None:
        raise RuntimeError(
            f"Upstream ComfyUI-See-through is missing node class {class_name}"
        )
    return node_class()


def _infer_left_right_split(tag: str) -> str:
    normalized = tag.lower()
    if normalized.endswith("-l") or normalized.endswith("_l") or "left" in normalized:
        return "left"
    if normalized.endswith("-r") or normalized.endswith("_r") or "right" in normalized:
        return "right"
    return "center"


def _infer_front_back_split(tag: str) -> str:
    normalized = tag.lower()
    if "front" in normalized:
        return "front"
    if "back" in normalized:
        return "back"
    if "middle" in normalized or "mid" in normalized:
        return "middle"
    return "unknown"


def _compute_depth_stats(depth: Any, alpha_mask: numpy.ndarray) -> LayerDepthStats:
    if depth is None:
        return LayerDepthStats(min=1.0, max=1.0, mean=1.0)

    depth_array = numpy.asarray(depth, dtype=numpy.float32)
    if depth_array.ndim == 3:
        depth_array = depth_array[..., 0]

    valid = depth_array[alpha_mask > 10]
    if valid.size == 0:
        valid = depth_array.reshape(-1)
    if valid.size == 0:
        return LayerDepthStats(min=1.0, max=1.0, mean=1.0)

    return LayerDepthStats(
        min=float(valid.min()),
        max=float(valid.max()),
        mean=float(valid.mean()),
    )


@lru_cache(maxsize=8)
def _load_layer_model(quant_mode: str, group_offload: bool) -> Any:
    module = _load_upstream_module()
    loader = _instantiate_upstream_node(module, "SeeThrough_LoadLayerDiffModel")
    model_name = getattr(module, "DEFAULT_LAYERDIFF_REPO", None)
    if quant_mode == "nf4":
        model_name = getattr(module, "DEFAULT_LAYERDIFF_NF4_REPO", model_name)

    result = _call_supported_kwargs(
        loader.load_model,
        model=model_name,
        quant_mode=quant_mode,
        group_offload=group_offload,
    )
    return result[0] if isinstance(result, tuple) else result


@lru_cache(maxsize=8)
def _load_depth_model(quant_mode: str, group_offload: bool) -> Any:
    module = _load_upstream_module()
    loader = _instantiate_upstream_node(module, "SeeThrough_LoadDepthModel")
    model_name = getattr(module, "DEFAULT_DEPTH_REPO", None)
    if quant_mode == "nf4":
        model_name = getattr(module, "DEFAULT_DEPTH_NF4_REPO", model_name)

    result = _call_supported_kwargs(
        loader.load_model,
        model=model_name,
        quant_mode=quant_mode,
        cache_tag_embeds=True,
        group_offload=group_offload,
    )
    return result[0] if isinstance(result, tuple) else result


class SeeThroughComfyShimBackend:
    def decompose(
        self,
        image: object,
        *,
        seed: int,
        resolution: int,
        num_inference_steps: int,
        tblr_split: bool,
        use_lama: bool,
        quant_mode: str,
        group_offload: bool,
        output_dir: Path,
    ) -> DecomposeResult:
        del output_dir

        module = _load_upstream_module()
        layer_model = _load_layer_model(quant_mode, group_offload)
        depth_model = _load_depth_model(quant_mode, group_offload)

        generate_layers = _instantiate_upstream_node(module, "SeeThrough_GenerateLayers")
        generate_depth = _instantiate_upstream_node(module, "SeeThrough_GenerateDepth")
        post_process = _instantiate_upstream_node(module, "SeeThrough_PostProcess")

        layers_result = _call_supported_kwargs(
            generate_layers.generate,
            image=image,
            layerdiff_model=layer_model,
            model=layer_model,
            seed=seed,
            resolution=resolution,
            num_inference_steps=num_inference_steps,
        )
        layers_data = layers_result[0] if isinstance(layers_result, tuple) else layers_result

        depth_result = _call_supported_kwargs(
            generate_depth.generate,
            layers=layers_data,
            layers_data=layers_data,
            depth_model=depth_model,
            model=depth_model,
            seed=seed,
            resolution_depth=-1,
        )
        depth_data = depth_result[0] if isinstance(depth_result, tuple) else depth_result

        post_result = _call_supported_kwargs(
            getattr(post_process, "postprocess", getattr(post_process, "process", None)),
            layers_depth=depth_data,
            layers=depth_data,
            layers_data=depth_data,
            tblr_split=tblr_split,
            use_lama=use_lama,
            resolution=resolution,
        )
        if not isinstance(post_result, tuple) or len(post_result) < 2:
            raise RuntimeError("Unexpected result from upstream SeeThrough_PostProcess node")

        parts, preview = post_result[0], post_result[1]
        if not isinstance(parts, dict) or "tag2pinfo" not in parts:
            raise RuntimeError("Upstream post-process node did not return parts metadata")

        tag2pinfo = parts["tag2pinfo"]
        frame_size = parts.get("frame_size", (resolution, resolution))
        _canvas_h, _canvas_w = int(frame_size[0]), int(frame_size[1])

        sorted_tags = sorted(
            tag2pinfo.keys(),
            key=lambda tag: tag2pinfo[tag].get("depth_median", 1),
            reverse=True,
        )

        layers: list[DecomposedLayer] = []
        for order, tag in enumerate(sorted_tags):
            pinfo = tag2pinfo[tag]
            image_array = pinfo.get("img")
            if image_array is None:
                continue

            rgba = numpy.asarray(image_array)
            xyxy = pinfo.get("xyxy", [0, 0, rgba.shape[1], rgba.shape[0]])
            left, top, right, bottom = (int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3]))
            alpha = rgba[..., 3] if rgba.ndim == 3 and rgba.shape[-1] >= 4 else numpy.ones(
                (rgba.shape[0], rgba.shape[1]),
                dtype=numpy.uint8,
            ) * 255
            depth_stats = _compute_depth_stats(pinfo.get("depth"), alpha)

            layers.append(
                DecomposedLayer(
                    id=f"layer_{order:03d}",
                    name=tag,
                    label=tag,
                    order=order,
                    bbox=(left, top, right, bottom),
                    confidence=1.0,
                    left_right_split=_infer_left_right_split(tag),
                    front_back_split=_infer_front_back_split(tag),
                    depth_stats=depth_stats,
                    image=rgba,
                )
            )

        return DecomposeResult(
            preview=preview,
            model="ComfyUI-See-through",
            model_version=getattr(module, "__version__", "unknown"),
            layers=layers,
        )


class UnconfiguredSeeThroughBackend:
    def decompose(
        self,
        image: object,
        *,
        seed: int,
        resolution: int,
        num_inference_steps: int,
        tblr_split: bool,
        use_lama: bool,
        quant_mode: str,
        group_offload: bool,
        output_dir: Path,
    ) -> DecomposeResult:
        del image, seed, resolution, num_inference_steps, tblr_split, use_lama, quant_mode, group_offload, output_dir
        raise RuntimeError(
            "vivi2d-compat-comfyui backend is not wired yet. "
            "Install ComfyUI-See-through next to this plugin, or set "
            "VIVI2D_SEETHROUGH_UPSTREAM_PATH to its nodes.py."
        )


@lru_cache(maxsize=1)
def load_backend() -> SeeThroughBackend:
    if os.environ.get("VIVI2D_SEETHROUGH_BACKEND", "").lower() == "stub":
        return UnconfiguredSeeThroughBackend()

    if _resolve_upstream_nodes_path() is None:
        return UnconfiguredSeeThroughBackend()

    return SeeThroughComfyShimBackend()
