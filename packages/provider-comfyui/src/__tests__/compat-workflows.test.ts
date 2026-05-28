import { describe, expect, it } from "vitest";
import {
  inspectViviCompatSupport,
  VIVI2D_COMPAT_CAPABILITY,
  VIVI2D_COMPAT_NODE_TYPES,
  VIVI2D_COMPAT_PLUGIN_VERSION,
  VIVI2D_MANIFEST_SCHEMA_VERSION,
} from "../vivi2d-compat";
import { buildImageToManifestWorkflow } from "../workflows/image-to-manifest";
import { buildManifestToPsdWorkflow } from "../workflows/manifest-to-psd";
import { buildPromptToManifestWorkflow } from "../workflows/prompt-to-manifest";

describe("compat workflows", () => {
  it("buildImageToManifestWorkflow uses the 2-node compat flow", () => {
    const workflow = buildImageToManifestWorkflow("input.png");

    expect(Object.keys(workflow)).toEqual(["1", "2"]);
    expect(workflow["1"]!.class_type).toBe("LoadImage");
    expect(workflow["2"]!.class_type).toBe(VIVI2D_COMPAT_NODE_TYPES.decompose);
    expect(workflow["2"]!.inputs.image).toEqual(["1", 0]);
    expect(workflow["2"]!.inputs.schema_version).toBe(VIVI2D_MANIFEST_SCHEMA_VERSION);
    expect(workflow["2"]!.inputs.plugin_version).toBe(VIVI2D_COMPAT_PLUGIN_VERSION);
    expect(workflow["2"]!.inputs.capability).toBe(VIVI2D_COMPAT_CAPABILITY);
  });

  it("buildImageToManifestWorkflow forwards decompose options", () => {
    const workflow = buildImageToManifestWorkflow("input.png", {
      seed: 7,
      resolution: 1024,
      numSteps: 12,
      tblrSplit: false,
      useLama: false,
      quantMode: "nf4",
      groupOffload: true,
      filenamePrefix: "custom_job",
    });

    expect(workflow["2"]!.inputs.seed).toBe(7);
    expect(workflow["2"]!.inputs.resolution).toBe(1024);
    expect(workflow["2"]!.inputs.num_inference_steps).toBe(12);
    expect(workflow["2"]!.inputs.tblr_split).toBe(false);
    expect(workflow["2"]!.inputs.use_lama).toBe(false);
    expect(workflow["2"]!.inputs.quant_mode).toBe("nf4");
    expect(workflow["2"]!.inputs.group_offload).toBe(true);
    expect(workflow["2"]!.inputs.filename_prefix).toBe("custom_job");
  });

  it("buildPromptToManifestWorkflow keeps image generation separate from compat decompose", () => {
    const workflow = buildPromptToManifestWorkflow({ prompt: "anime portrait" });

    expect(workflow["6"]!.class_type).toBe(VIVI2D_COMPAT_NODE_TYPES.decompose);
    expect(workflow["6"]!.inputs.image).toEqual(["5", 0]);
    expect(workflow["6"]!.inputs.schema_version).toBe(VIVI2D_MANIFEST_SCHEMA_VERSION);
    expect(workflow["6"]!.inputs.plugin_version).toBe(VIVI2D_COMPAT_PLUGIN_VERSION);
    expect(workflow["6"]!.inputs.capability).toBe(VIVI2D_COMPAT_CAPABILITY);
  });

  it("buildManifestToPsdWorkflow only calls the export node", () => {
    const workflow = buildManifestToPsdWorkflow("output/job-1/manifest.json", {
      filenamePrefix: "release_psd",
    });

    expect(Object.keys(workflow)).toEqual(["1"]);
    expect(workflow["1"]!.class_type).toBe(VIVI2D_COMPAT_NODE_TYPES.exportPsd);
    expect(workflow["1"]!.inputs.manifest_path).toBe("output/job-1/manifest.json");
    expect(workflow["1"]!.inputs.filename_prefix).toBe("release_psd");
  });

  it("inspectViviCompatSupport accepts the expected node contract", async () => {
    const nodeInfo = {
      input: {
        required: {
          schema_version: ["STRING", { default: VIVI2D_MANIFEST_SCHEMA_VERSION }],
          plugin_version: ["STRING", { default: VIVI2D_COMPAT_PLUGIN_VERSION }],
          capability: ["STRING", { default: VIVI2D_COMPAT_CAPABILITY }],
        },
      },
    };

    const result = await inspectViviCompatSupport({
      async getNodeInfo(nodeType) {
        if (nodeType === VIVI2D_COMPAT_NODE_TYPES.decompose) return nodeInfo;
        if (nodeType === VIVI2D_COMPAT_NODE_TYPES.exportPsd) return { input: {} };
        return null;
      },
    });

    expect(result.supported).toBe(true);
    expect(result.capability).toBe(VIVI2D_COMPAT_CAPABILITY);
    expect(result.pluginVersion).toBe(VIVI2D_COMPAT_PLUGIN_VERSION);
    expect(result.manifestSchema).toBe(VIVI2D_MANIFEST_SCHEMA_VERSION);
    expect(result.issues).toEqual([]);
  });

  it("inspectViviCompatSupport reports missing nodes and schema mismatches", async () => {
    const result = await inspectViviCompatSupport({
      async getNodeInfo(nodeType) {
        if (nodeType === VIVI2D_COMPAT_NODE_TYPES.decompose) {
          return {
            input: {
              required: {
                schema_version: ["STRING", { default: "0.9.0" }],
                plugin_version: ["STRING", { default: "0.1.1" }],
                capability: ["STRING", { default: "vivi2d.seethrough.v0" }],
              },
            },
          };
        }
        return null;
      },
    });

    expect(result.supported).toBe(false);
    expect(result.capability).toBe("vivi2d.seethrough.v0");
    expect(result.pluginVersion).toBe("0.1.1");
    expect(result.manifestSchema).toBe("0.9.0");
    expect(result.issues).toContain(
      `Missing node: ${VIVI2D_COMPAT_NODE_TYPES.exportPsd}`,
    );
    expect(result.issues).toContain(
      `Capability mismatch: expected ${VIVI2D_COMPAT_CAPABILITY}, got vivi2d.seethrough.v0`,
    );
    expect(result.issues).toContain(
      `Manifest schema mismatch: expected ${VIVI2D_MANIFEST_SCHEMA_VERSION}, got 0.9.0`,
    );
    expect(result.issues).toContain(
      `Plugin version mismatch: expected ${VIVI2D_COMPAT_PLUGIN_VERSION}, got 0.1.1`,
    );
  });
});
