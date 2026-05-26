import unittest

import numpy

from vivi2d_compat import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from vivi2d_compat import backend
from vivi2d_compat import nodes
from vivi2d_compat.nodes import ViviSeeThroughDecompose, ViviSeeThroughExportPSD


class _CpuBomb:
    shape = (3, 3, 4)

    def cpu(self):
        raise AssertionError("cpu() should not be called before bounds validation")


class _ArrayBomb:
    def __init__(self, shape):
        self.shape = shape

    def __array__(self, dtype=None):
        raise AssertionError("array materialization should not happen after budget rejection")


class NodesContractTests(unittest.TestCase):
    def setUp(self):
        self._load_backend = nodes.load_backend
        self._limits = {
            "MAX_IMAGE_SIDE": nodes.MAX_IMAGE_SIDE,
            "MAX_INPUT_PIXELS": nodes.MAX_INPUT_PIXELS,
            "MAX_PREVIEW_PIXELS": nodes.MAX_PREVIEW_PIXELS,
            "MAX_LAYER_PIXELS": nodes.MAX_LAYER_PIXELS,
            "MAX_TOTAL_LAYER_PIXELS": nodes.MAX_TOTAL_LAYER_PIXELS,
        }

    def tearDown(self):
        nodes.load_backend = self._load_backend
        for key, value in self._limits.items():
            setattr(nodes, key, value)

    def _install_fake_backend(self, result: backend.DecomposeResult) -> None:
        class FakeBackend:
            def decompose(self, **kwargs):
                return result

        nodes.load_backend = lambda: FakeBackend()

    def _install_backend_that_must_not_run(self) -> None:
        class FailingBackend:
            def decompose(self, **kwargs):
                raise AssertionError("backend should not run after input preflight rejection")

        nodes.load_backend = lambda: FailingBackend()

    def _result_with_images(
        self,
        *,
        preview_shape=(1, 1, 4),
        layer_shapes=(),
    ) -> backend.DecomposeResult:
        layers = []
        for index, shape in enumerate(layer_shapes):
            layers.append(
                backend.DecomposedLayer(
                    id=f"layer_{index:03d}",
                    name=f"layer_{index:03d}",
                    label=f"layer_{index:03d}",
                    order=index,
                    bbox=(0, 0, int(shape[1]), int(shape[0])),
                    confidence=1.0,
                    left_right_split="center",
                    front_back_split="unknown",
                    depth_stats=backend.LayerDepthStats(min=1.0, max=1.0, mean=1.0),
                    image=numpy.zeros(shape, dtype=numpy.uint8),
                )
            )
        return backend.DecomposeResult(
            preview=numpy.zeros(preview_shape, dtype=numpy.uint8),
            model="test",
            model_version="test",
            layers=layers,
        )

    def test_terminal_nodes_are_marked_as_output_nodes(self):
        self.assertTrue(ViviSeeThroughDecompose.OUTPUT_NODE)
        self.assertTrue(ViviSeeThroughExportPSD.OUTPUT_NODE)

    def test_exports_only_expected_node_classes(self):
        self.assertEqual(
            set(NODE_CLASS_MAPPINGS),
            {"ViviSeeThroughDecompose", "ViviSeeThroughExportPSD"},
        )
        self.assertEqual(set(NODE_DISPLAY_NAME_MAPPINGS), set(NODE_CLASS_MAPPINGS))

    def test_decompose_rejects_input_image_over_pixel_limit_before_backend_call(self):
        nodes.MAX_INPUT_PIXELS = 4
        self._install_backend_that_must_not_run()

        with self.assertRaisesRegex(RuntimeError, "Input image exceeds"):
            ViviSeeThroughDecompose().decompose(
                image=_ArrayBomb((3, 3, 4)),
                seed=42,
                resolution=1280,
                num_inference_steps=30,
                tblr_split=True,
                use_lama=True,
                quant_mode="none",
                group_offload=False,
                filename_prefix="test",
                schema_version="1.0.0",
                plugin_version="0.1.0",
                capability="vivi2d.seethrough.v1",
            )

    def test_decompose_rejects_input_image_side_over_limit_before_backend_call(self):
        nodes.MAX_IMAGE_SIDE = 2
        self._install_backend_that_must_not_run()

        with self.assertRaisesRegex(RuntimeError, "Input image exceeds"):
            ViviSeeThroughDecompose().decompose(
                image=_ArrayBomb((1, 3, 4)),
                seed=42,
                resolution=1280,
                num_inference_steps=30,
                tblr_split=True,
                use_lama=True,
                quant_mode="none",
                group_offload=False,
                filename_prefix="test",
                schema_version="1.0.0",
                plugin_version="0.1.0",
                capability="vivi2d.seethrough.v1",
            )

    def test_decompose_rejects_preview_image_over_pixel_limit(self):
        nodes.MAX_PREVIEW_PIXELS = 4
        self._install_fake_backend(self._result_with_images(preview_shape=(3, 3, 4)))

        with self.assertRaisesRegex(RuntimeError, "Preview image exceeds"):
            ViviSeeThroughDecompose().decompose(
                image=object(),
                seed=42,
                resolution=1280,
                num_inference_steps=30,
                tblr_split=True,
                use_lama=True,
                quant_mode="none",
                group_offload=False,
                filename_prefix="test",
                schema_version="1.0.0",
                plugin_version="0.1.0",
                capability="vivi2d.seethrough.v1",
            )

    def test_decompose_rejects_preview_tensor_shape_before_cpu_copy(self):
        nodes.MAX_PREVIEW_PIXELS = 4
        result = self._result_with_images(preview_shape=(1, 1, 4))
        result.preview = _CpuBomb()
        self._install_fake_backend(result)

        with self.assertRaisesRegex(RuntimeError, "Preview image exceeds"):
            ViviSeeThroughDecompose().decompose(
                image=object(),
                seed=42,
                resolution=1280,
                num_inference_steps=30,
                tblr_split=True,
                use_lama=True,
                quant_mode="none",
                group_offload=False,
                filename_prefix="test",
                schema_version="1.0.0",
                plugin_version="0.1.0",
                capability="vivi2d.seethrough.v1",
            )

    def test_decompose_rejects_layer_image_over_pixel_limit(self):
        nodes.MAX_LAYER_PIXELS = 4
        self._install_fake_backend(
            self._result_with_images(preview_shape=(1, 1, 4), layer_shapes=[(3, 3, 4)])
        )

        with self.assertRaisesRegex(RuntimeError, "Layer image 0 exceeds"):
            ViviSeeThroughDecompose().decompose(
                image=object(),
                seed=42,
                resolution=1280,
                num_inference_steps=30,
                tblr_split=True,
                use_lama=True,
                quant_mode="none",
                group_offload=False,
                filename_prefix="test",
                schema_version="1.0.0",
                plugin_version="0.1.0",
                capability="vivi2d.seethrough.v1",
            )

    def test_decompose_rejects_total_layer_pixels_over_budget(self):
        nodes.MAX_LAYER_PIXELS = 16
        nodes.MAX_TOTAL_LAYER_PIXELS = 4
        self._install_fake_backend(
            self._result_with_images(
                preview_shape=(1, 1, 4),
                layer_shapes=[(2, 2, 4), (2, 2, 4)],
            )
        )

        with self.assertRaisesRegex(RuntimeError, "maximum total pixel count"):
            ViviSeeThroughDecompose().decompose(
                image=object(),
                seed=42,
                resolution=1280,
                num_inference_steps=30,
                tblr_split=True,
                use_lama=True,
                quant_mode="none",
                group_offload=False,
                filename_prefix="test",
                schema_version="1.0.0",
                plugin_version="0.1.0",
                capability="vivi2d.seethrough.v1",
            )

    def test_decompose_rejects_total_layer_pixels_before_materializing_over_budget_layer(self):
        nodes.MAX_LAYER_PIXELS = 16
        nodes.MAX_TOTAL_LAYER_PIXELS = 4
        result = self._result_with_images(
            preview_shape=(1, 1, 4),
            layer_shapes=[(2, 2, 4), (1, 1, 4)],
        )
        result.layers[1].image = _ArrayBomb((2, 2, 4))
        result.layers[1].bbox = (0, 0, 2, 2)
        self._install_fake_backend(result)

        with self.assertRaisesRegex(RuntimeError, "maximum total pixel count"):
            ViviSeeThroughDecompose().decompose(
                image=object(),
                seed=42,
                resolution=1280,
                num_inference_steps=30,
                tblr_split=True,
                use_lama=True,
                quant_mode="none",
                group_offload=False,
                filename_prefix="test",
                schema_version="1.0.0",
                plugin_version="0.1.0",
                capability="vivi2d.seethrough.v1",
            )


if __name__ == "__main__":
    unittest.main()
