from __future__ import annotations

import json
import os
import shutil
import sys
import types
import unittest
import uuid
import builtins
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TEST_TEMP_ROOT = ROOT / ".tmp-tests"
TEST_TEMP_ROOT.mkdir(parents=True, exist_ok=True)

from vivi2d_compat import psd_export


class _FakeNestedImage:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _FakePsdFile:
    def __init__(self, marker: bytes):
        self._marker = marker

    def write(self, handle) -> None:
        handle.write(self._marker)


class PsdExportTests(unittest.TestCase):
    def setUp(self) -> None:
        self._saved_modules = {
            "pytoshop": sys.modules.get("pytoshop"),
            "pytoshop.codecs": sys.modules.get("pytoshop.codecs"),
            "pytoshop.user": sys.modules.get("pytoshop.user"),
        }
        self._limits = {
            "MAX_LAYER_PIXELS": psd_export.MAX_LAYER_PIXELS,
            "MAX_CANVAS_PIXELS": psd_export.MAX_CANVAS_PIXELS,
            "MAX_TOTAL_LAYER_PIXELS": psd_export.MAX_TOTAL_LAYER_PIXELS,
        }
        self._normalize_rgba_image = psd_export._normalize_rgba_image

    def tearDown(self) -> None:
        for name, module in self._saved_modules.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module
        for key, value in self._limits.items():
            setattr(psd_export, key, value)
        psd_export._normalize_rgba_image = self._normalize_rgba_image

    def _install_fake_pytoshop(self) -> dict[str, object]:
        calls: dict[str, object] = {}

        fake_nested_layers = types.SimpleNamespace()
        fake_nested_layers.Image = _FakeNestedImage

        def nested_layers_to_psd(layers, color_mode, size):
            calls["layers"] = layers
            calls["color_mode"] = color_mode
            calls["size"] = size
            return _FakePsdFile(b"FAKEPSD")

        fake_nested_layers.nested_layers_to_psd = nested_layers_to_psd
        fake_enums = types.SimpleNamespace(
            ColorMode=types.SimpleNamespace(rgb="rgb"),
            ChannelId=types.SimpleNamespace(transparency=-1),
        )
        fake_codecs = types.SimpleNamespace(packbits=types.SimpleNamespace())
        fake_pytoshop = types.SimpleNamespace(
            enums=fake_enums,
            codecs=fake_codecs,
            user=types.SimpleNamespace(nested_layers=fake_nested_layers),
        )

        sys.modules["pytoshop"] = fake_pytoshop
        sys.modules["pytoshop.codecs"] = fake_codecs
        sys.modules["pytoshop.user"] = fake_pytoshop.user
        return calls

    def _patch_import(self, replacement) -> None:
        original_import = builtins.__import__
        builtins.__import__ = replacement
        self.addCleanup(lambda: setattr(builtins, "__import__", original_import))

    def _create_temp_dir(self) -> Path:
        path = TEST_TEMP_ROOT / f"psd_{uuid.uuid4().hex}"
        path.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(path, ignore_errors=True))
        return path

    def test_export_psd_from_manifest_writes_positioned_layers(self) -> None:
        calls = self._install_fake_pytoshop()

        temp_root = self._create_temp_dir()
        output_root = temp_root / "output"
        manifest_dir = output_root / "vivi2d" / "decompose" / "job"
        layers_dir = manifest_dir / "layers"
        layers_dir.mkdir(parents=True, exist_ok=True)

        Image.new("RGBA", (4, 3), (255, 0, 0, 255)).save(layers_dir / "layer_000.png")
        Image.new("RGBA", (4, 3), (0, 0, 255, 255)).save(layers_dir / "layer_001.png")

        manifest = {
            "schema_version": "1.0.0",
            "generator": {
                "plugin": "vivi2d-compat-comfyui",
                "plugin_version": "0.1.0",
                "model": "ComfyUI-See-through",
                "model_version": "test",
            },
            "canvas": {"width": 12, "height": 10},
            "layers": [
                {
                    "id": "layer_000",
                    "name": "hair_back",
                    "label": "hair_back",
                    "order": 10,
                    "psd_leaf_token": "layer_000",
                    "image_path": "layers/layer_000.png",
                    "bbox": [1, 2, 5, 5],
                    "confidence": 1.0,
                    "left_right_split": "center",
                    "front_back_split": "back",
                    "depth_stats": {"min": 0.1, "max": 0.2, "mean": 0.15},
                },
                {
                    "id": "layer_001",
                    "name": "hair_front",
                    "label": "hair_front",
                    "order": 1,
                    "psd_leaf_token": "layer_001",
                    "image_path": "layers/layer_001.png",
                    "bbox": [2, 3, 6, 6],
                    "confidence": 1.0,
                    "left_right_split": "center",
                    "front_back_split": "front",
                    "depth_stats": {"min": 0.7, "max": 0.9, "mean": 0.8},
                },
            ],
        }
        manifest_path = manifest_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        output_dir = output_root / "vivi2d" / "psd" / "job"
        result_path = psd_export.export_psd_from_manifest(
            manifest_path=Path("vivi2d/decompose/job/manifest.json"),
            output_dir=output_dir,
            filename_prefix="assembled",
            output_root=output_root,
        )

        self.assertEqual(result_path, output_dir / "assembled.psd")
        self.assertEqual(result_path.read_bytes(), b"FAKEPSD")
        self.assertEqual(calls["color_mode"], "rgb")
        self.assertEqual(calls["size"], (10, 12))

        exported_layers = calls["layers"]
        self.assertEqual(len(exported_layers), 2)
        self.assertEqual(exported_layers[0].kwargs["name"], "v2d[layer_001] hair_front")
        self.assertEqual(exported_layers[0].kwargs["top"], 3)
        self.assertEqual(exported_layers[0].kwargs["left"], 2)
        self.assertEqual(exported_layers[1].kwargs["name"], "v2d[layer_000] hair_back")
        self.assertEqual(exported_layers[1].kwargs["top"], 2)
        self.assertEqual(exported_layers[1].kwargs["left"], 1)

    def test_load_pytoshop_error_does_not_chain_import_path(self) -> None:
        private_path = str((self._create_temp_dir() / "pytoshop" / "__init__.py").resolve())
        original_import = builtins.__import__

        def blocked_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "pytoshop" or name.startswith("pytoshop."):
                raise ImportError(f"cannot import name 'enums' from 'pytoshop' ({private_path})")
            return original_import(name, globals, locals, fromlist, level)

        self._patch_import(blocked_import)

        with self.assertRaisesRegex(RuntimeError, "requires pytoshop") as ctx:
            psd_export._load_pytoshop()
        self.assertIsNone(ctx.exception.__cause__)
        self.assertNotIn(private_path, str(ctx.exception))

    def test_load_pytoshop_packbits_error_does_not_chain_import_path(self) -> None:
        private_path = str((self._create_temp_dir() / "packbits" / "__init__.py").resolve())
        fake_nested_layers = types.SimpleNamespace()
        fake_enums = types.SimpleNamespace()
        fake_codecs = types.SimpleNamespace()
        fake_pytoshop = types.SimpleNamespace(
            enums=fake_enums,
            codecs=fake_codecs,
            user=types.SimpleNamespace(nested_layers=fake_nested_layers),
        )
        sys.modules["pytoshop"] = fake_pytoshop
        sys.modules["pytoshop.codecs"] = fake_codecs
        sys.modules["pytoshop.user"] = fake_pytoshop.user
        original_import = builtins.__import__

        def blocked_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "packbits":
                raise ImportError(f"No module named 'packbits' ({private_path})")
            return original_import(name, globals, locals, fromlist, level)

        self._patch_import(blocked_import)

        with self.assertRaisesRegex(RuntimeError, "requires the packbits package") as ctx:
            psd_export._load_pytoshop()
        self.assertIsNone(ctx.exception.__cause__)
        self.assertNotIn(private_path, str(ctx.exception))

    def test_export_psd_from_manifest_rejects_manifest_outside_output_root(self) -> None:
        self._install_fake_pytoshop()

        temp_root = self._create_temp_dir()
        outside_dir = self._create_temp_dir()
        manifest_path = outside_dir / "manifest.json"
        manifest_path.write_text(
            json.dumps(
                {
                    "schema_version": "1.0.0",
                    "generator": {
                        "plugin": "vivi2d-compat-comfyui",
                        "plugin_version": "0.1.0",
                        "model": "ComfyUI-See-through",
                        "model_version": "test",
                    },
                    "canvas": {"width": 1, "height": 1},
                    "layers": [],
                }
            ),
            encoding="utf-8",
        )

        with self.assertRaisesRegex(RuntimeError, "Manifest path must stay within") as ctx:
            psd_export.export_psd_from_manifest(
                manifest_path=manifest_path,
                output_dir=temp_root / "output",
                filename_prefix="assembled",
                output_root=temp_root / "output",
            )
        self.assertIsNone(ctx.exception.__cause__)
        self.assertNotIn(str(outside_dir), str(ctx.exception))

    def test_export_psd_from_manifest_rejects_relative_manifest_traversal(self) -> None:
        self._install_fake_pytoshop()

        temp_root = self._create_temp_dir()
        output_root = temp_root / "output"
        outside_dir = temp_root / "outside"
        outside_dir.mkdir(parents=True, exist_ok=True)
        (outside_dir / "manifest.json").write_text("{}", encoding="utf-8")

        with self.assertRaisesRegex(RuntimeError, "Manifest path must stay within") as ctx:
            psd_export.export_psd_from_manifest(
                manifest_path=Path("../outside/manifest.json"),
                output_dir=output_root / "vivi2d" / "psd" / "job",
                filename_prefix="assembled",
                output_root=output_root,
            )
        self.assertIsNone(ctx.exception.__cause__)

    def test_export_psd_from_manifest_rejects_absolute_layer_paths(self) -> None:
        self._install_fake_pytoshop()

        temp_root = self._create_temp_dir()
        output_root = temp_root / "output"
        manifest_dir = output_root / "vivi2d" / "decompose" / "job"
        manifest_dir.mkdir(parents=True, exist_ok=True)

        outside_image = temp_root / "outside.png"
        Image.new("RGBA", (2, 2), (255, 255, 255, 255)).save(outside_image)

        manifest = {
            "schema_version": "1.0.0",
            "generator": {
                "plugin": "vivi2d-compat-comfyui",
                "plugin_version": "0.1.0",
                "model": "ComfyUI-See-through",
                "model_version": "test",
            },
            "canvas": {"width": 2, "height": 2},
            "layers": [
                {
                    "id": "layer_000",
                    "name": "hair_back",
                    "label": "hair_back",
                    "order": 0,
                    "psd_leaf_token": "layer_000",
                    "image_path": str(outside_image.resolve()),
                    "bbox": [0, 0, 2, 2],
                    "confidence": 1.0,
                    "left_right_split": "center",
                    "front_back_split": "back",
                    "depth_stats": {"min": 0.1, "max": 0.2, "mean": 0.15},
                }
            ],
        }
        manifest_path = manifest_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        with self.assertRaisesRegex(RuntimeError, "Layer image path must be relative"):
            psd_export.export_psd_from_manifest(
                manifest_path=Path("vivi2d/decompose/job/manifest.json"),
                output_dir=output_root / "vivi2d" / "psd" / "job",
                filename_prefix="assembled",
                output_root=output_root,
            )

    def test_export_psd_from_manifest_rejects_layer_path_traversal(self) -> None:
        self._install_fake_pytoshop()

        temp_root = self._create_temp_dir()
        output_root = temp_root / "output"
        manifest_dir = output_root / "vivi2d" / "decompose" / "job"
        manifest_dir.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (2, 2), (255, 255, 255, 255)).save(temp_root / "outside.png")

        manifest = {
            "schema_version": "1.0.0",
            "generator": {
                "plugin": "vivi2d-compat-comfyui",
                "plugin_version": "0.1.0",
                "model": "ComfyUI-See-through",
                "model_version": "test",
            },
            "canvas": {"width": 2, "height": 2},
            "layers": [
                {
                    "id": "layer_000",
                    "name": "hair_back",
                    "label": "hair_back",
                    "order": 0,
                    "psd_leaf_token": "layer_000",
                    "image_path": "../../../../outside.png",
                    "bbox": [0, 0, 2, 2],
                    "confidence": 1.0,
                    "left_right_split": "center",
                    "front_back_split": "back",
                    "depth_stats": {"min": 0.1, "max": 0.2, "mean": 0.15},
                }
            ],
        }
        manifest_path = manifest_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        with self.assertRaisesRegex(RuntimeError, "Layer image path escapes") as ctx:
            psd_export.export_psd_from_manifest(
                manifest_path=Path("vivi2d/decompose/job/manifest.json"),
                output_dir=output_root / "vivi2d" / "psd" / "job",
                filename_prefix="assembled",
                output_root=output_root,
            )
        self.assertIsNone(ctx.exception.__cause__)
        self.assertNotIn(str(temp_root), str(ctx.exception))

    def test_export_psd_from_manifest_rejects_symlink_layer_escape(self) -> None:
        self._install_fake_pytoshop()

        temp_root = self._create_temp_dir()
        output_root = temp_root / "output"
        manifest_dir = output_root / "vivi2d" / "decompose" / "job"
        layers_dir = manifest_dir / "layers"
        layers_dir.mkdir(parents=True, exist_ok=True)
        outside_image = temp_root / "outside.png"
        Image.new("RGBA", (2, 2), (255, 255, 255, 255)).save(outside_image)
        symlink_path = layers_dir / "linked.png"
        try:
            os.symlink(outside_image, symlink_path)
        except (OSError, NotImplementedError) as exc:
            self.skipTest(f"Symlink creation is unavailable: {exc}")

        manifest = {
            "schema_version": "1.0.0",
            "generator": {
                "plugin": "vivi2d-compat-comfyui",
                "plugin_version": "0.1.0",
                "model": "ComfyUI-See-through",
                "model_version": "test",
            },
            "canvas": {"width": 2, "height": 2},
            "layers": [
                {
                    "id": "layer_000",
                    "name": "hair_back",
                    "label": "hair_back",
                    "order": 0,
                    "psd_leaf_token": "layer_000",
                    "image_path": "layers/linked.png",
                    "bbox": [0, 0, 2, 2],
                    "confidence": 1.0,
                    "left_right_split": "center",
                    "front_back_split": "back",
                    "depth_stats": {"min": 0.1, "max": 0.2, "mean": 0.15},
                }
            ],
        }
        manifest_path = manifest_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        with self.assertRaisesRegex(RuntimeError, "Layer image path escapes"):
            psd_export.export_psd_from_manifest(
                manifest_path=Path("vivi2d/decompose/job/manifest.json"),
                output_dir=output_root / "vivi2d" / "psd" / "job",
                filename_prefix="assembled",
                output_root=output_root,
            )

    def test_export_psd_from_manifest_sanitizes_filename_prefix(self) -> None:
        self._install_fake_pytoshop()

        temp_root = self._create_temp_dir()
        output_root = temp_root / "output"
        manifest_dir = output_root / "vivi2d" / "decompose" / "job"
        manifest_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "schema_version": "1.0.0",
            "generator": {
                "plugin": "vivi2d-compat-comfyui",
                "plugin_version": "0.1.0",
                "model": "ComfyUI-See-through",
                "model_version": "test",
            },
            "canvas": {"width": 1, "height": 1},
            "layers": [],
        }
        manifest_path = manifest_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        output_dir = output_root / "vivi2d" / "psd" / "job"

        result_path = psd_export.export_psd_from_manifest(
            manifest_path=Path("vivi2d/decompose/job/manifest.json"),
            output_dir=output_dir,
            filename_prefix="../private/escape",
            output_root=output_root,
        )

        self.assertEqual(result_path.parent, output_dir.resolve())
        self.assertEqual(result_path.name, "private_escape.psd")
        self.assertFalse((output_root / "vivi2d" / "psd" / "private").exists())

    def test_export_psd_from_manifest_rejects_canvas_over_pixel_limit(self) -> None:
        self._install_fake_pytoshop()
        psd_export.MAX_CANVAS_PIXELS = 1

        temp_root = self._create_temp_dir()
        output_root = temp_root / "output"
        manifest_dir = output_root / "vivi2d" / "decompose" / "job"
        manifest_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "schema_version": "1.0.0",
            "generator": {
                "plugin": "vivi2d-compat-comfyui",
                "plugin_version": "0.1.0",
                "model": "ComfyUI-See-through",
                "model_version": "test",
            },
            "canvas": {"width": 2, "height": 2},
            "layers": [],
        }
        manifest_path = manifest_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        with self.assertRaisesRegex(RuntimeError, "Manifest canvas exceeds"):
            psd_export.export_psd_from_manifest(
                manifest_path=Path("vivi2d/decompose/job/manifest.json"),
                output_dir=output_root / "vivi2d" / "psd" / "job",
                filename_prefix="assembled",
                output_root=output_root,
            )

    def test_export_psd_from_manifest_rejects_layer_image_over_pixel_limit(self) -> None:
        self._install_fake_pytoshop()
        psd_export.MAX_LAYER_PIXELS = 1

        temp_root = self._create_temp_dir()
        output_root = temp_root / "output"
        manifest_dir = output_root / "vivi2d" / "decompose" / "job"
        layers_dir = manifest_dir / "layers"
        layers_dir.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (2, 2), (255, 255, 255, 255)).save(layers_dir / "layer_000.png")
        manifest = {
            "schema_version": "1.0.0",
            "generator": {
                "plugin": "vivi2d-compat-comfyui",
                "plugin_version": "0.1.0",
                "model": "ComfyUI-See-through",
                "model_version": "test",
            },
            "canvas": {"width": 2, "height": 2},
            "layers": [
                {
                    "id": "layer_000",
                    "name": "hair_back",
                    "label": "hair_back",
                    "order": 0,
                    "psd_leaf_token": "layer_000",
                    "image_path": "layers/layer_000.png",
                    "bbox": [0, 0, 2, 2],
                    "confidence": 1.0,
                    "left_right_split": "center",
                    "front_back_split": "back",
                    "depth_stats": {"min": 0.1, "max": 0.2, "mean": 0.15},
                }
            ],
        }
        manifest_path = manifest_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        with self.assertRaisesRegex(RuntimeError, "Layer image exceeds"):
            psd_export.export_psd_from_manifest(
                manifest_path=Path("vivi2d/decompose/job/manifest.json"),
                output_dir=output_root / "vivi2d" / "psd" / "job",
                filename_prefix="assembled",
                output_root=output_root,
            )

    def test_export_psd_from_manifest_rejects_total_layer_pixels_over_budget(self) -> None:
        self._install_fake_pytoshop()
        psd_export.MAX_LAYER_PIXELS = 16
        psd_export.MAX_TOTAL_LAYER_PIXELS = 4

        temp_root = self._create_temp_dir()
        output_root = temp_root / "output"
        manifest_dir = output_root / "vivi2d" / "decompose" / "job"
        layers_dir = manifest_dir / "layers"
        layers_dir.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (2, 2), (255, 0, 0, 255)).save(layers_dir / "layer_000.png")
        Image.new("RGBA", (2, 2), (0, 0, 255, 255)).save(layers_dir / "layer_001.png")
        manifest = {
            "schema_version": "1.0.0",
            "generator": {
                "plugin": "vivi2d-compat-comfyui",
                "plugin_version": "0.1.0",
                "model": "ComfyUI-See-through",
                "model_version": "test",
            },
            "canvas": {"width": 2, "height": 2},
            "layers": [
                {
                    "id": "layer_000",
                    "name": "hair_back",
                    "label": "hair_back",
                    "order": 0,
                    "psd_leaf_token": "layer_000",
                    "image_path": "layers/layer_000.png",
                    "bbox": [0, 0, 2, 2],
                    "confidence": 1.0,
                    "left_right_split": "center",
                    "front_back_split": "back",
                    "depth_stats": {"min": 0.1, "max": 0.2, "mean": 0.15},
                },
                {
                    "id": "layer_001",
                    "name": "hair_front",
                    "label": "hair_front",
                    "order": 1,
                    "psd_leaf_token": "layer_001",
                    "image_path": "layers/layer_001.png",
                    "bbox": [0, 0, 2, 2],
                    "confidence": 1.0,
                    "left_right_split": "center",
                    "front_back_split": "front",
                    "depth_stats": {"min": 0.7, "max": 0.9, "mean": 0.8},
                },
            ],
        }
        manifest_path = manifest_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        with self.assertRaisesRegex(RuntimeError, "maximum total pixel count"):
            psd_export.export_psd_from_manifest(
                manifest_path=Path("vivi2d/decompose/job/manifest.json"),
                output_dir=output_root / "vivi2d" / "psd" / "job",
                filename_prefix="assembled",
                output_root=output_root,
            )

    def test_export_psd_rejects_total_layer_pixels_before_rgba_conversion(self) -> None:
        self._install_fake_pytoshop()
        psd_export.MAX_LAYER_PIXELS = 16
        psd_export.MAX_TOTAL_LAYER_PIXELS = 4

        temp_root = self._create_temp_dir()
        output_root = temp_root / "output"
        manifest_dir = output_root / "vivi2d" / "decompose" / "job"
        layers_dir = manifest_dir / "layers"
        layers_dir.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (2, 2), (255, 0, 0, 255)).save(layers_dir / "layer_000.png")
        Image.new("RGBA", (2, 2), (0, 0, 255, 255)).save(layers_dir / "layer_001.png")
        manifest = {
            "schema_version": "1.0.0",
            "generator": {
                "plugin": "vivi2d-compat-comfyui",
                "plugin_version": "0.1.0",
                "model": "ComfyUI-See-through",
                "model_version": "test",
            },
            "canvas": {"width": 2, "height": 2},
            "layers": [
                {
                    "id": "layer_000",
                    "name": "hair_back",
                    "label": "hair_back",
                    "order": 0,
                    "psd_leaf_token": "layer_000",
                    "image_path": "layers/layer_000.png",
                    "bbox": [0, 0, 2, 2],
                    "confidence": 1.0,
                    "left_right_split": "center",
                    "front_back_split": "back",
                    "depth_stats": {"min": 0.1, "max": 0.2, "mean": 0.15},
                },
                {
                    "id": "layer_001",
                    "name": "hair_front",
                    "label": "hair_front",
                    "order": 1,
                    "psd_leaf_token": "layer_001",
                    "image_path": "layers/layer_001.png",
                    "bbox": [0, 0, 2, 2],
                    "confidence": 1.0,
                    "left_right_split": "center",
                    "front_back_split": "front",
                    "depth_stats": {"min": 0.7, "max": 0.9, "mean": 0.8},
                },
            ],
        }
        manifest_path = manifest_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        def fail_if_second_layer_converts(layer_path, *, expected_width, expected_height):
            if layer_path.name == "layer_001.png":
                raise AssertionError("overflow layer should not be converted to RGBA")
            return self._normalize_rgba_image(
                layer_path,
                expected_width=expected_width,
                expected_height=expected_height,
            )

        psd_export._normalize_rgba_image = fail_if_second_layer_converts

        with self.assertRaisesRegex(RuntimeError, "maximum total pixel count"):
            psd_export.export_psd_from_manifest(
                manifest_path=Path("vivi2d/decompose/job/manifest.json"),
                output_dir=output_root / "vivi2d" / "psd" / "job",
                filename_prefix="assembled",
                output_root=output_root,
            )


if __name__ == "__main__":
    unittest.main()
