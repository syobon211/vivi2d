from __future__ import annotations

import os
import shutil
import sys
import textwrap
import types
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TEST_TEMP_ROOT = ROOT / ".tmp-tests"
TEST_TEMP_ROOT.mkdir(parents=True, exist_ok=True)

from vivi2d_compat import backend


class BackendShimTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env = {
            "VIVI2D_SEETHROUGH_UPSTREAM_PATH": os.environ.get(
                "VIVI2D_SEETHROUGH_UPSTREAM_PATH"
            ),
            "VIVI2D_SEETHROUGH_BACKEND": os.environ.get("VIVI2D_SEETHROUGH_BACKEND"),
        }
        self._clear_backend_caches()

    def tearDown(self) -> None:
        for key, value in self._env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self._clear_backend_caches()

    def _clear_backend_caches(self) -> None:
        backend._load_upstream_module.cache_clear()
        backend._load_layer_model.cache_clear()
        backend._load_depth_model.cache_clear()
        backend.load_backend.cache_clear()

    def _create_temp_dir(self) -> Path:
        path = TEST_TEMP_ROOT / f"backend_{uuid.uuid4().hex}"
        path.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(path, ignore_errors=True))
        return path

    def test_load_backend_uses_stub_when_forced(self) -> None:
        os.environ["VIVI2D_SEETHROUGH_BACKEND"] = "stub"
        loaded = backend.load_backend()
        self.assertIsInstance(loaded, backend.UnconfiguredSeeThroughBackend)

    def test_shim_backend_decomposes_fake_upstream_payload(self) -> None:
        temp_dir = self._create_temp_dir()
        upstream_path = temp_dir / "nodes.py"
        upstream_path.write_text(
            textwrap.dedent(
                """
                    import numpy

                    __version__ = "test-upstream"
                    DEFAULT_LAYERDIFF_REPO = "layerdiff/test"
                    DEFAULT_LAYERDIFF_NF4_REPO = "layerdiff/test-nf4"
                    DEFAULT_DEPTH_REPO = "depth/test"
                    DEFAULT_DEPTH_NF4_REPO = "depth/test-nf4"

                    class SeeThrough_LoadLayerDiffModel:
                        def load_model(self, model=None, quant_mode="none", group_offload=False):
                            return ({"kind": "layer", "model": model, "quant_mode": quant_mode, "group_offload": group_offload},)

                    class SeeThrough_LoadDepthModel:
                        def load_model(self, model=None, quant_mode="none", cache_tag_embeds=True, group_offload=False):
                            return ({"kind": "depth", "model": model, "quant_mode": quant_mode, "group_offload": group_offload},)

                    class SeeThrough_GenerateLayers:
                        def generate(self, image=None, layerdiff_model=None, model=None, seed=0, resolution=0, num_inference_steps=0):
                            return ({
                                "preview": numpy.zeros((8, 8, 4), dtype=numpy.uint8),
                                "layer_model": layerdiff_model or model,
                                "seed": seed,
                                "resolution": resolution,
                                "steps": num_inference_steps,
                            },)

                    class SeeThrough_GenerateDepth:
                        def generate(self, layers=None, layers_data=None, depth_model=None, model=None, seed=0, resolution_depth=-1):
                            payload = layers or layers_data
                            payload["depth_model"] = depth_model or model
                            payload["depth_seed"] = seed
                            payload["depth_resolution"] = resolution_depth
                            return (payload,)

                    class SeeThrough_PostProcess:
                        def postprocess(self, layers=None, layers_data=None, tblr_split=True, use_lama=True, resolution=0):
                            payload = layers or layers_data
                            rgba_front = numpy.zeros((3, 4, 4), dtype=numpy.uint8)
                            rgba_front[:, :, 0] = 255
                            rgba_front[:, :, 3] = 255
                            rgba_back = numpy.zeros((3, 4, 4), dtype=numpy.uint8)
                            rgba_back[:, :, 2] = 255
                            rgba_back[:, :, 3] = 255
                            depth_front = numpy.full((3, 4), 0.8, dtype=numpy.float32)
                            depth_back = numpy.full((3, 4), 0.2, dtype=numpy.float32)
                            parts = {
                                "frame_size": (12, 12),
                                "tag2pinfo": {
                                    "hair_front": {
                                        "img": rgba_front,
                                        "xyxy": [2, 3, 6, 6],
                                        "depth": depth_front,
                                        "depth_median": 0.8,
                                    },
                                    "hair_back": {
                                        "img": rgba_back,
                                        "xyxy": [1, 1, 5, 4],
                                        "depth": depth_back,
                                        "depth_median": 0.2,
                                    },
                                },
                            }
                            preview = numpy.zeros((12, 12, 4), dtype=numpy.uint8)
                            preview[:, :, 3] = 255
                            return (parts, preview)
                """
            ),
            encoding="utf-8",
        )

        os.environ["VIVI2D_SEETHROUGH_UPSTREAM_PATH"] = str(upstream_path)

        loaded = backend.load_backend()
        self.assertIsInstance(loaded, backend.SeeThroughComfyShimBackend)

        result = loaded.decompose(
            image=object(),
            seed=42,
            resolution=1280,
            num_inference_steps=30,
            tblr_split=True,
            use_lama=True,
            quant_mode="none",
            group_offload=False,
            output_dir=temp_dir,
        )

        self.assertEqual(result.model, "ComfyUI-See-through")
        self.assertEqual(result.model_version, "test-upstream")
        self.assertEqual(len(result.layers), 2)

        first_layer = result.layers[0]
        second_layer = result.layers[1]

        self.assertEqual(first_layer.label, "hair_front")
        self.assertEqual(first_layer.order, 0)
        self.assertEqual(first_layer.bbox, (2, 3, 6, 6))
        self.assertEqual(first_layer.front_back_split, "front")
        self.assertAlmostEqual(first_layer.depth_stats.mean, 0.8)

        self.assertEqual(second_layer.label, "hair_back")
        self.assertEqual(second_layer.order, 1)
        self.assertEqual(second_layer.bbox, (1, 1, 5, 4))
        self.assertEqual(second_layer.front_back_split, "back")
        self.assertAlmostEqual(second_layer.depth_stats.mean, 0.2)

    def test_load_upstream_module_prefers_loaded_upstream_module(self) -> None:
        fake_module_name = "custom_nodes.vivi2d_test_upstream"
        fake_module = types.ModuleType(fake_module_name)
        fake_module.__file__ = (
            "/opt/ComfyUI/custom_nodes/ComfyUI-See-through/nodes.py"
        )

        class SeeThrough_LoadLayerDiffModel:
            pass

        class SeeThrough_LoadDepthModel:
            pass

        class SeeThrough_GenerateLayers:
            pass

        class SeeThrough_GenerateDepth:
            pass

        class SeeThrough_PostProcess:
            pass

        fake_module.SeeThrough_LoadLayerDiffModel = SeeThrough_LoadLayerDiffModel
        fake_module.SeeThrough_LoadDepthModel = SeeThrough_LoadDepthModel
        fake_module.SeeThrough_GenerateLayers = SeeThrough_GenerateLayers
        fake_module.SeeThrough_GenerateDepth = SeeThrough_GenerateDepth
        fake_module.SeeThrough_PostProcess = SeeThrough_PostProcess

        previous = sys.modules.get(fake_module_name)
        sys.modules[fake_module_name] = fake_module
        self.addCleanup(
            lambda: sys.modules.__setitem__(fake_module_name, previous)
            if previous is not None
            else sys.modules.pop(fake_module_name, None)
        )

        loaded = backend._load_upstream_module()
        self.assertIs(loaded, fake_module)

    def test_missing_upstream_error_does_not_include_absolute_paths(self) -> None:
        os.environ["VIVI2D_SEETHROUGH_UPSTREAM_PATH"] = str(
            self._create_temp_dir() / "private" / "nodes.py"
        )

        with self.assertRaisesRegex(RuntimeError, "Could not locate"):
            try:
                backend._load_upstream_module()
            except RuntimeError as exc:
                self.assertNotIn("private", str(exc))
                self.assertNotIn(str(TEST_TEMP_ROOT), str(exc))
                raise

    def test_failed_module_load_error_does_not_include_absolute_paths(self) -> None:
        temp_dir = self._create_temp_dir()
        upstream_path = temp_dir / "nodes.py"
        upstream_path.write_text("raise RuntimeError('private local detail')\n", encoding="utf-8")
        os.environ["VIVI2D_SEETHROUGH_UPSTREAM_PATH"] = str(upstream_path)

        with self.assertRaisesRegex(RuntimeError, "Failed to load"):
            try:
                backend._load_upstream_module()
            except RuntimeError as exc:
                self.assertNotIn("private local detail", str(exc))
                self.assertNotIn(str(upstream_path), str(exc))
                raise


if __name__ == "__main__":
    unittest.main()
