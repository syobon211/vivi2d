from __future__ import annotations

import json
import shutil
import sys
import traceback
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TEST_TEMP_ROOT = ROOT / ".tmp-tests"
TEST_TEMP_ROOT.mkdir(parents=True, exist_ok=True)

from vivi2d_compat import manifest as vivi_manifest
from vivi2d_compat import backend


def _minimal_manifest() -> dict[str, object]:
    return {
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


def _minimal_layer(index: int = 0) -> dict[str, object]:
    return {
        "id": f"layer_{index}",
        "name": f"Layer {index}",
        "label": "hair_front",
        "order": index,
        "psd_leaf_token": f"layer_{index}",
        "image_path": f"layers/layer_{index}.png",
        "bbox": [0, 0, 1, 1],
        "confidence": 1.0,
        "left_right_split": "center",
        "front_back_split": "front",
        "depth_stats": {"min": 0.1, "mean": 0.2, "max": 0.3},
    }


def _manifest_with_layers(layer_count: int = 1) -> dict[str, object]:
    manifest = _minimal_manifest()
    manifest["layers"] = [_minimal_layer(index) for index in range(layer_count)]
    return manifest


class ManifestValidationTests(unittest.TestCase):
    def _create_temp_dir(self) -> Path:
        path = TEST_TEMP_ROOT / f"manifest_{uuid.uuid4().hex}"
        path.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(path, ignore_errors=True))
        return path

    def test_schema_error_traceback_omits_manifest_values(self) -> None:
        temp_dir = self._create_temp_dir()
        marker = "synthetic-private-manifest-value"
        manifest = _minimal_manifest()
        manifest["unexpected"] = marker
        manifest_path = temp_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        try:
            vivi_manifest.read_manifest(manifest_path)
        except RuntimeError as error:
            rendered = "".join(traceback.format_exception(type(error), error, error.__traceback__))
            self.assertNotIn(marker, rendered)
            self.assertNotIn("ValidationError", rendered)
            self.assertIsNone(error.__cause__)
        else:
            self.fail("Invalid manifest was accepted")

    def test_read_manifest_rejects_unknown_top_level_fields(self) -> None:
        temp_dir = self._create_temp_dir()
        manifest = _minimal_manifest()
        manifest["unexpected"] = "private path C:/Users/example/secret.png"
        manifest_path = temp_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        with self.assertRaisesRegex(RuntimeError, "expected schema"):
            vivi_manifest.read_manifest(manifest_path)

    def test_read_manifest_rejects_oversized_manifest_before_schema(self) -> None:
        temp_dir = self._create_temp_dir()
        manifest_path = temp_dir / "manifest.json"
        manifest_path.write_text(
            " " * (vivi_manifest.MAX_MANIFEST_BYTES + 1),
            encoding="utf-8",
        )

        with self.assertRaisesRegex(RuntimeError, "maximum supported size"):
            vivi_manifest.read_manifest(manifest_path)

    def test_read_manifest_rejects_malformed_payload_without_echoing_contents(self) -> None:
        temp_dir = self._create_temp_dir()
        manifest_path = temp_dir / "manifest.json"
        manifest_path.write_text(
            '{"prompt":"private client prompt","layers":',
            encoding="utf-8",
        )

        try:
            vivi_manifest.read_manifest(manifest_path)
        except RuntimeError as exc:
            self.assertNotIn("private client prompt", str(exc))
            self.assertIn("not valid JSON", str(exc))
        else:
            self.fail("Expected malformed manifest to be rejected")

    def test_rejects_more_layers_than_fit_the_provider_artifact_budget(self) -> None:
        manifest = _minimal_manifest()
        manifest["layers"] = [
            _minimal_layer(index)
            for index in range(vivi_manifest.MAX_MANIFEST_LAYERS + 1)
        ]

        with self.assertRaisesRegex(RuntimeError, "too many layers"):
            vivi_manifest._validate_manifest(manifest)

    def test_rejects_non_finite_and_inconsistent_depth_statistics(self) -> None:
        manifest = _minimal_manifest()
        layer = _minimal_layer()
        manifest["layers"] = [layer]
        layer["depth_stats"] = {"min": 0.1, "mean": float("inf"), "max": 1.0}
        with self.assertRaisesRegex(RuntimeError, "must be finite"):
            vivi_manifest._validate_manifest(manifest)

        layer["depth_stats"] = {"min": 0.5, "mean": 0.4, "max": 0.6}
        with self.assertRaisesRegex(RuntimeError, "inconsistent"):
            vivi_manifest._validate_manifest(manifest)

        layer["depth_stats"] = {"min": 0, "mean": 1, "max": 10**400}
        with self.assertRaisesRegex(RuntimeError, "must be finite"):
            vivi_manifest._validate_manifest(manifest)

    def test_rejects_unsupported_generator_and_bounded_string_violations(self) -> None:
        manifest = _manifest_with_layers()
        manifest["generator"]["plugin_version"] = "0.2.0"
        with self.assertRaisesRegex(RuntimeError, "generator version is unsupported"):
            vivi_manifest._validate_manifest(manifest)

        string_cases = (
            ("generator.model", "model", "\u00e9" * 129, "maximum supported length"),
            ("generator.model_version", "model_version", "\ufeff", "is invalid"),
            ("generator.model", "model", "\ud800", "invalid UTF-8"),
            ("layers[0].id", "id", "\u00e9" * 129, "maximum supported length"),
            ("layers[0].name", "name", "n" * 1025, "maximum supported length"),
            ("layers[0].label", "label", "bad\0label", "is invalid"),
            (
                "layers[0].psd_leaf_token",
                "psd_leaf_token",
                "t" * 257,
                "maximum supported length",
            ),
            (
                "layers[0].image_path",
                "image_path",
                "p" * 4097,
                "maximum supported length",
            ),
        )
        for label, field, value, message in string_cases:
            with self.subTest(label=label):
                manifest = _manifest_with_layers()
                if label.startswith("generator"):
                    manifest["generator"][field] = value
                else:
                    manifest["layers"][0][field] = value
                with self.assertRaisesRegex(RuntimeError, message):
                    vivi_manifest._validate_manifest(manifest)

    def test_rejects_duplicate_layer_ids_and_leaf_tokens(self) -> None:
        manifest = _manifest_with_layers(2)
        manifest["layers"][1]["id"] = manifest["layers"][0]["id"]
        with self.assertRaisesRegex(RuntimeError, "duplicate layer id"):
            vivi_manifest._validate_manifest(manifest)

        manifest = _manifest_with_layers(2)
        manifest["layers"][1]["psd_leaf_token"] = manifest["layers"][0][
            "psd_leaf_token"
        ]
        with self.assertRaisesRegex(RuntimeError, "duplicate PSD leaf token"):
            vivi_manifest._validate_manifest(manifest)

    def test_rejects_unsafe_layer_integers_and_paths(self) -> None:
        manifest = _manifest_with_layers()
        manifest["layers"][0]["order"] = 1.0
        vivi_manifest._validate_manifest(manifest)

        manifest["layers"][0]["order"] = vivi_manifest.MAX_SAFE_INTEGER + 1
        with self.assertRaisesRegex(RuntimeError, "order must be a safe integer"):
            vivi_manifest._validate_manifest(manifest)

        manifest = _manifest_with_layers()
        manifest["layers"][0]["bbox"] = [0, 0, vivi_manifest.MAX_SAFE_INTEGER + 1, 1]
        with self.assertRaisesRegex(RuntimeError, "bbox must contain safe integers"):
            vivi_manifest._validate_manifest(manifest)

        invalid_paths = (
            "/absolute.png",
            "C:/absolute.png",
            "https://example.invalid/layer.png",
            "../outside.png",
            "layers/../outside.png",
            "./layer.png",
            "output/other-job/secret.png",
            "temp\\other-job\\secret.png",
            "\ufeff../outside.png",
        )
        for image_path in invalid_paths:
            with self.subTest(image_path=image_path):
                manifest = _manifest_with_layers()
                manifest["layers"][0]["image_path"] = image_path
                with self.assertRaises(RuntimeError):
                    vivi_manifest._validate_manifest(manifest)

        manifest = _manifest_with_layers()
        manifest["layers"][0]["image_path"] = "layers/nested/layer.png"
        vivi_manifest._validate_manifest(manifest)

    def test_rejects_canvas_bbox_and_aggregate_area_violations(self) -> None:
        manifest = _minimal_manifest()
        manifest["canvas"] = {"width": 8193, "height": 1}
        with self.assertRaisesRegex(RuntimeError, "maximum supported side"):
            vivi_manifest._validate_manifest(manifest)

        manifest["canvas"] = {"width": 4097, "height": 4096}
        with self.assertRaisesRegex(RuntimeError, "maximum supported area"):
            vivi_manifest._validate_manifest(manifest)

        manifest = _manifest_with_layers()
        manifest["layers"][0]["bbox"] = [0, 0, 0, 1]
        with self.assertRaisesRegex(RuntimeError, "bbox is outside the canvas"):
            vivi_manifest._validate_manifest(manifest)

        manifest = _manifest_with_layers()
        manifest["layers"][0]["bbox"] = [0, 0, 2, 1]
        with self.assertRaisesRegex(RuntimeError, "bbox is outside the canvas"):
            vivi_manifest._validate_manifest(manifest)

        manifest = _minimal_manifest()
        manifest["canvas"] = {"width": 4096, "height": 4096}
        layers = [_minimal_layer(index) for index in range(4)]
        for layer in layers:
            layer["bbox"] = [0, 0, 4096, 4096]
        manifest["layers"] = layers
        vivi_manifest._validate_manifest(manifest)

        extra_layer = _minimal_layer(4)
        extra_layer["bbox"] = [0, 0, 1, 1]
        manifest["layers"].append(extra_layer)
        with self.assertRaisesRegex(RuntimeError, "maximum total area"):
            vivi_manifest._validate_manifest(manifest)

    def test_rejects_non_finite_confidence(self) -> None:
        manifest = _manifest_with_layers()
        manifest["layers"][0]["confidence"] = float("nan")
        with self.assertRaisesRegex(RuntimeError, "confidence must be finite"):
            vivi_manifest._validate_manifest(manifest)

    def test_read_manifest_rejects_overflowing_json_numbers(self) -> None:
        temp_dir = self._create_temp_dir()
        manifest = _minimal_manifest()
        manifest["layers"] = [_minimal_layer()]
        source = json.dumps(manifest).replace('"mean": 0.2', '"mean": 1e400')
        manifest_path = temp_dir / "manifest.json"
        manifest_path.write_text(source, encoding="utf-8")

        with self.assertRaisesRegex(RuntimeError, "not valid JSON"):
            vivi_manifest.read_manifest(manifest_path)

    def test_read_manifest_rejects_invalid_utf8(self) -> None:
        temp_dir = self._create_temp_dir()
        manifest_path = temp_dir / "manifest.json"
        manifest_path.write_bytes(b'{"model":"\xff"}')

        with self.assertRaisesRegex(RuntimeError, "not valid UTF-8"):
            vivi_manifest.read_manifest(manifest_path)

    def test_build_manifest_applies_shared_semantic_validation(self) -> None:
        result = backend.DecomposeResult(
            preview=object(),
            model="m" * (vivi_manifest.MAX_IDENTIFIER_UTF8_BYTES + 1),
            model_version="test",
            layers=[],
        )
        with self.assertRaisesRegex(RuntimeError, "maximum supported length"):
            vivi_manifest.build_manifest(
                result=result,
                canvas_width=1,
                canvas_height=1,
                layer_image_paths=[],
            )

    def test_write_manifest_rejects_non_finite_and_oversized_output_before_write(self) -> None:
        temp_dir = self._create_temp_dir()
        manifest_path = temp_dir / "manifest.json"
        manifest = _minimal_manifest()
        layer = _minimal_layer()
        manifest["layers"] = [layer]
        layer["depth_stats"] = {"min": 0.1, "mean": float("nan"), "max": 1.0}

        with self.assertRaisesRegex(RuntimeError, "finite JSON"):
            vivi_manifest.write_manifest(manifest_path, manifest)
        self.assertFalse(manifest_path.exists())

        original_limit = vivi_manifest.MAX_MANIFEST_BYTES
        self.addCleanup(
            lambda: setattr(vivi_manifest, "MAX_MANIFEST_BYTES", original_limit)
        )
        vivi_manifest.MAX_MANIFEST_BYTES = 32
        with self.assertRaisesRegex(RuntimeError, "maximum supported size"):
            vivi_manifest.write_manifest(manifest_path, _minimal_manifest())
        self.assertFalse(manifest_path.exists())

    def test_write_manifest_preserves_existing_file_on_semantic_failure(self) -> None:
        temp_dir = self._create_temp_dir()
        manifest_path = temp_dir / "manifest.json"
        manifest_path.write_bytes(b"known-good")
        manifest = _minimal_manifest()
        manifest["generator"]["plugin_version"] = "0.2.0"

        with self.assertRaisesRegex(RuntimeError, "generator version is unsupported"):
            vivi_manifest.write_manifest(manifest_path, manifest)

        self.assertEqual(manifest_path.read_bytes(), b"known-good")
        self.assertEqual(list(temp_dir.glob(".manifest.json.*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
