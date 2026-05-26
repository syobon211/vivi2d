from __future__ import annotations

import json
import shutil
import sys
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TEST_TEMP_ROOT = ROOT / ".tmp-tests"
TEST_TEMP_ROOT.mkdir(parents=True, exist_ok=True)

from vivi2d_compat import manifest as vivi_manifest


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


class ManifestValidationTests(unittest.TestCase):
    def _create_temp_dir(self) -> Path:
        path = TEST_TEMP_ROOT / f"manifest_{uuid.uuid4().hex}"
        path.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(path, ignore_errors=True))
        return path

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


if __name__ == "__main__":
    unittest.main()
