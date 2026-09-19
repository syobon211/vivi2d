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


class ManifestMalformedRootTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_root = TEST_TEMP_ROOT / f"manifest_fuzz_{uuid.uuid4().hex}"
        self.temp_root.mkdir(parents=True, exist_ok=False)

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_root, ignore_errors=True)

    def _write_manifest(self, value):
        path = self.temp_root / "manifest.json"
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def test_malformed_json_roots_fail_closed_without_echoing_values(self) -> None:
        # The former random generator never produced the required manifest keys.
        # Exercise its actual root-shape boundary directly, not as semantic fuzzing.
        values = [
            None,
            False,
            0,
            1.5,
            "__proto__",
            "C:/Users/Alice/private-token",
            [],
            ["private-token"],
            {},
            {"k0": "private-token"},
        ]
        for index, value in enumerate(values):
            with self.subTest(index=index):
                path = self._write_manifest(value)
                with self.assertRaises(RuntimeError) as raised:
                    manifest.read_manifest(path)
                message = str(raised.exception)
                self.assertEqual(
                    message,
                    "Vivi2D manifest does not match the expected schema."
                    if isinstance(value, dict)
                    else "Vivi2D manifest must be a JSON object.",
                )
                self.assertNotIn("private-token", message)
                self.assertNotIn("Alice", message)
                self.assertNotIn("__proto__", message)
                self.assertNotIn("Traceback", message)


if __name__ == "__main__":
    unittest.main()
