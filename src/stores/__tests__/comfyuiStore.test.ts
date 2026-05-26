import { beforeEach, describe, expect, it } from "vitest";
import { useComfyUIStore } from "@/stores/comfyuiStore";

describe("comfyuiStore", () => {
  beforeEach(() => {
    useComfyUIStore.getState().clearCompat();
    useComfyUIStore.getState().reset();
    useComfyUIStore.getState().setBaseUrl("http://127.0.0.1:8188");
  });

  it("starts with the default transient state", () => {
    const state = useComfyUIStore.getState();
    expect(state.baseUrl).toBe("http://127.0.0.1:8188");
    expect(state.connected).toBe(false);
    expect(state.generating).toBe(false);
    expect(state.progressMessage).toBe("");
    expect(state.progressPercent).toBe(0);
    expect(state.error).toBeNull();
    expect(state.compatStatus).toBe("unknown");
    expect(state.compatBaseUrl).toBeNull();
    expect(state.compatCapability).toBeNull();
    expect(state.compatPluginVersion).toBeNull();
    expect(state.compatManifestSchema).toBeNull();
    expect(state.compatHasDecomposeNode).toBe(false);
    expect(state.compatHasExportNode).toBe(false);
    expect(state.compatIssues).toEqual([]);
  });

  it("updates the configured base URL", () => {
    useComfyUIStore.getState().setBaseUrl("http://192.168.1.100:8188");
    expect(useComfyUIStore.getState().baseUrl).toBe("http://192.168.1.100:8188");
  });

  it("invalidates connection and compat state when the base URL changes", () => {
    const store = useComfyUIStore.getState();
    store.setConnected(true);
    store.setCompatSupported("http://127.0.0.1:8188", {
      capability: "vivi2d.seethrough.v1",
      pluginVersion: "0.1.0",
      manifestSchema: "1.0.0",
      hasDecomposeNode: true,
      hasExportNode: true,
      issues: [],
    });

    store.setBaseUrl("http://localhost:8000");

    const after = useComfyUIStore.getState();
    expect(after.connected).toBe(false);
    expect(after.compatStatus).toBe("unknown");
    expect(after.compatBaseUrl).toBeNull();
    expect(after.compatCapability).toBeNull();
    expect(after.compatPluginVersion).toBeNull();
    expect(after.compatManifestSchema).toBeNull();
    expect(after.compatHasDecomposeNode).toBe(false);
    expect(after.compatHasExportNode).toBe(false);
    expect(after.compatIssues).toEqual([]);
  });

  it("keeps compat details when the configured URL matches the last tested URL", () => {
    const store = useComfyUIStore.getState();
    store.setConnected(true);
    store.setCompatSupported("http://localhost:8000", {
      capability: "vivi2d.seethrough.v1",
      pluginVersion: "0.1.0",
      manifestSchema: "1.0.0",
      hasDecomposeNode: true,
      hasExportNode: true,
      issues: [],
    });

    store.setBaseUrl("http://localhost:8000");

    const after = useComfyUIStore.getState();
    expect(after.baseUrl).toBe("http://localhost:8000");
    expect(after.connected).toBe(true);
    expect(after.compatStatus).toBe("ready");
    expect(after.compatBaseUrl).toBe("http://localhost:8000");
    expect(after.compatCapability).toBe("vivi2d.seethrough.v1");
    expect(after.compatPluginVersion).toBe("0.1.0");
    expect(after.compatManifestSchema).toBe("1.0.0");
    expect(after.compatHasDecomposeNode).toBe(true);
    expect(after.compatHasExportNode).toBe(true);
  });

  it("normalizes equivalent base URLs before comparing cached compat state", () => {
    const store = useComfyUIStore.getState();
    store.setConnected(true);
    store.setCompatSupported("http://localhost:8000/", {
      capability: "vivi2d.seethrough.v1",
      pluginVersion: "0.1.0",
      manifestSchema: "1.0.0",
      hasDecomposeNode: true,
      hasExportNode: true,
      issues: [],
    });

    store.setBaseUrl("http://localhost:8000");

    const after = useComfyUIStore.getState();
    expect(after.baseUrl).toBe("http://localhost:8000");
    expect(after.connected).toBe(true);
    expect(after.compatStatus).toBe("ready");
    expect(after.compatBaseUrl).toBe("http://localhost:8000");
  });

  it("updates the connection flag", () => {
    useComfyUIStore.getState().setConnected(true);
    expect(useComfyUIStore.getState().connected).toBe(true);
  });

  it("updates generation progress", () => {
    useComfyUIStore.getState().setGenerating(true);
    useComfyUIStore.getState().setProgress("Uploading image...", 50);

    const state = useComfyUIStore.getState();
    expect(state.generating).toBe(true);
    expect(state.progressMessage).toBe("Uploading image...");
    expect(state.progressPercent).toBe(50);
  });

  it("stores and clears the current error", () => {
    useComfyUIStore.getState().setError("Connection failed");
    expect(useComfyUIStore.getState().error).toBe("Connection failed");

    useComfyUIStore.getState().setError(null);
    expect(useComfyUIStore.getState().error).toBeNull();
  });

  it("tracks a compat probe in progress", () => {
    useComfyUIStore.getState().setCompatChecking("http://127.0.0.1:8188");

    const state = useComfyUIStore.getState();
    expect(state.compatStatus).toBe("checking");
    expect(state.compatBaseUrl).toBe("http://127.0.0.1:8188");
    expect(state.compatCapability).toBeNull();
    expect(state.compatPluginVersion).toBeNull();
    expect(state.compatManifestSchema).toBeNull();
    expect(state.compatHasDecomposeNode).toBe(false);
    expect(state.compatHasExportNode).toBe(false);
    expect(state.compatIssues).toEqual([]);
  });

  it("stores a successful compat report", () => {
    useComfyUIStore.getState().setCompatSupported("http://127.0.0.1:8188", {
      capability: "vivi2d.seethrough.v1",
      pluginVersion: "0.1.0",
      manifestSchema: "1.0.0",
      hasDecomposeNode: true,
      hasExportNode: true,
      issues: [],
    });

    const state = useComfyUIStore.getState();
    expect(state.compatStatus).toBe("ready");
    expect(state.compatBaseUrl).toBe("http://127.0.0.1:8188");
    expect(state.compatCapability).toBe("vivi2d.seethrough.v1");
    expect(state.compatPluginVersion).toBe("0.1.0");
    expect(state.compatManifestSchema).toBe("1.0.0");
    expect(state.compatHasDecomposeNode).toBe(true);
    expect(state.compatHasExportNode).toBe(true);
    expect(state.compatIssues).toEqual([]);
  });

  it("stores a compat fallback report", () => {
    useComfyUIStore
      .getState()
      .setCompatMissing(
        "http://127.0.0.1:8188",
        ["Missing node: ViviSeeThroughDecompose"],
        {
          capability: null,
          pluginVersion: null,
          manifestSchema: null,
          hasDecomposeNode: false,
          hasExportNode: false,
        },
      );

    const state = useComfyUIStore.getState();
    expect(state.compatStatus).toBe("missing");
    expect(state.compatBaseUrl).toBe("http://127.0.0.1:8188");
    expect(state.compatCapability).toBeNull();
    expect(state.compatPluginVersion).toBeNull();
    expect(state.compatManifestSchema).toBeNull();
    expect(state.compatHasDecomposeNode).toBe(false);
    expect(state.compatHasExportNode).toBe(false);
    expect(state.compatIssues).toEqual(["Missing node: ViviSeeThroughDecompose"]);
  });

  it("clears compat state explicitly", () => {
    const store = useComfyUIStore.getState();
    store.setCompatMissing("http://127.0.0.1:8188", ["probe failed"]);
    store.clearCompat();

    const state = useComfyUIStore.getState();
    expect(state.compatStatus).toBe("unknown");
    expect(state.compatBaseUrl).toBeNull();
    expect(state.compatCapability).toBeNull();
    expect(state.compatPluginVersion).toBeNull();
    expect(state.compatManifestSchema).toBeNull();
    expect(state.compatHasDecomposeNode).toBe(false);
    expect(state.compatHasExportNode).toBe(false);
    expect(state.compatIssues).toEqual([]);
  });

  it("reset only clears transient generation state", () => {
    const store = useComfyUIStore.getState();
    store.setConnected(true);
    store.setGenerating(true);
    store.setProgress("Loading PSD...", 75);
    store.setError("Temporary error");
    store.setCompatSupported("http://127.0.0.1:8188", {
      capability: "vivi2d.seethrough.v1",
      pluginVersion: "0.1.0",
      manifestSchema: "1.0.0",
      hasDecomposeNode: true,
      hasExportNode: true,
      issues: [],
    });

    store.reset();

    const after = useComfyUIStore.getState();
    expect(after.baseUrl).toBe("http://127.0.0.1:8188");
    expect(after.connected).toBe(true);
    expect(after.generating).toBe(false);
    expect(after.progressMessage).toBe("");
    expect(after.progressPercent).toBe(0);
    expect(after.error).toBeNull();
    expect(after.compatStatus).toBe("ready");
    expect(after.compatCapability).toBe("vivi2d.seethrough.v1");
    expect(after.compatPluginVersion).toBe("0.1.0");
    expect(after.compatManifestSchema).toBe("1.0.0");
    expect(after.compatHasDecomposeNode).toBe(true);
    expect(after.compatHasExportNode).toBe(true);
  });
});
