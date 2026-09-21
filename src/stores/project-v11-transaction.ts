import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { ProjectData } from "@vivi2d/core/types";
import { applyPatches, type Patch } from "immer";
import { t } from "@/lib/i18n";
import { isProjectV11Publishing, publishProjectV11 } from "@/lib/project-v11-publishing";
import { prepareProjectV11Display } from "@/lib/project-v11-renderer";
import {
  V11AtlasDisplay,
  type V11AtlasRevision,
  type V11EditorSession,
  v11StructureChanged,
} from "@/lib/project-v11-serializer";
import { getAllTextures, prepareTextureAliases } from "@/lib/texture-store";
import { type EditorState, useEditorStore } from "./editorStore";
import {
  type HistoryEntry,
  type PreparedHistoryChange,
  prepareHistoryClear,
  prepareV11HistoryEdit,
  prepareV11HistoryNavigation,
  registerV11HistoryRestore,
  useHistoryStore,
} from "./historyStore";
import { useIKRuntimeStore } from "./ikRuntimeStore";
import { useLipSyncStore } from "./lipsyncStore";
import { useNotificationStore } from "./notificationStore";
import { useParameterStore } from "./parameterStore";
import { usePhysicsStore } from "./physicsStore";
import { registerV11ProjectEdit } from "./projectMutator";
import { useSelectionStore } from "./selectionStore";
import { useTimelineStore } from "./timelineStore";
import { useVMCStore } from "./vmcStore";

function increment(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value === Number.MAX_SAFE_INTEGER)
    throw new Error("PROJECT_VERSION_LIMIT");
  return value + 1;
}

/** No participant registry: the fixed Editor/session, parameter, IK, physics,
 * timeline, lip-sync, VMC and history stores publish together without awaiting. */
function commitPrepared(
  before: ReturnType<typeof useEditorStore.getState>,
  next: Partial<EditorState>,
  history: PreparedHistoryChange,
  newSession: boolean,
  refreshEvaluation: boolean,
  legacyTextures?: ReadonlyMap<string, HTMLCanvasElement>,
): void {
  const project = next.project ?? null;
  const oldParameter = useParameterStore.getState();
  const oldIk = useIKRuntimeStore.getState();
  const oldPhysics = usePhysicsStore.getState();
  const oldTimeline = useTimelineStore.getState();
  const oldLip = useLipSyncStore.getState();
  const oldVmc = useVMCStore.getState();
  const parameterValues: Record<string, number> = Object.create(null);
  for (const parameter of project?.parameters ?? []) {
    const previous = Object.hasOwn(oldParameter.parameterValues, parameter.id)
      ? oldParameter.parameterValues[parameter.id]
      : undefined;
    const retained = newSession || !Number.isFinite(previous) ? undefined : previous;
    parameterValues[parameter.id] =
      retained === undefined
        ? parameter.defaultValue
        : Math.min(parameter.maxValue, Math.max(parameter.minValue, retained));
  }
  const stableValues =
    !newSession &&
    Object.keys(oldParameter.parameterValues).length ===
      Object.keys(parameterValues).length &&
    Object.entries(parameterValues).every(([id, value]) =>
      Object.is(value, oldParameter.parameterValues[id]),
    )
      ? oldParameter.parameterValues
      : parameterValues;
  const aliases =
    legacyTextures ??
    next.projectV11?.display.aliases() ??
    new Map<string, HTMLCanvasElement>();
  const textures = prepareTextureAliases(aliases);
  const controllers = new Set(project?.ikControllers?.map((controller) => controller.id));
  const nextTargets = newSession
    ? new Map()
    : new Map([...oldIk.runtimeTargets].filter(([id]) => controllers.has(id)));
  // GPU allocation/rasterization must reject before any CPU participant publishes.
  // The old scene's owners remain alive until the final history commit succeeds.
  const display = prepareProjectV11Display({
    project,
    aliases,
    parameterValues: stableValues,
    v11: !!next.projectV11,
    rebuild:
      newSession || next.projectStructureVersion !== before.projectStructureVersion,
    newSession,
  });
  const parts: PreparedHistoryChange[] = [
    ...(display ? [display] : []),
    textures,
    {
      commit: () => useEditorStore.setState(next),
      rollback: () =>
        useEditorStore.setState({
          project: before.project,
          projectVersion: before.projectVersion,
          projectStructureVersion: before.projectStructureVersion,
          currentFilePath: before.currentFilePath,
          projectSourceKind: before.projectSourceKind,
          projectV11: before.projectV11,
        }),
    },
    {
      commit: () => useParameterStore.setState({ parameterValues: stableValues }),
      rollback: () =>
        useParameterStore.setState({ parameterValues: oldParameter.parameterValues }),
    },
    {
      commit: () =>
        useIKRuntimeStore.setState({
          solutions: refreshEvaluation ? new Map() : oldIk.solutions,
          runtimeTargets: nextTargets,
        }),
      rollback: () =>
        useIKRuntimeStore.setState({
          solutions: oldIk.solutions,
          runtimeTargets: oldIk.runtimeTargets,
        }),
    },
    {
      commit: () =>
        usePhysicsStore.setState({
          runtimeStates: {},
          previousParamValues: {},
          accumulators: {},
        }),
      rollback: () =>
        usePhysicsStore.setState({
          runtimeStates: oldPhysics.runtimeStates,
          previousParamValues: oldPhysics.previousParamValues,
          accumulators: oldPhysics.accumulators,
        }),
    },
    {
      commit: () => {
        if (newSession)
          useTimelineStore.setState({
            activeClipId: null,
            activeSceneId: null,
            currentFrame: 0,
            isPlaying: false,
            selectedGraphTrackId: null,
          });
      },
      rollback: () => {
        if (newSession)
          useTimelineStore.setState({
            activeClipId: oldTimeline.activeClipId,
            activeSceneId: oldTimeline.activeSceneId,
            currentFrame: oldTimeline.currentFrame,
            isPlaying: oldTimeline.isPlaying,
            selectedGraphTrackId: oldTimeline.selectedGraphTrackId,
          });
      },
    },
    {
      commit: () => {
        if (newSession)
          useLipSyncStore.setState({
            currentVolume: 0,
            currentViseme: "sil",
            visemeConfidence: 0,
            error: null,
          });
      },
      rollback: () => {
        if (newSession)
          useLipSyncStore.setState({
            currentVolume: oldLip.currentVolume,
            currentViseme: oldLip.currentViseme,
            visemeConfidence: oldLip.visemeConfidence,
            error: oldLip.error,
          });
      },
    },
    {
      commit: () => {
        if (newSession)
          useVMCStore.setState({
            mappings: [],
            lastReceivedAt: null,
            faceChannelBuffer: {},
          });
      },
      rollback: () => {
        if (newSession)
          useVMCStore.setState({
            mappings: oldVmc.mappings,
            lastReceivedAt: oldVmc.lastReceivedAt,
            faceChannelBuffer: oldVmc.faceChannelBuffer,
          });
      },
    },
    history,
  ];
  let started = 0;
  try {
    if (
      useEditorStore.getState().project !== before.project ||
      useEditorStore.getState().projectV11 !== before.projectV11
    )
      throw new Error("PROJECT_SESSION_CHANGED");
    for (const part of parts) {
      started += 1;
      part.commit();
    }
  } catch {
    for (let index = started - 1; index >= 0; index -= 1) {
      try {
        parts[index]?.rollback();
      } catch {
        /* A throwing subscriber cannot prevent independent restoration. */
      }
    }
    if (started === 0) display?.rollback();
    throw new Error("PROJECT_TRANSACTION_FAILED");
  }
  try {
    display?.finalize();
  } catch {
    /* Retired-resource disposal cannot undo an accepted CPU commit. */
  }
  // Post-core UI updates cannot undo a successfully published transaction.
  try {
    const ids = new Set(flattenLayers(project?.layers ?? []).map((node) => node.id));
    const selection = useSelectionStore.getState();
    const selected = newSession
      ? []
      : selection.selectedLayerIds.filter((id) => ids.has(id));
    useSelectionStore.setState({
      selectedLayerId: selected.includes(selection.selectedLayerId ?? "")
        ? selection.selectedLayerId
        : (selected[0] ?? null),
      selectedLayerIds: selected,
      selectedLayerLookup: Object.fromEntries(selected.map((id) => [id, true as const])),
      soloLayerIds: newSession ? [] : selection.soloLayerIds.filter((id) => ids.has(id)),
    });
  } catch {
    /* A UI subscriber cannot change the core operation's outcome. */
  }
}

export function adoptProjectV11(
  project: ProjectData,
  session: V11EditorSession,
  filePath: string | null,
): void {
  publishProjectV11(() => {
    const before = useEditorStore.getState();
    before.projectV11?.display.assertUnchanged(getAllTextures());
    session.carrier.assertProject(project, session.revision);
    commitPrepared(
      before,
      {
        project,
        projectV11: { ...session, originalFilePath: filePath },
        currentFilePath: filePath,
        projectSourceKind: "none",
        projectVersion: increment(before.projectVersion),
        projectStructureVersion: increment(before.projectStructureVersion),
      },
      prepareHistoryClear(),
      true,
      true,
    );
  });
}

export function closeProjectV11(): boolean {
  if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
  if (!useEditorStore.getState().projectV11) return false;
  publishProjectV11(() => {
    const before = useEditorStore.getState();
    commitPrepared(
      before,
      {
        project: null,
        projectV11: null,
        currentFilePath: null,
        projectSourceKind: "none",
        projectVersion: increment(before.projectVersion),
        projectStructureVersion: increment(before.projectStructureVersion),
      },
      prepareHistoryClear(),
      true,
      true,
    );
  });
  return true;
}

export function adoptLegacyProjectFromV11(
  project: ProjectData,
  textures: ReadonlyMap<string, HTMLCanvasElement>,
  filePath: string | null,
  projectSourceKind: EditorState["projectSourceKind"],
): void {
  publishProjectV11(() => {
    const before = useEditorStore.getState();
    commitPrepared(
      before,
      {
        project,
        projectV11: null,
        currentFilePath: filePath,
        projectSourceKind,
        projectVersion: increment(before.projectVersion),
        projectStructureVersion: increment(before.projectStructureVersion),
      },
      prepareHistoryClear(),
      true,
      true,
      textures,
    );
  });
}

/** Disk may already contain the captured older revision. Never roll back edits or
 * mark a different session saved when a delayed write completes. */
export function markProjectV11Saved(
  captured: V11EditorSession,
  project: ProjectData,
  canonical: string,
  filePath: string,
): boolean {
  const current = useEditorStore.getState();
  if (current.projectV11?.carrier !== captured.carrier) return false;
  return publishProjectV11(() => {
    const previousSession = current.projectV11;
    if (!previousSession) return false;
    try {
      useEditorStore.setState({
        currentFilePath: filePath,
        projectV11: {
          ...previousSession,
          saved: { project, revision: captured.revision, canonical },
        },
      });
      return true;
    } catch {
      try {
        useEditorStore.setState({
          currentFilePath: current.currentFilePath,
          projectV11: previousSession,
        });
      } catch {
        /* Restore installed values despite subscriber throw. */
      }
      throw new Error("PROJECT_WRITTEN_METADATA_FAILED");
    }
  });
}

export function commitProjectV11Edit(
  project: ProjectData,
  options: {
    revision?: V11AtlasRevision;
    patches?: Patch[];
    inversePatches?: Patch[];
    mergeKey?: string;
  } = {},
): void {
  try {
    publishProjectV11(() => {
      const before = useEditorStore.getState(),
        session = before.projectV11;
      if (!session || !before.project) throw new Error("PROJECT_SESSION_CHANGED");
      const revision = options.revision ?? session.revision;
      session.display.assertUnchanged(getAllTextures());
      session.carrier.assertProject(project, revision);
      if (revision === session.revision && sameProjectValue(before.project, project))
        return;
      const atlasChanged = revision !== session.revision;
      const structure = atlasChanged || v11StructureChanged(before.project, project);
      const display = atlasChanged ? new V11AtlasDisplay(revision) : session.display;
      const nextSession = atlasChanged ? { ...session, revision, display } : session;
      const history = prepareV11HistoryEdit(before.project, revision, {
        ...options,
        effect: atlasChanged
          ? {
              kind: "v11-atlas",
              carrier: session.carrier,
              before: session.revision,
              after: revision,
            }
          : undefined,
      });
      commitPrepared(
        before,
        {
          project,
          projectV11: nextSession,
          projectStructureVersion: structure
            ? increment(before.projectStructureVersion)
            : before.projectStructureVersion,
        },
        history,
        false,
        true,
      );
    });
  } catch (error) {
    try {
      useNotificationStore.getState().addNotification("error", t("v11.editFailed"));
    } catch {
      /* No core mutation from notification failure. */
    }
    throw error;
  }
}

/** Exact JSON-shaped Editor values, including signed zero and own optional keys.
 * Only used after profile validation; no coercion or serialization normalization. */
function sameProjectValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const leftKeys = Object.keys(left),
    rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) &&
      sameProjectValue(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ),
  );
}

export function restoreProjectV11History(direction: "undo" | "redo"): boolean {
  if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
  if (!useEditorStore.getState().projectV11) return false;
  try {
    publishProjectV11(() => {
      const before = useEditorStore.getState(),
        session = before.projectV11;
      const stacks = useHistoryStore.getState();
      const entry = (direction === "undo" ? stacks.undoStack : stacks.redoStack).at(-1);
      if (!session || !before.project || !entry) return;
      session.display.assertUnchanged(getAllTextures());
      const effects = entry.effects ?? [];
      if (effects.length > 1 || effects.some((effect) => effect.kind !== "v11-atlas"))
        throw new Error("PROJECT_HISTORY_CONFLICT");
      const effect = effects[0];
      let revision = session.revision;
      if (effect?.kind === "v11-atlas") {
        if (
          effect.carrier !== session.carrier ||
          (direction === "undo" ? effect.after : effect.before) !== revision
        )
          throw new Error("PROJECT_HISTORY_CONFLICT");
        revision = direction === "undo" ? effect.before : effect.after;
      }
      const project =
        entry.kind === "snapshot"
          ? structuredClone(entry.snapshot)
          : applyPatches(
              before.project,
              direction === "undo" ? entry.inversePatches : entry.patches,
            );
      session.carrier.assertProject(project, revision);
      const reverse: HistoryEntry =
        entry.kind === "snapshot"
          ? {
              kind: "snapshot",
              snapshot: structuredClone(before.project),
              effects: entry.effects,
            }
          : entry;
      const nextSession =
        revision === session.revision
          ? session
          : { ...session, revision, display: new V11AtlasDisplay(revision) };
      const structure =
        revision !== session.revision || v11StructureChanged(before.project, project);
      commitPrepared(
        before,
        {
          project,
          projectV11: nextSession,
          projectStructureVersion: structure
            ? increment(before.projectStructureVersion)
            : before.projectStructureVersion,
        },
        prepareV11HistoryNavigation(direction, reverse, revision),
        false,
        true,
      );
    });
  } catch {
    try {
      useNotificationStore
        .getState()
        .addNotification(
          "error",
          t(direction === "undo" ? "notify.undoFailed" : "notify.redoFailed"),
        );
    } catch {
      /* Core state already restored. */
    }
  }
  return true;
}

registerV11ProjectEdit(commitProjectV11Edit);
registerV11HistoryRestore(restoreProjectV11History);
