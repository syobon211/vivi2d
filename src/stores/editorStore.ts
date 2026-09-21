import type { MeshDensityPreset } from "@vivi2d/core/constants";
import { findLayerById } from "@vivi2d/core/layer-utils";
import type {
  BlendMode,
  LayerId,
  LayerSemanticRole,
  MeshData,
  ProjectData,
  RGBColor,
} from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";
import {
  cleanupOrphanSkins as cleanupOrphanSkinsCommand,
  moveLayer as moveLayerCommand,
  reorderLayer as reorderLayerCommand,
  setBlendMode as setBlendModeCommand,
  setClipMaskIds as setClipMaskIdsCommand,
  setCulling as setCullingCommand,
  setDrawOrderBatch as setDrawOrderBatchCommand,
  setDrawOrder as setDrawOrderCommand,
  setLayerOpacity as setLayerOpacityCommand,
  setLayerSemanticRoleBatch as setLayerSemanticRoleBatchCommand,
  setLayerSemanticRole as setLayerSemanticRoleCommand,
  setMeshData as setMeshDataCommand,
  setMeshDivisions as setMeshDivisionsCommand,
  setMeshVertices as setMeshVerticesCommand,
  setMultiplyColor as setMultiplyColorCommand,
  setScreenColor as setScreenColorCommand,
  toggleExpanded as toggleExpandedCommand,
  toggleVisibility as toggleVisibilityCommand,
} from "@vivi2d/editor-core/layer-command";
import { create } from "zustand";
import { generateAutoMesh } from "@/lib/auto-mesh";
import type { ProjectSourceKind } from "@/lib/project-source-kind";
import { isProjectV11Publishing } from "@/lib/project-v11-publishing";
import {
  createAtlasEntryCanvas,
  mapAtlasEntryUvs,
  type V11EditorSession,
} from "@/lib/project-v11-serializer";
import { getTexture } from "@/lib/texture-store";
import { withStandardMiddleware } from "./_middleware";
import { registerHistoryCallbacks } from "./historyStore";
import { mutateProject } from "./projectMutator";
import { usePuppetWarpStore } from "./puppetWarpStore";

export interface EditorState {
  project: ProjectData | null;

  projectVersion: number;

  projectStructureVersion: number;

  currentFilePath: string | null;

  projectSourceKind: ProjectSourceKind;
  projectV11: V11EditorSession | null;
}

interface EditorActions {
  toggleVisibility: (id: LayerId) => void;
  toggleExpanded: (id: LayerId) => void;
  setLayerOpacity: (id: LayerId, opacity: number) => void;

  moveLayer: (id: LayerId, direction: "up" | "down") => void;
  reorderLayer: (
    sourceId: LayerId,
    targetId: LayerId,
    position: "before" | "after",
  ) => void;

  setClipMaskIds: (layerId: LayerId, maskIds: LayerId[]) => void;

  setMeshVertices: (layerId: LayerId, vertices: number[], mergeKey?: string) => void;
  setMeshData: (layerId: LayerId, mesh: MeshData) => void;
  setMeshDivisions: (layerId: LayerId, divisionsX: number, divisionsY: number) => void;
  setAutoMesh: (layerId: LayerId, preset: MeshDensityPreset) => void;
  setAutoMeshBatch: (
    layerIds: LayerId[],
    preset: MeshDensityPreset,
    presetOverrides?: Partial<Record<LayerId, MeshDensityPreset>>,
  ) => void;
  cleanupOrphanSkins: () => void;

  setDrawOrder: (id: LayerId, drawOrder: number) => void;
  setDrawOrderBatch: (updates: { id: LayerId; drawOrder: number }[]) => void;
  setBlendMode: (id: LayerId, blendMode: BlendMode) => void;
  setMultiplyColor: (id: LayerId, color: RGBColor) => void;
  setScreenColor: (id: LayerId, color: RGBColor) => void;
  setCulling: (id: LayerId, culling: boolean) => void;
  setLayerSemanticRole: (id: LayerId, role?: LayerSemanticRole) => void;
  setLayerSemanticRoleBatch: (layerIds: LayerId[], role?: LayerSemanticRole) => void;
}

export type EditorStore = EditorState & EditorActions;

export const useEditorStore = create<EditorStore>()(
  withStandardMiddleware<EditorStore>(
    (set) => ({
      project: null,
      projectVersion: 0,
      projectStructureVersion: 0,
      currentFilePath: null,
      projectSourceKind: "none",
      projectV11: null,

      toggleVisibility: (id) =>
        mutateProject((project) => {
          toggleVisibilityCommand(project, id);
        }),

      toggleExpanded: (id) => {
        if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
        if (useEditorStore.getState().projectV11) {
          mutateProject((project) => toggleExpandedCommand(project, id));
          return;
        }
        set((s) => {
          if (!s.project) return;
          toggleExpandedCommand(s.project, id);
        });
      },

      setLayerOpacity: (id, opacity) =>
        mutateProject((project) => {
          setLayerOpacityCommand(project, id, opacity);
        }, `layer-opacity:${id}`),

      moveLayer: (id, direction) =>
        mutateProject((project) => {
          moveLayerCommand(project, id, direction);
        }),

      reorderLayer: (sourceId, targetId, position) =>
        mutateProject((project) => {
          reorderLayerCommand(project, sourceId, targetId, position);
        }),

      setClipMaskIds: (layerId, maskIds) =>
        mutateProject((project) => {
          setClipMaskIdsCommand(project, layerId, maskIds);
        }),

      setMeshVertices: (layerId, vertices, mergeKey) => {
        let replaced = false;
        mutateProject((project) => {
          replaced = setMeshVerticesCommand(project, layerId, vertices);
        }, mergeKey);
        if (replaced) {
          usePuppetWarpStore.getState().invalidateMesh(layerId);
        }
      },

      setMeshData: (layerId, mesh) => {
        let replaced = false;
        mutateProject((project) => {
          replaced = setMeshDataCommand(project, layerId, mesh);
        });
        if (replaced) {
          usePuppetWarpStore.getState().invalidateMesh(layerId);
        }
      },

      setMeshDivisions: (layerId, divisionsX, divisionsY) => {
        let replaced = false;
        mutateProject((project) => {
          replaced = setMeshDivisionsCommand(project, layerId, divisionsX, divisionsY);
          const node = findLayerById(project.layers, layerId);
          if (replaced && node?.kind === "viviMesh")
            node.mesh = mapAtlasEntryUvs(
              useEditorStore.getState().projectV11?.revision,
              layerId,
              node.mesh,
            );
        });
        if (replaced) {
          usePuppetWarpStore.getState().invalidateMesh(layerId);
        }
      },

      setAutoMesh: (layerId, preset) => {
        let replaced = false;
        mutateProject((project) => {
          const node = findLayerById(project.layers, layerId);
          if (!node || !isViviMesh(node)) return;
          const canvas = useEditorStore.getState().projectV11
            ? createAtlasEntryCanvas(
                useEditorStore.getState().projectV11?.revision,
                layerId,
              )
            : getTexture(layerId);
          if (!canvas) return;
          const mesh = generateAutoMesh(canvas, node.width, node.height, preset);
          if (mesh) {
            node.mesh = mapAtlasEntryUvs(
              useEditorStore.getState().projectV11?.revision,
              layerId,
              mesh,
            );
            replaced = true;
          }
        });
        if (replaced) {
          usePuppetWarpStore.getState().invalidateMesh(layerId);
        }
      },

      setAutoMeshBatch: (layerIds, preset, presetOverrides) => {
        const invalidatedLayerIds = new Set<LayerId>();
        mutateProject((project) => {
          for (const id of layerIds) {
            const node = findLayerById(project.layers, id);
            if (!node || !isViviMesh(node)) continue;
            const canvas = useEditorStore.getState().projectV11
              ? createAtlasEntryCanvas(useEditorStore.getState().projectV11?.revision, id)
              : getTexture(id);
            if (!canvas) continue;
            const effectivePreset = presetOverrides?.[id] ?? preset;
            const mesh = generateAutoMesh(
              canvas,
              node.width,
              node.height,
              effectivePreset,
            );
            if (mesh) {
              node.mesh = mapAtlasEntryUvs(
                useEditorStore.getState().projectV11?.revision,
                id,
                mesh,
              );
              invalidatedLayerIds.add(id);
            }
          }
        });
        const puppetWarp = usePuppetWarpStore.getState();
        for (const id of invalidatedLayerIds) {
          puppetWarp.invalidateMesh(id);
        }
      },

      cleanupOrphanSkins: () =>
        mutateProject((project) => {
          cleanupOrphanSkinsCommand(project);
        }),

      setDrawOrder: (id, drawOrder) =>
        mutateProject((project) => {
          setDrawOrderCommand(project, id, drawOrder);
        }),

      setDrawOrderBatch: (updates) =>
        mutateProject((project) => {
          setDrawOrderBatchCommand(project, updates);
        }),

      setBlendMode: (id, blendMode) =>
        mutateProject((project) => {
          setBlendModeCommand(project, id, blendMode);
        }),

      setMultiplyColor: (id, color) =>
        mutateProject((project) => {
          setMultiplyColorCommand(project, id, color);
        }, `layer-multiplyColor:${id}`),

      setScreenColor: (id, color) =>
        mutateProject((project) => {
          setScreenColorCommand(project, id, color);
        }, `layer-screenColor:${id}`),

      setCulling: (id, culling) =>
        mutateProject((project) => {
          setCullingCommand(project, id, culling);
        }),

      setLayerSemanticRole: (id, role) =>
        mutateProject((project) => {
          setLayerSemanticRoleCommand(project, id, role);
        }),

      setLayerSemanticRoleBatch: (layerIds, role) =>
        mutateProject((project) => {
          setLayerSemanticRoleBatchCommand(project, layerIds, role);
        }),
    }),
    { name: "EditorStore", persistEnabled: false },
  ),
);

registerHistoryCallbacks({
  getCurrentProject: () => useEditorStore.getState().project,
  restoreProject: (snapshot) => {
    useEditorStore.setState((s) => {
      s.project = structuredClone(snapshot);
      s.projectStructureVersion += 1;
    });
  },
  prepareRestoreProject: (snapshot) => {
    const { project, projectVersion, projectStructureVersion } =
      useEditorStore.getState();
    const preparedProject = structuredClone(snapshot);
    return {
      commit: () =>
        useEditorStore.setState({
          project: preparedProject,
          projectStructureVersion: projectStructureVersion + 1,
        }),
      rollback: () =>
        useEditorStore.setState({ project, projectVersion, projectStructureVersion }),
    };
  },
});
