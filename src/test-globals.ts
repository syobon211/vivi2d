import {
  artPathToMesh,
  buildStrokeMesh,
  tessellateArtPath,
} from "@vivi2d/core/artpath-utils";
import {
  mapIKToParameters,
  solveCCDIK,
  solveIKController,
  solveTwoBoneIK,
} from "@vivi2d/core/ik-solver";
import { evaluateImageSequenceAtFrame } from "@vivi2d/core/image-sequence-utils";
import {
  parseOSCMessage,
  parseVMCFaceChannel,
  parseVMCBonePos,
  serializeOSCMessage,
} from "@vivi2d/core/vmc-protocol";
import { getPixiAppRefs } from "@/hooks/usePixiApp";
import {
  generateAllBones,
  generateBodyBones,
  generateFaceBones,
} from "@/lib/ai-bone-generator";
import { detectParts, filterDetectedParts } from "@/lib/ai-part-detector";
import { detectSwayingParts, generatePhysicsGroups } from "@/lib/ai-physics-generator";
import { clearE2EPerfProbeEvents, consumeE2EPerfProbeEvents } from "@/lib/e2e-perf-probe";
import { nodeKindLabel } from "@/lib/format-utils";
import { t, useI18nStore } from "@/lib/i18n";
import { detectCyclicDependency, topologicalSortTargets } from "@/lib/offscreen-renderer";
import { useArtPathStore } from "@/stores/artPathStore";
import { useBoneStore } from "@/stores/boneStore";
import { useClipStore } from "@/stores/clipStore";
import { useColliderStore } from "@/stores/colliderStore";
import { useComfyUIStore } from "@/stores/comfyuiStore";
import { useEditorStore } from "@/stores/editorStore";
import { useExpressionPresetStore } from "@/stores/expressionPresetStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useIKControllerStore } from "@/stores/ikControllerStore";
import { useMultiViewStore } from "@/stores/multiViewStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useOffscreenStore } from "@/stores/offscreenStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { useParameterStore } from "@/stores/parameterStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { useProjectDialogsStore } from "@/stores/projectDialogsStore";
import { useQuickActionsStore } from "@/stores/quickActionsStore";
import { useSceneBlendStore } from "@/stores/sceneBlendStore";
import { useSceneStore } from "@/stores/sceneStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useSkinStore } from "@/stores/skinStore";
import { useStateMachineStore } from "@/stores/stateMachineStore";
import { useThemeStore } from "@/stores/themeStore";
import { useViewportStore } from "@/stores/viewportStore";
import { useVMCStore } from "@/stores/vmcStore";

declare global {
  interface Window {
    __vivi2d?: Record<string, unknown>;
  }
}

export function exposeForE2E() {
  window.__vivi2d = {
    useBoneStore,
    useArtPathStore,
    useColliderStore,
    useClipStore,
    useComfyUIStore,
    useEditorStore,
    useExpressionPresetStore,
    useParameterStore,
    useParameterDefinitionStore,
    useHistoryStore,
    useIKControllerStore,
    useMultiViewStore,
    useNotificationStore,
    useOffscreenStore,
    useSceneBlendStore,
    useSceneStore,
    useSelectionStore,
    useSkinStore,
    useStateMachineStore,
    useThemeStore,
    useI18nStore,
    useViewportStore,
    t,
    usePhysicsStore,
    useProjectDialogsStore,
    useVMCStore,
    useQuickActionsStore,
    // ArtPath
    tessellateArtPath,
    buildStrokeMesh,
    artPathToMesh,
    // IK
    solveTwoBoneIK,
    solveCCDIK,
    solveIKController,
    mapIKToParameters,
    evaluateImageSequenceAtFrame,
    detectCyclicDependency,
    topologicalSortTargets,
    // VMC
    parseOSCMessage,
    serializeOSCMessage,
    parseVMCFaceChannel,
    parseVMCBonePos,
    // AI
    detectParts,
    filterDetectedParts,
    generateFaceBones,
    generateBodyBones,
    generateAllBones,
    detectSwayingParts,
    generatePhysicsGroups,
    nodeKindLabel,
    clearE2EPerfProbeEvents,
    consumeE2EPerfProbeEvents,
    forceEditorCanvasRender: () => {
      const refs = getPixiAppRefs();
      refs?.app?.render();
    },
  };
}
