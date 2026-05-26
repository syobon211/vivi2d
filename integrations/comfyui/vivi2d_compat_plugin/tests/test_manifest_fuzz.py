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

from vivi2d_compat import manifest


def _rng(seed: int):
    state = seed & 0xFFFFFFFF
    while True:
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        yield state


def _random_value(seed: int):
    next_value = _rng(seed)

    def build(depth: int):
        value = next(next_value)
        choice = value % (6 if depth <= 0 else 9)
        if choice == 0:
            return None
        if choice == 1:
            return bool(value & 1)
        if choice == 2:
            return value / 17.0
        if choice == 3:
            return f"s-{value:x}"
        if choice == 4:
            return "__proto__"
        if choice == 5:
            return "C:/Users/Alice/private-token"
        if choice == 6:
            return [build(depth - 1) for _ in range(value % 4)]
        return {f"k{index}": build(depth - 1) for index in range(value % 4)}

    return build(3)


class ManifestFuzzTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_root = TEST_TEMP_ROOT / f"manifest_fuzz_{uuid.uuid4().hex}"
        self.temp_root.mkdir(parents=True, exist_ok=False)

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_root, ignore_errors=True)

    def _write_manifest(self, value):
        path = self.temp_root / "manifest.json"
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def test_random_json_values_fail_closed_or_parse_as_manifest_objects(self) -> None:
        for seed in range(1, 129):
            path = self._write_manifest(_random_value(seed))
            try:
                loaded = manifest.read_manifest(path)
                self.assertIsInstance(loaded, dict)
                self.assertEqual(loaded["schema_version"], "1.0.0")
                self.assertIsInstance(loaded["layers"], list)
            except RuntimeError as exc:
                self.assertNotIn("private-token", str(exc))
                self.assertNotIn("Alice", str(exc))

    def test_unknown_top_level_fields_are_rejected(self) -> None:
        valid = {
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
        path = self._write_manifest({**valid, "absolute_path": "C:/Users/Alice/private"})

        with self.assertRaisesRegex(RuntimeError, "expected schema") as ctx:
            manifest.read_manifest(path)
        self.assertNotIn("Alice", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
