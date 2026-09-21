import { act, renderHook } from "@testing-library/react";
import { findLayerById } from "@vivi2d/core/layer-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useParameterBinding } from "@/hooks/useParameterBinding";
import * as imageLoader from "@/lib/image-loader";
import { projectV11DisplayProjection } from "@/lib/project-v11-display-projection";
import { installProjectV11Display } from "@/lib/project-v11-renderer";
import {
  V11AtlasRevision,
  V11EditorCarrier,
  type V11ImageBacking,
} from "@/lib/project-v11-serializer";
import { clearTextures, getTexture, getTextureStoreRevision } from "@/lib/texture-store";
import { installRasterCanvas } from "@/test/raster-canvas";
import manifest from "../../../tests/conformance/project-embedded-round-trip-v11/manifest.json";
import { useEditorStore } from "../editorStore";
import {
  type HistoryEntry,
  prepareV11HistoryNavigation,
  useHistoryStore,
} from "../historyStore";
import { useIKRuntimeStore } from "../ikRuntimeStore";
import { useLipSyncStore } from "../lipsyncStore";
import { useParameterStore } from "../parameterStore";
import { usePhysicsStore } from "../physicsStore";
import {
  adoptLegacyProjectFromV11,
  adoptProjectV11,
  closeProjectV11,
  markProjectV11Saved,
} from "../project-v11-transaction";
import { closeProject } from "../projectIO";
import {
  importImageAsLayerFromBufferAsync,
  importImagesAsLayersFromBuffersAsync,
  loadImageFromBufferAsync,
  reimportManualPngLayer,
} from "../projectIO/image";
import {
  deleteV11Mesh,
  importV11Images,
  removeUnusedV11Images,
  replaceV11Image,
  setV11AtlasEntry,
  setV11RawUv,
} from "../projectIO/v11Images";
import {
  duplicateOriginalProjectV11,
  loadProject,
  saveProject,
} from "../projectIO/viviFile";
import {
  bumpProjectStructureVersion,
  mutateProject,
  replaceProject,
} from "../projectMutator";
import { useSelectionStore } from "../selectionStore";
import { useTimelineStore } from "../timelineStore";
import { useVMCStore } from "../vmcStore";

function fixture() {
  const wire = JSON.parse(manifest.documents[0]!.inputUtf8);
  const second = structuredClone(wire.project.layers[0].children[1]);
  second.id = "mesh-second";
  second.mesh.uvs[0] = -0.25;
  wire.project.layers[0].children.push(second);
  wire.project.layers[0].children[1].clipMaskIds = [second.id];
  wire.atlases[0].entries.push({ ...wire.atlases[0].entries[0], layerId: second.id });
  wire.atlases.push({ ...wire.atlases[0], id: "empty-atlas", entries: [] });
  return wire;
}
async function open(wire = fixture()) {
  const loaded = await V11EditorCarrier.open(
    new TextEncoder().encode(JSON.stringify(wire)),
  );
  const session = {
    carrier: loaded.carrier,
    revision: loaded.revision,
    display: loaded.display,
    saved: {
      project: loaded.project,
      revision: loaded.revision,
      canonical: loaded.canonical,
    },
  };
  adoptProjectV11(loaded.project, session, "fixture.vivi");
  return session;
}
function mesh(id = "mesh-0") {
  const node = findLayerById(useEditorStore.getState().project!.layers, id);
  if (node?.kind !== "viviMesh") throw new Error("fixture mesh missing");
  return node;
}
function png(id: string): ArrayBuffer {
  return Uint8Array.from(
    atob(manifest.pngCases.find((item) => item.id === id)!.base64),
    (character) => character.charCodeAt(0),
  ).buffer;
}

describe("ordinary Editor v11 core with real PNG WASM", () => {
  beforeEach(() => {
    installRasterCanvas();
    useEditorStore.setState({
      project: null,
      projectV11: null,
      projectVersion: 0,
      projectStructureVersion: 0,
      currentFilePath: null,
      projectSourceKind: "none",
    });
    useHistoryStore.getState().clear();
    clearTextures();
  });
  afterEach(() => {
    useEditorStore.setState({ projectV11: null, project: null });
    clearTextures();
    vi.restoreAllMocks();
  });

  it.each([
    ["depth-27", true],
    ["depth-29", false],
  ])("admits only saveable deep subtree moves (%s)", async (target, accepted) => {
    const wire = fixture();
    const group = (id: string, children: unknown[] = []) => ({
      ...structuredClone(wire.project.layers[0]),
      id,
      name: id,
      children,
    });
    // The original chain and the accepted move both have wire depth 63. Moving
    // this shallow three-group subtree beside depth-29 would produce depth 67.
    let chain = group("depth-29");
    for (let index = 28; index >= 0; index--) chain = group(`depth-${index}`, [chain]);
    wire.project.layers.push(
      chain,
      group("moving", [group("moving-1", [group("moving-2")])]),
    );
    const session = await open(wire);
    const before = useEditorStore.getState(),
      history = useHistoryStore.getState();
    const aliases = getTextureStoreRevision(),
      texture = getTexture("mesh-0");
    const prepare = vi.fn(() => ({
      commit: vi.fn(),
      rollback: vi.fn(),
      finalize: vi.fn(),
    }));
    const release = installProjectV11Display(prepare);
    try {
      const move = () =>
        useEditorStore.getState().reorderLayer("moving", target, "after");
      if (accepted) {
        expect(move).not.toThrow();
        expect(useHistoryStore.getState().undoStack).toHaveLength(1);
        expect(prepare).toHaveBeenCalledTimes(1);
      } else {
        expect(move).toThrow("PROJECT_EDIT_INVALID");
        expect(useEditorStore.getState()).toBe(before);
        expect(useHistoryStore.getState()).toBe(history);
        expect(getTextureStoreRevision()).toBe(aliases);
        expect(getTexture("mesh-0")).toBe(texture);
        expect(prepare).not.toHaveBeenCalled();
      }
      // Actual carrier -> bounded parser -> ordinary writer, not a depth mock.
      const saved = await session.carrier.serialize(
        useEditorStore.getState().project!,
        session.revision,
      );
      await expect(
        V11EditorCarrier.open(new TextEncoder().encode(saved)),
      ).resolves.toMatchObject({
        carrier: { documentId: session.carrier.documentId },
      });
    } finally {
      release();
    }
  });

  it("retains a valid __proto__ parameter default and its live display binding", async () => {
    const wire = fixture();
    wire.project.parameters[0] = {
      ...wire.project.parameters[0],
      id: "__proto__",
      defaultValue: 0.5,
    };
    wire.project.parameterBindings = [
      {
        id: "prototype-key",
        parameterId: "__proto__",
        target: { type: "bone", boneId: "bone-0", property: "angle" },
        bindingPoints: [
          { paramValue: 0, targetValue: 0 },
          { paramValue: 1, targetValue: 40 },
        ],
      },
    ];
    wire.project.ikControllers = [];
    await open(wire);
    const values = useParameterStore.getState().parameterValues;
    expect(Object.hasOwn(values, "__proto__")).toBe(true);
    expect(values.__proto__).toBe(0.5);
    const projected = projectV11DisplayProjection(
      useEditorStore.getState().project!,
      values,
    );
    const bone = findLayerById(projected.layers, "bone-0");
    expect(bone?.kind === "bone" && bone.bone.angle).toBe(20);
  });

  it("rejects ordinary reentry while v11-to-legacy publication temporarily exposes legacy mode", async () => {
    await open();
    const before = useEditorStore.getState(),
      history = useHistoryStore.getState();
    const texture = getTexture("mesh-0"),
      aliases = getTextureStoreRevision();
    const legacy = structuredClone(before.project!);
    legacy.name = "legacy target";
    let rejected = 0,
      entered = false;
    const asynchronous: Promise<string>[] = [];
    const decoder = vi.spyOn(imageLoader, "decodePngToCanvas");
    const stop = useEditorStore.subscribe((state) => {
      if (state.projectV11 !== null || entered) return;
      entered = true;
      for (const action of [
        () => closeProject(),
        () => replaceProject({ ...legacy, name: "reentrant replacement" }),
        () => useEditorStore.getState().toggleExpanded(legacy.layers[0]!.id),
        () => bumpProjectStructureVersion(),
        () => useHistoryStore.getState().undo(),
      ]) {
        expect(action).toThrow("PROJECT_TRANSACTION_BUSY");
        rejected++;
      }
      for (const pending of [
        importImageAsLayerFromBufferAsync(new ArrayBuffer(0), "reentrant.png"),
        importImagesAsLayersFromBuffersAsync([
          { buffer: new ArrayBuffer(0), fileName: "reentrant.png" },
        ]),
        reimportManualPngLayer("mesh-0", { buffer: new ArrayBuffer(0) }),
      ])
        asynchronous.push(
          pending.then(
            () => "not rejected",
            (error: Error) => error.message,
          ),
        );
      throw new Error("fixed transition observer failure");
    });
    try {
      expect(() =>
        adoptLegacyProjectFromV11(legacy, new Map(), "legacy.vivi", "none"),
      ).toThrow("PROJECT_TRANSACTION_FAILED");
    } finally {
      stop();
    }
    expect(rejected).toBe(5);
    expect(await Promise.all(asynchronous)).toEqual(
      Array(3).fill("PROJECT_TRANSACTION_BUSY"),
    );
    expect(decoder).not.toHaveBeenCalled();
    expect(useEditorStore.getState().project).toBe(before.project);
    expect(useEditorStore.getState().projectV11).toBe(before.projectV11);
    expect(useEditorStore.getState().currentFilePath).toBe(before.currentFilePath);
    expect(useHistoryStore.getState().undoStack).toBe(history.undoStack);
    expect(useHistoryStore.getState().redoStack).toBe(history.redoStack);
    expect(getTextureStoreRevision()).toBe(aliases);
    expect(getTexture("mesh-0")).toBe(texture);
    adoptLegacyProjectFromV11(legacy, new Map(), "legacy.vivi", "none");
    const expanded = useEditorStore.getState().project!.layers[0]!.expanded;
    useEditorStore.getState().toggleExpanded(legacy.layers[0]!.id);
    expect(useEditorStore.getState().project!.layers[0]!.expanded).toBe(!expanded);
    replaceProject({ ...legacy, name: "normal legacy replacement" });
    expect(useEditorStore.getState().project!.name).toBe("normal legacy replacement");
    closeProject();
    expect(useEditorStore.getState().project).toBeNull();
  });

  it("keeps default/live bindings display-only and reprojects binding edit/Undo at the same parameter identity", async () => {
    const wire = fixture();
    wire.project.parameters[0].defaultValue = 1;
    wire.project.parameterBindings = [
      {
        id: "display-angle",
        parameterId: "Motion.x",
        target: { type: "bone", boneId: "bone-0", property: "angle" },
        bindingPoints: [
          { paramValue: 0, targetValue: 0 },
          { paramValue: 1, targetValue: 45 },
        ],
      },
    ];
    await open(wire);
    const authored = useEditorStore.getState().project!;
    const before = structuredClone(authored);
    const beforeBone = findLayerById(before.layers, "bone-0");
    if (beforeBone?.kind !== "bone") throw Error("fixture bone missing");
    const parameters = useParameterStore.getState().parameterValues;
    const displayedAngle = () => {
      const display = projectV11DisplayProjection(
        useEditorStore.getState().project!,
        useParameterStore.getState().parameterValues,
      );
      const bone = findLayerById(display.layers, "bone-0");
      if (bone?.kind !== "bone") throw Error("fixture bone missing");
      return bone.bone.angle;
    };
    const hook = renderHook(() => useParameterBinding());
    try {
      expect(displayedAngle()).toBe(45);
      expect(useEditorStore.getState().project).toBe(authored);
      expect(authored).toEqual(before);
      expect(useHistoryStore.getState().undoStack).toHaveLength(0);
      act(() =>
        mutateProject((project) => {
          project.parameterBindings![0]!.bindingPoints[1]!.targetValue = 90;
        }),
      );
      expect(useParameterStore.getState().parameterValues).toBe(parameters);
      expect(displayedAngle()).toBe(90);
      act(() => useHistoryStore.getState().undo());
      expect(displayedAngle()).toBe(45);
      act(() => useHistoryStore.getState().redo());
      expect(displayedAngle()).toBe(90);
      act(() => useParameterStore.getState().setParameterValue("Motion.x", 0.5));
      expect(displayedAngle()).toBe(45);
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
      const afterBone = findLayerById(
        useEditorStore.getState().project!.layers,
        "bone-0",
      );
      expect(afterBone?.kind === "bone" && afterBone.bone).toEqual(beforeBone.bone);
      const liveParameters = useParameterStore.getState().parameterValues;
      // Isolated hook transition control: real open/close atomicity is covered
      // separately. The same parameter object must not suppress legacy behavior.
      act(() => useEditorStore.setState({ projectV11: null }));
      expect(useParameterStore.getState().parameterValues).toBe(liveParameters);
      const legacyBone = findLayerById(
        useEditorStore.getState().project!.layers,
        "bone-0",
      );
      expect(legacyBone?.kind === "bone" && legacyBone.bone.angle).toBe(45);
    } finally {
      hook.unmount();
    }
  });

  it("retains only the nearest 50 complete edits across Undo and Redo", async () => {
    await open();
    for (let step = 1; step <= 55; step++)
      mutateProject((project) => {
        project.name = `edit-${step}`;
      });
    expect(useHistoryStore.getState().undoStack).toHaveLength(50);
    for (let step = 0; step < 25; step++) useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project!.name).toBe("edit-30");
    expect(
      useHistoryStore.getState().undoStack.length +
        useHistoryStore.getState().redoStack.length,
    ).toBe(50);
    for (let step = 0; step < 26; step++) useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project!.name).toBe("edit-5");
    for (let step = 0; step < 51; step++) useHistoryStore.getState().redo();
    expect(useEditorStore.getState().project!.name).toBe("edit-55");
  });

  it.each([
    [32 * 1024 ** 2, 4],
    [4, 128 * 1024 ** 2],
  ])("counts shared history-only backing across BOTH stacks, excluding active backing (%i/%i)", async (pngByteLength, rgbaByteLength) => {
    const session = await open();
    // Only the real history budget algorithm is under test here. Metadata-only
    // backing avoids allocating 256 MiB just to exercise accounting, and is never
    // admitted to the real Project/decoder/display path.
    const revision = (id: string, scale = 1) =>
      new V11AtlasRevision([
        {
          id,
          entries: [],
          backing: {
            pngByteLength: pngByteLength * scale,
            rgbaByteLength: rgbaByteLength * scale,
          } as V11ImageBacking,
        },
      ]);
    const a = revision("a"),
      active = revision("active", 2),
      c = revision("c"),
      d = revision("d");
    const entry = (before: V11AtlasRevision, after: V11AtlasRevision): HistoryEntry => ({
      kind: "snapshot",
      snapshot: useEditorStore.getState().project!,
      effects: [{ kind: "v11-atlas", carrier: session.carrier, before, after }],
    });
    const farUndo = entry(a, active),
      consumed = entry(active, active),
      farRedo = entry(c, active),
      nearRedo = entry(d, active),
      reverse = entry(active, d);
    useHistoryStore.setState({
      undoStack: [farUndo, consumed],
      redoStack: [farRedo, nearRedo],
    });
    prepareV11HistoryNavigation("undo", reverse, active).commit();
    expect(useHistoryStore.getState().undoStack).toEqual([farUndo]);
    expect(useHistoryStore.getState().redoStack).toEqual([nearRedo, reverse]);
  });

  it("rejects display preparation before CPU publication and rolls adopted GPU state back on final history failure", async () => {
    await open();
    const before = useEditorStore.getState();
    const history = useHistoryStore.getState();
    const aliasRevision = getTextureStoreRevision();
    let release = installProjectV11Display(() => {
      throw new Error("V11_MASK_RENDERER_UNAVAILABLE");
    });
    try {
      expect(() =>
        mutateProject((project) => {
          project.name = "rejected";
        }),
      ).toThrow("V11_MASK_RENDERER_UNAVAILABLE");
      expect(useEditorStore.getState()).toBe(before);
      expect(useHistoryStore.getState()).toBe(history);
      expect(getTextureStoreRevision()).toBe(aliasRevision);
    } finally {
      release();
    }
    const commit = vi.fn(),
      rollback = vi.fn(),
      finalize = vi.fn();
    release = installProjectV11Display(() => ({ commit, rollback, finalize }));
    const stop = useHistoryStore.subscribe(() => {
      throw new Error("synthetic history observer");
    });
    try {
      expect(() =>
        mutateProject((project) => {
          project.name = "rejected later";
        }),
      ).toThrow("PROJECT_TRANSACTION_FAILED");
      expect(commit).toHaveBeenCalledTimes(1);
      expect(rollback).toHaveBeenCalledTimes(1);
      expect(finalize).not.toHaveBeenCalled();
      expect(useEditorStore.getState().project).toBe(before.project);
      expect(useEditorStore.getState().projectV11).toBe(before.projectV11);
      expect(getTextureStoreRevision()).toBe(aliasRevision);
    } finally {
      stop();
      release();
    }
  });

  it("retains whole atlas, empty atlas, outside UVs and current masks; deletion never resurrects loaded edges", async () => {
    const source = fixture(),
      session = await open(source);
    expect(getTexture("mesh-0")).toBe(getTexture("mesh-second"));
    expect(mesh().clipMaskIds).toEqual(["mesh-second"]);
    mutateProject((project) => {
      const layer = findLayerById(project.layers, "mesh-0")!;
      delete layer.clipMaskIds;
    });
    const canonical = JSON.parse(
      await session.carrier.serialize(
        useEditorStore.getState().project!,
        session.revision,
      ),
    );
    expect(canonical.atlases).toEqual(source.atlases);
    expect(canonical.project.layers[0].children[1]).not.toHaveProperty("clipMaskIds");
    expect(canonical.project.layers[0].children[1]).not.toHaveProperty("clipMasks");
    expect(canonical.project.layers[0].children[2].mesh.uvs[0]).toBe(-0.25);
    expect(
      JSON.parse(session.carrier.duplicateOriginal()).project.layers[0].children[1]
        .clipMaskIds,
    ).toEqual(["mesh-second"]);
  });

  it("UV and index changes increment structure once, vertex movement stays light, exact no-op creates no history", async () => {
    await open();
    const version = useEditorStore.getState().projectStructureVersion;
    setV11RawUv("mesh-0", 0, -0.5, 2);
    expect(useEditorStore.getState().projectStructureVersion).toBe(version + 1);
    const history = useHistoryStore.getState().undoStack;
    setV11RawUv("mesh-0", 0, -0.5, 2);
    expect(useHistoryStore.getState().undoStack).toBe(history);
    useEditorStore.getState().setMeshVertices("mesh-0", [0.25, 0, 1, 0, 0, 1]);
    expect(useEditorStore.getState().projectStructureVersion).toBe(version + 1);
    mutateProject((project) => {
      const node = findLayerById(project.layers, "mesh-0");
      if (node?.kind === "viviMesh") node.mesh.indices = [0, 2, 1];
    });
    expect(useEditorStore.getState().projectStructureVersion).toBe(version + 2);
    useHistoryStore.getState().undo();
    expect(mesh().mesh.indices).toEqual([0, 1, 2]);
    expect(useEditorStore.getState().projectStructureVersion).toBe(version + 3);
  });

  it("rejects unsupported edit before state/history/aliases change and rolls back even throwing rollback subscribers", async () => {
    await open();
    const before = useEditorStore.getState(),
      history = useHistoryStore.getState(),
      texture = getTexture("mesh-0"),
      revision = getTextureStoreRevision();
    expect(() =>
      mutateProject((project) => {
        project.layers[0]!.clipMaskIds = [];
      }),
    ).toThrow("PROJECT_EDIT_INVALID");
    expect(useEditorStore.getState().project).toBe(before.project);
    const stop = useParameterStore.subscribe(() => {
      throw new Error("subscriber failure");
    });
    expect(() =>
      mutateProject((project) => {
        project.name = "changed";
      }),
    ).toThrow("PROJECT_TRANSACTION_FAILED");
    stop();
    expect(useEditorStore.getState().project).toBe(before.project);
    expect(useEditorStore.getState().projectV11).toBe(before.projectV11);
    expect(useHistoryStore.getState().undoStack).toBe(history.undoStack);
    expect(getTexture("mesh-0")).toBe(texture);
    expect(getTextureStoreRevision()).toBe(revision);
  });

  it("blocks subscriber reentrant project publication and preserves every installed participant", async () => {
    await open();
    const before = useEditorStore.getState();
    const stop = useEditorStore.subscribe(() => {
      mutateProject((project) => {
        project.name = "reentrant";
      });
    });
    expect(() =>
      mutateProject((project) => {
        project.name = "outer";
      }),
    ).toThrow("PROJECT_TRANSACTION_FAILED");
    stop();
    expect(useEditorStore.getState().project).toBe(before.project);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("a final history publication failure restores all earlier evaluation/session participants", async () => {
    await open();
    useTimelineStore.setState({ currentFrame: 77, isPlaying: true });
    useLipSyncStore.setState({ currentVolume: 0.75 });
    const before = useEditorStore.getState(),
      parameter = useParameterStore.getState(),
      ik = useIKRuntimeStore.getState(),
      physics = usePhysicsStore.getState(),
      timeline = useTimelineStore.getState(),
      lip = useLipSyncStore.getState(),
      vmc = useVMCStore.getState(),
      history = useHistoryStore.getState();
    const texture = getTexture("mesh-0"),
      revision = getTextureStoreRevision();
    const stop = useHistoryStore.subscribe(() => {
      throw new Error("history subscriber");
    });
    await expect(open()).rejects.toThrow("PROJECT_TRANSACTION_FAILED");
    stop();
    expect(useEditorStore.getState().project).toBe(before.project);
    expect(useEditorStore.getState().projectV11).toBe(before.projectV11);
    expect(useEditorStore.getState().currentFilePath).toBe(before.currentFilePath);
    expect(useParameterStore.getState().parameterValues).toBe(parameter.parameterValues);
    expect(useIKRuntimeStore.getState().solutions).toBe(ik.solutions);
    expect(useIKRuntimeStore.getState().runtimeTargets).toBe(ik.runtimeTargets);
    expect(usePhysicsStore.getState().runtimeStates).toBe(physics.runtimeStates);
    expect(usePhysicsStore.getState().previousParamValues).toBe(
      physics.previousParamValues,
    );
    expect(usePhysicsStore.getState().accumulators).toBe(physics.accumulators);
    expect(useTimelineStore.getState().currentFrame).toBe(timeline.currentFrame);
    expect(useTimelineStore.getState().isPlaying).toBe(timeline.isPlaying);
    expect(useLipSyncStore.getState().currentVolume).toBe(lip.currentVolume);
    expect(useVMCStore.getState().mappings).toBe(vmc.mappings);
    expect(useVMCStore.getState().faceChannelBuffer).toBe(vmc.faceChannelBuffer);
    expect(useHistoryStore.getState().undoStack).toBe(history.undoStack);
    expect(useHistoryStore.getState().redoStack).toBe(history.redoStack);
    expect(getTexture("mesh-0")).toBe(texture);
    expect(getTextureStoreRevision()).toBe(revision);
  });

  it("a post-commit selection subscriber cannot roll back an accepted core edit", async () => {
    await open();
    const stop = useSelectionStore.subscribe(() => {
      throw new Error("selection subscriber");
    });
    expect(() =>
      mutateProject((project) => {
        project.name = "accepted edit";
      }),
    ).not.toThrow();
    stop();
    expect(useEditorStore.getState().project!.name).toBe("accepted edit");
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it("deletes mesh skin/mask/entry together, preserves imported empty atlas, and reverses aliases after a save", async () => {
    const original = await open();
    expect(deleteV11Mesh("mesh-second")).toBe(true);
    const changed = useEditorStore.getState();
    expect(mesh().clipMaskIds).toEqual([]);
    expect(getTexture("mesh-second")).toBeUndefined();
    expect(changed.projectV11!.revision.atlases.map((atlas) => atlas.id)).toEqual([
      "atlas-0",
      "empty-atlas",
    ]);
    const canonical = await original.carrier.serialize(
      changed.project!,
      changed.projectV11!.revision,
    );
    expect(
      markProjectV11Saved(changed.projectV11!, changed.project!, canonical, "saved.vivi"),
    ).toBe(true);
    useHistoryStore.getState().undo();
    expect(mesh().clipMaskIds).toEqual(["mesh-second"]);
    expect(getTexture("mesh-second")).toBe(getTexture("mesh-0"));
    expect(useEditorStore.getState().projectV11!.carrier).toBe(original.carrier);
    useHistoryStore.getState().redo();
    expect(getTexture("mesh-second")).toBeUndefined();
    expect(removeUnusedV11Images()).toBe(true);
    expect(useEditorStore.getState().projectV11!.revision.atlases).toHaveLength(1);
    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().projectV11!.revision.atlases).toHaveLength(2);
  });

  it("rejects display mutation, and an old save completion cannot alter a new session", async () => {
    const session = await open(),
      project = useEditorStore.getState().project!;
    getTexture("mesh-0")!
      .getContext("2d")!
      .putImageData(new ImageData(new Uint8ClampedArray([9, 9, 9, 255]), 1, 1), 0, 0);
    expect(() =>
      mutateProject((next) => {
        next.name = "bad";
      }),
    ).toThrow("PROJECT_TEXTURE_CONFLICT");
    expect(useEditorStore.getState().project).toBe(project);
    closeProjectV11();
    await open();
    expect(
      markProjectV11Saved(session, project, session.saved.canonical, "old.vivi"),
    ).toBe(false);
    expect(useEditorStore.getState().currentFilePath).toBe("fixture.vivi");
  });

  it("adds one real image batch atomically and reverses its stable atlas IDs without decoding again", async () => {
    await open();
    const before = useEditorStore.getState();
    await importV11Images([{ buffer: png("frozen-palette"), fileName: "palette.png" }]);
    const added = useEditorStore.getState(),
      atlas = added.projectV11!.revision.atlases.at(-1)!;
    const id = atlas.entries[0]!.layerId;
    expect(atlas.id).toMatch(/^atlas-/);
    expect(mesh(id)).not.toHaveProperty("importMetadata");
    expect(getTexture(id)!.width).toBe(2);
    expect(added.projectStructureVersion).toBe(before.projectStructureVersion + 1);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    useHistoryStore.getState().undo();
    expect(getTexture(id)).toBeUndefined();
    useHistoryStore.getState().redo();
    expect(useEditorStore.getState().projectV11!.revision.atlases.at(-1)!.id).toBe(
      atlas.id,
    );
    const stable = useEditorStore.getState(),
      history = useHistoryStore.getState();
    await expect(
      importV11Images([
        { buffer: png("frozen-palette"), fileName: "valid.png" },
        { buffer: new ArrayBuffer(24), fileName: "invalid.png" },
      ]),
    ).rejects.toThrow();
    expect(useEditorStore.getState().project).toBe(stable.project);
    expect(useEditorStore.getState().projectV11).toBe(stable.projectV11);
    expect(useHistoryStore.getState().undoStack).toBe(history.undoStack);
  });

  it("detaches a shared replacement, preserves neighbour pixels/geometry, and keeps exclusive identity", async () => {
    const original = await open();
    const before = structuredClone(mesh("mesh-second"));
    await replaceV11Image("mesh-second", png("frozen-palette"));
    const detached = useEditorStore.getState().projectV11!,
      mapping = detached.revision.entry("mesh-second")!;
    expect(mapping.atlas.id).not.toBe("atlas-0");
    expect(mapping.entry.width).toBe(2);
    expect(mesh("mesh-second").width).toBe(before.width);
    expect(mesh("mesh-second").mesh).toEqual(before.mesh);
    expect(detached.revision.entry("mesh-0")!.atlas.backing).toBe(
      original.revision.entry("mesh-0")!.atlas.backing,
    );
    expect(getTexture("mesh-second")).not.toBe(getTexture("mesh-0"));
    const history = useHistoryStore.getState().undoStack;
    await replaceV11Image("mesh-second", png("frozen-palette"));
    expect(useHistoryStore.getState().undoStack).toBe(history);
    await replaceV11Image("mesh-second", png("frozen-palette-trns"));
    expect(
      useEditorStore.getState().projectV11!.revision.entry("mesh-second")!.atlas.id,
    ).toBe(mapping.atlas.id);
    useHistoryStore.getState().undo();
    useHistoryStore.getState().undo();
    expect(getTexture("mesh-second")).toBe(getTexture("mesh-0"));
  });

  it("maps an explicit atlas entry without rewriting UV, then replacement uses that fixed entry transform", async () => {
    await open();
    await replaceV11Image("mesh-second", png("frozen-palette"));
    const atlas = useEditorStore
      .getState()
      .projectV11!.revision.entry("mesh-second")!.atlas;
    const uvs = [...mesh("mesh-second").mesh.uvs];
    setV11AtlasEntry("mesh-second", atlas.id, { x: 1, y: 0, width: 1, height: 1 });
    expect(mesh("mesh-second").mesh.uvs).toEqual(uvs);
    await replaceV11Image("mesh-second", png("srgb-intent-zero"));
    expect(mesh("mesh-second").mesh.uvs).toEqual(
      uvs.map((value, index) => (index % 2 === 0 ? value * 2 - 1 : value)),
    );
    useHistoryStore.getState().undo();
    expect(mesh("mesh-second").mesh.uvs).toEqual(uvs);
    expect(
      useEditorStore.getState().projectV11!.revision.entry("mesh-second")!.entry.x,
    ).toBe(1);
    const detachedId = useEditorStore
      .getState()
      .projectV11!.revision.entry("mesh-second")!.atlas.id;
    setV11AtlasEntry("mesh-second", "atlas-0", { x: 0, y: 0, width: 1, height: 1 });
    expect(
      useEditorStore.getState().projectV11!.revision.atlases.map((item) => item.id),
    ).toEqual(["atlas-0", "empty-atlas"]);
    useHistoryStore.getState().undo();
    expect(
      useEditorStore.getState().projectV11!.revision.entry("mesh-second")!.atlas.id,
    ).toBe(detachedId);
  });

  it("same project values and atlas revision preserve redo and evaluation instead of publishing a no-op", async () => {
    await open();
    mutateProject((project) => {
      project.name = "changed";
    });
    useHistoryStore.getState().undo();
    const before = useEditorStore.getState(),
      history = useHistoryStore.getState();
    const subscribe = vi.fn();
    const stop = useEditorStore.subscribe(subscribe);
    replaceProject(before.project!);
    replaceProject(structuredClone(before.project!));
    stop();
    expect(subscribe).not.toHaveBeenCalled();
    expect(useHistoryStore.getState().undoStack).toBe(history.undoStack);
    expect(useHistoryStore.getState().redoStack).toBe(history.redoStack);
    expect(useEditorStore.getState().projectV11).toBe(before.projectV11);
  });

  it("rejects legacy image load before decoding and rejects malformed original UTF-8 without any adoption", async () => {
    await open();
    const before = useEditorStore.getState(),
      texture = getTexture("mesh-0");
    const decoder = vi.spyOn(imageLoader, "decodePngToCanvas");
    expect(await loadImageFromBufferAsync(png("frozen-palette"), "blocked.png")).toBe(
      false,
    );
    expect(decoder).not.toHaveBeenCalled();
    const bytes = new TextEncoder().encode(JSON.stringify(fixture()));
    const index = new TextDecoder().decode(bytes).indexOf('"name":"') + 8;
    bytes[index] = 0xff;
    window.electronAPI.openViviFile = vi.fn().mockResolvedValue({
      data: new TextDecoder().decode(bytes),
      utf8Bytes: bytes.buffer,
      filePath: "malformed.vivi",
    });
    expect(await loadProject()).toBe(false);
    expect(useEditorStore.getState().project).toBe(before.project);
    expect(useEditorStore.getState().projectV11).toBe(before.projectV11);
    expect(getTexture("mesh-0")).toBe(texture);
  });

  it("a legacy decoder started earlier cannot install textures after v11 adoption", async () => {
    let finish!: (canvas: HTMLCanvasElement) => void;
    vi.spyOn(imageLoader, "decodePngToCanvas").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = loadImageFromBufferAsync(png("frozen-palette"), "late.png");
    await open();
    const before = useEditorStore.getState(),
      texture = getTexture("mesh-0"),
      revision = getTextureStoreRevision();
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 1;
    finish(canvas);
    expect(await pending).toBe(false);
    expect(useEditorStore.getState().project).toBe(before.project);
    expect(useEditorStore.getState().projectV11).toBe(before.projectV11);
    expect(getTexture("mesh-0")).toBe(texture);
    expect(getTextureStoreRevision()).toBe(revision);
  });

  it("keeps one save slot across close/open and never updates the new session from a late write", async () => {
    await open();
    let finish!: (value: { filePath: string }) => void;
    const save = vi.fn(
      (_args: Parameters<ElectronAPI["saveFile"]>[0]) =>
        new Promise<{ filePath: string }>((resolve) => {
          finish = resolve;
        }),
    );
    window.electronAPI.saveFile = save;
    const pending = saveProject(true);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ format: "project-v11-json" }),
    );
    expect(save.mock.calls[0]![0]).not.toHaveProperty("binary");
    closeProjectV11();
    await open();
    expect(await saveProject()).toBe(false);
    finish({ filePath: "old-save.vivi" });
    expect(await pending).toBe(true);
    expect(useEditorStore.getState().currentFilePath).toBe("fixture.vivi");
  });

  it("records a successful older save without erasing newer same-session edits", async () => {
    const original = await open();
    const oldProject = useEditorStore.getState().project!;
    let finish!: (value: { filePath: string }) => void;
    const save = vi.fn(
      (_args: Parameters<ElectronAPI["saveFile"]>[0]) =>
        new Promise<{ filePath: string }>((resolve) => {
          finish = resolve;
        }),
    );
    window.electronAPI.saveFile = save;
    const pending = saveProject();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    mutateProject((project) => {
      project.name = "newer edit";
    });
    finish({ filePath: "saved.vivi" });
    expect(await pending).toBe(true);
    expect(useEditorStore.getState().project!.name).toBe("newer edit");
    expect(useEditorStore.getState().projectV11!.carrier).toBe(original.carrier);
    expect(useEditorStore.getState().projectV11!.saved.project).toBe(oldProject);
    expect(useEditorStore.getState().projectV11!.originalFilePath).toBe("fixture.vivi");
    window.electronAPI.saveFile = vi
      .fn()
      .mockResolvedValue({ filePath: "original-copy.vivi" });
    expect(await duplicateOriginalProjectV11()).toBe(true);
    expect(window.electronAPI.saveFile).toHaveBeenCalledWith(
      expect.objectContaining({ preserveSourcePaths: ["fixture.vivi", "saved.vivi"] }),
    );
  });
});
