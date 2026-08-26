import tempfile
import unittest
from pathlib import Path

import numpy
from PIL import Image

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
        self._job_dir = nodes._job_dir
        self._export_psd_from_manifest = nodes.export_psd_from_manifest
        self._limits = {
            "MAX_IMAGE_SIDE": nodes.MAX_IMAGE_SIDE,
            "MAX_INPUT_PIXELS": nodes.MAX_INPUT_PIXELS,
            "MAX_PREVIEW_PIXELS": nodes.MAX_PREVIEW_PIXELS,
            "MAX_LAYER_PIXELS": nodes.MAX_LAYER_PIXELS,
            "MAX_TOTAL_LAYER_PIXELS": nodes.MAX_TOTAL_LAYER_PIXELS,
            "MAX_LAYER_IMAGE_BYTES": nodes.MAX_LAYER_IMAGE_BYTES,
            "MAX_TOTAL_LAYER_IMAGE_BYTES": nodes.MAX_TOTAL_LAYER_IMAGE_BYTES,
        }

    def tearDown(self):
        nodes.load_backend = self._load_backend
        nodes._job_dir = self._job_dir
        nodes.export_psd_from_manifest = self._export_psd_from_manifest
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

    def _use_fixed_job_dir(self, job_dir: Path) -> None:
        def create_job_dir(kind: str, filename_prefix: str) -> Path:
            job_dir.mkdir(parents=True, exist_ok=False)
            return job_dir

        nodes._job_dir = create_job_dir

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

    def test_decompose_rejects_too_many_layers_before_writing_images(self):
        self._install_fake_backend(
            self._result_with_images(
                preview_shape=(1, 1, 4),
                layer_shapes=[(1, 1, 4)] * (nodes.MAX_MANIFEST_LAYERS + 1),
            )
        )

        with self.assertRaisesRegex(RuntimeError, "too many layers"):
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

    def test_decompose_rejects_layer_png_over_encoded_byte_limit(self):
        nodes.MAX_LAYER_IMAGE_BYTES = 1
        self._install_fake_backend(
            self._result_with_images(
                preview_shape=(1, 1, 4),
                layer_shapes=[(1, 1, 4)],
            )
        )

        with self.assertRaisesRegex(RuntimeError, "maximum encoded size"):
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

    def test_decompose_rejects_layer_pngs_over_total_encoded_byte_limit(self):
        nodes.MAX_LAYER_IMAGE_BYTES = 1024
        nodes.MAX_TOTAL_LAYER_IMAGE_BYTES = 100
        self._install_fake_backend(
            self._result_with_images(
                preview_shape=(1, 1, 4),
                layer_shapes=[(1, 1, 4), (1, 1, 4)],
            )
        )

        with self.assertRaisesRegex(RuntimeError, "maximum total encoded size"):
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
            self._result_with_images(preview_shape=(3, 3, 4), layer_shapes=[(3, 3, 4)])
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
                preview_shape=(2, 2, 4),
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
            preview_shape=(2, 2, 4),
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

    def test_decompose_rejects_layer_dimensions_that_do_not_match_bbox_and_cleans_job(self):
        result = self._result_with_images(
            preview_shape=(2, 2, 4),
            layer_shapes=[(2, 2, 4)],
        )
        result.layers[0].bbox = (0, 0, 1, 1)
        self._install_fake_backend(result)

        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir) / "decompose" / "job"
            self._use_fixed_job_dir(job_dir)
            with self.assertRaisesRegex(RuntimeError, "dimensions do not match"):
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
            self.assertFalse(job_dir.exists())

    def test_decompose_rejects_bbox_outside_canvas_and_cleans_job(self):
        result = self._result_with_images(
            preview_shape=(1, 1, 4),
            layer_shapes=[(1, 1, 4)],
        )
        result.layers[0].bbox = (1, 0, 2, 1)
        self._install_fake_backend(result)

        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir) / "decompose" / "job"
            self._use_fixed_job_dir(job_dir)
            with self.assertRaisesRegex(RuntimeError, "bbox is outside the canvas"):
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
            self.assertFalse(job_dir.exists())

    def test_decompose_cleans_job_when_backend_fails_after_writing(self):
        class FailingBackend:
            def decompose(self, **kwargs):
                (kwargs["output_dir"] / "partial.bin").write_bytes(b"partial")
                raise RuntimeError("backend failed")

        nodes.load_backend = lambda: FailingBackend()
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir) / "decompose" / "job"
            self._use_fixed_job_dir(job_dir)
            with self.assertRaisesRegex(RuntimeError, "backend failed"):
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
            self.assertFalse(job_dir.exists())

    def test_saved_layer_validation_rejects_non_png_content(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            layer_path = Path(temp_dir) / "layer.png"
            Image.new("RGB", (1, 1), (255, 0, 0)).save(layer_path, format="JPEG")

            with self.assertRaisesRegex(RuntimeError, "must be saved as PNG"):
                nodes._validate_saved_layer_png(
                    layer_path,
                    expected_width=1,
                    expected_height=1,
                    label="Layer image 0",
                )

    def test_export_psd_node_cleans_job_on_failure(self):
        def fail_export(**kwargs):
            (kwargs["output_dir"] / "partial.psd").write_bytes(b"partial")
            raise RuntimeError("export failed")

        nodes.export_psd_from_manifest = fail_export
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir) / "psd" / "job"
            self._use_fixed_job_dir(job_dir)
            with self.assertRaisesRegex(RuntimeError, "export failed"):
                ViviSeeThroughExportPSD().export_psd("manifest.json", "test")
            self.assertFalse(job_dir.exists())


if __name__ == "__main__":
    unittest.main()
