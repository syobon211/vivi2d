import { useAutoSetupCommandStore } from "@/stores/autoSetupCommandStore";
import { useAutoSetupDraftStore } from "@/stores/autoSetupDraftStore";
import { useBoneStore } from "@/stores/boneStore";
import { useColliderStore } from "@/stores/colliderStore";
import { useEditorStore } from "@/stores/editorStore";
import { useExpressionPresetStore } from "@/stores/expressionPresetStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { useLipSyncStore } from "@/stores/lipsyncStore";
import { useMeshEditStore } from "@/stores/meshEditStore";
import { useMultiViewStore } from "@/stores/multiViewStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useParameterStore } from "@/stores/parameterStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { useProjectDialogsStore } from "@/stores/projectDialogsStore";
import { usePuppetWarpStore } from "@/stores/puppetWarpStore";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";
import { useQuickActionsStore } from "@/stores/quickActionsStore";
import { useSceneStore } from "@/stores/sceneStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { DEFAULT_KEYMAP, useShortcutStore } from "@/stores/shortcutStore";
import { useSkinStore } from "@/stores/skinStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useViewportStore } from "@/stores/viewportStore";
import { useVMCStore } from "@/stores/vmcStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";

export function resetEditorStore() {
  useEditorStore.setState({
    project: null,
    projectVersion: 0,
    projectStructureVersion: 0,
    currentFilePath: null,
    projectSourceKind: "none",
  });
}

export function resetSelectionStore(): void {
  useSelectionStore.setState({
    selectedLayerId: null,
    selectedLayerIds: [],
    soloLayerIds: [],
  });
}

export function resetParameterStore() {
  useParameterStore.setState({ parameterValues: {} });
}

export function resetTimelineStore() {
  useTimelineStore.setState({
    activeSceneId: null,
    activeClipId: null,
    currentFrame: 0,
    isPlaying: false,
    isLooping: false,
    viewMode: "dopeSheet",
    selectedGraphTrackId: null,
  });
}

export function resetLipSyncStore() {
  useLipSyncStore.setState({
    currentVolume: 0,
    isConnected: false,
    error: null,
    currentViseme: "sil",
    visemeConfidence: 0,
  });
}

export function resetPhysicsStore() {
  usePhysicsStore.setState({
    runtimeStates: {},
    previousParamValues: {},
    accumulators: {},
    isActive: true,
  });
}

export function resetViewportStore() {
  useViewportStore.setState({
    zoom: 1,
    panX: 0,
    panY: 0,
    activeTool: "select",
    defaultFormLocked: false,
    onionSkin: { enabled: false, framesBefore: 3, framesAfter: 3, opacity: 0.25 },
    meshHeatmap: { enabled: false, intensity: 1 },
    referenceOverlay: { enabled: false, opacity: 0.35, mode: "source" },
  });
}

export function resetNotificationStore() {
  useNotificationStore.setState({ notifications: [] });
}

export function resetHistoryStore() {
  useHistoryStore.setState({ undoStack: [], redoStack: [] });
}

export function resetSceneStore() {
  useSceneStore.setState({});
}

export function resetBoneStore() {
  useBoneStore.setState({});
}

export function resetAutoSetupDraftStore() {
  useAutoSetupDraftStore.setState({ draft: null });
}

export function resetAutoSetupCommandStore() {
  useAutoSetupCommandStore.setState({
    pendingCommand: null,
    commandInFlight: false,
  });
}

export function resetSkinStore() {
  useSkinStore.setState({});
}

export function resetShortcutStore() {
  useShortcutStore.setState({ keymap: { ...DEFAULT_KEYMAP } });
}

export function resetMeshEditStore() {
  useMeshEditStore.setState({
    selectedVertices: [],
    lassoActive: false,
    lassoPoints: [],
  });
}

export function resetPuppetWarpStore() {
  usePuppetWarpStore.setState({
    mode: "vertex",
    editTarget: "mesh",
    pinsByMeshId: {},
    groupsByMeshId: {},
    selectedPinIds: [],
    symmetryEnabled: false,
    symmetryTolerance: 4,
    dragState: null,
  });
}

export function resetMultiViewStore() {
  useMultiViewStore.setState({
    enabled: false,
    views: [],
    layout: "horizontal",
    activeViewId: null,
  });
}

export function resetWorkspaceModeStore() {
  useWorkspaceModeStore.setState({ mode: "default" });
}

export function resetQuickActionsStore() {
  useQuickActionsStore.setState({ open: false });
}

export function resetQuickActionRegistryStore() {
  useQuickActionRegistryStore.setState({ actions: {} });
}

export function resetProjectDialogsStore() {
  useProjectDialogsStore.setState({
    showValidationDialog: false,
    showDepthInspector: false,
    showManualPngSplit: false,
  });
}

export function resetIKRuntimeStore() {
  useIKRuntimeStore.getState().clearAll();
}

export function resetVMCStore() {
  useVMCStore.getState().reset();
}

export function resetExpressionPresetStore(): void {
  void useExpressionPresetStore;
}

export function resetColliderStore(): void {
  useColliderStore.setState({ selectedColliderId: null });
}

export function resetAllStores() {
  resetEditorStore();
  resetParameterStore();
  resetTimelineStore();
  resetLipSyncStore();
  resetPhysicsStore();
  resetViewportStore();
  resetNotificationStore();
  resetHistoryStore();
  resetSceneStore();
  resetBoneStore();
  resetAutoSetupCommandStore();
  resetAutoSetupDraftStore();
  resetSkinStore();
  resetSelectionStore();
  resetShortcutStore();
  resetMeshEditStore();
  resetPuppetWarpStore();
  resetMultiViewStore();
  resetWorkspaceModeStore();
  resetQuickActionsStore();
  resetQuickActionRegistryStore();
  resetProjectDialogsStore();
  resetColliderStore();
  resetIKRuntimeStore();
  resetVMCStore();
  resetExpressionPresetStore();
}
