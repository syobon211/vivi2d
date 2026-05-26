import {
  buildSoftRegionHelperPlan,
  type SoftRegionPresetId,
} from "./soft-region-helper";

export type PuppetWarpMode = "vertex" | "puppet";
export type MeshEditTarget = "mesh" | "clip";
export type PuppetWarpPinKind = "handle" | "anchor";
export type PuppetWarpFalloffCurve = "linear" | "smoothstep" | "gaussian";

export interface PuppetWarpPin {
  id: string;
  meshId: string;
  vertexIndex: number;
  kind: PuppetWarpPinKind;
  radius: number;
  strength: number;
  curve: PuppetWarpFalloffCurve;
  groupId: string | null;
  mirrorPinId: string | null;
}

export interface PuppetWarpGroup {
  id: string;
  meshId: string;
  name: string;
  pinIds: string[];
  managedTag?: string;
  managedSignature?: string;
}

export interface PuppetWarpDragState {
  meshId: string;
  baseVertices: number[];
  draggedPinIds: string[];
  startWorldX: number;
  startWorldY: number;
  mergeKey: string;
  lastAppliedVertices: number[] | null;
  editTarget: MeshEditTarget;
  clipId: string | null;
  frame: number | null;
  restoreVertices: number[] | null;
  restoreInterpolation: "step" | "linear" | null;
}

export interface PuppetWarpState {
  mode: PuppetWarpMode;
  editTarget: MeshEditTarget;
  pinsByMeshId: Record<string, PuppetWarpPin[]>;
  groupsByMeshId: Record<string, PuppetWarpGroup[]>;
  selectedPinIds: string[];
  symmetryEnabled: boolean;
  symmetryTolerance: number;
  dragState: PuppetWarpDragState | null;
}

export type SoftRegionHelperApplyResult =
  | {
      status: "created" | "updated";
      groupId: string;
      managedSignature: string;
    }
  | {
      status: "rejected";
      reason:
        | "tooFewVertices"
        | "invalidVertexSelection"
        | "selectionTooDegenerate"
        | "occupiedByOtherPin";
    };

const DEFAULT_RADIUS = 48;
const DEFAULT_STRENGTH = 1;
const DEFAULT_CURVE: PuppetWarpFalloffCurve = "smoothstep";
export const DEFAULT_SYMMETRY_TOLERANCE = 4;

function getPins(state: PuppetWarpState, meshId: string): PuppetWarpPin[] {
  return state.pinsByMeshId[meshId] ?? [];
}

function getGroups(state: PuppetWarpState, meshId: string): PuppetWarpGroup[] {
  return state.groupsByMeshId[meshId] ?? [];
}

function findPinLocation(
  state: PuppetWarpState,
  pinId: string,
): { meshId: string; index: number } | null {
  for (const [meshId, pins] of Object.entries(state.pinsByMeshId)) {
    const index = pins.findIndex((pin) => pin.id === pinId);
    if (index !== -1) return { meshId, index };
  }
  return null;
}

function hasOccupiedVertex(
  state: PuppetWarpState,
  meshId: string,
  vertexIndex: number,
): boolean {
  return getPins(state, meshId).some((pin) => pin.vertexIndex === vertexIndex);
}

function createPin(
  meshId: string,
  vertexIndex: number,
  kind: PuppetWarpPinKind,
  partial?: Partial<
    Pick<PuppetWarpPin, "radius" | "strength" | "curve" | "groupId" | "mirrorPinId">
  >,
): PuppetWarpPin {
  return {
    id: crypto.randomUUID(),
    meshId,
    vertexIndex,
    kind,
    radius: partial?.radius ?? DEFAULT_RADIUS,
    strength: partial?.strength ?? DEFAULT_STRENGTH,
    curve: partial?.curve ?? DEFAULT_CURVE,
    groupId: partial?.groupId ?? null,
    mirrorPinId: partial?.mirrorPinId ?? null,
  };
}

function filterExistingPinIds(state: PuppetWarpState, pinIds: string[]): string[] {
  const ids = new Set<string>();
  for (const pins of Object.values(state.pinsByMeshId)) {
    for (const pin of pins) ids.add(pin.id);
  }
  return pinIds.filter(
    (pinId, index) => ids.has(pinId) && pinIds.indexOf(pinId) === index,
  );
}

export function cloneDragState(
  dragState: PuppetWarpDragState | null,
): PuppetWarpDragState | null {
  if (!dragState) return null;
  return {
    ...dragState,
    baseVertices: [...dragState.baseVertices],
    draggedPinIds: [...dragState.draggedPinIds],
    lastAppliedVertices: dragState.lastAppliedVertices
      ? [...dragState.lastAppliedVertices]
      : null,
    restoreVertices: dragState.restoreVertices ? [...dragState.restoreVertices] : null,
  };
}

export const INITIAL_PUPPET_WARP_STATE: PuppetWarpState = {
  mode: "vertex",
  editTarget: "mesh",
  pinsByMeshId: {},
  groupsByMeshId: {},
  selectedPinIds: [],
  symmetryEnabled: false,
  symmetryTolerance: DEFAULT_SYMMETRY_TOLERANCE,
  dragState: null,
};

export function addPinToState(
  state: PuppetWarpState,
  meshId: string,
  vertexIndex: number,
  kind: PuppetWarpPinKind,
  partial?: Partial<
    Pick<PuppetWarpPin, "radius" | "strength" | "curve" | "groupId" | "mirrorPinId">
  >,
): { state: PuppetWarpState; pinId: string | null } {
  if (hasOccupiedVertex(state, meshId, vertexIndex)) {
    return { state, pinId: null };
  }
  const pin = createPin(meshId, vertexIndex, kind, partial);
  return {
    state: {
      ...state,
      pinsByMeshId: {
        ...state.pinsByMeshId,
        [meshId]: [...getPins(state, meshId), pin],
      },
    },
    pinId: pin.id,
  };
}

export function replacePinAtVertexInState(
  state: PuppetWarpState,
  meshId: string,
  vertexIndex: number,
  kind: PuppetWarpPinKind,
  partial?: Partial<
    Pick<PuppetWarpPin, "radius" | "strength" | "curve" | "groupId" | "mirrorPinId">
  >,
): { state: PuppetWarpState; pinId: string } {
  const existing = getPins(state, meshId).find((pin) => pin.vertexIndex === vertexIndex);
  const pin = createPin(meshId, vertexIndex, kind, partial);

  const nextPins = getPins(state, meshId)
    .filter((entry) => entry.vertexIndex !== vertexIndex)
    .map((entry) =>
      existing && entry.mirrorPinId === existing.id
        ? { ...entry, mirrorPinId: null }
        : entry,
    );
  const nextGroups = getGroups(state, meshId)
    .map((group) => ({
      ...group,
      pinIds: group.pinIds.filter((pinId) => pinId !== existing?.id),
    }))
    .filter((group) => group.pinIds.length > 0);

  return {
    state: {
      ...state,
      pinsByMeshId: {
        ...state.pinsByMeshId,
        [meshId]: [...nextPins, pin],
      },
      groupsByMeshId: {
        ...state.groupsByMeshId,
        [meshId]: nextGroups,
      },
      selectedPinIds: state.selectedPinIds.filter((pinId) => pinId !== existing?.id),
    },
    pinId: pin.id,
  };
}

export function removePinsFromState(
  state: PuppetWarpState,
  pinIds: string[],
): { state: PuppetWarpState; cancelledDrag: PuppetWarpDragState | null } {
  const ids = new Set(pinIds);
  const nextPinsByMeshId: Record<string, PuppetWarpPin[]> = {};
  const nextGroupsByMeshId: Record<string, PuppetWarpGroup[]> = {};

  for (const [meshId, pins] of Object.entries(state.pinsByMeshId)) {
    const removedMirrorIds = new Set(
      pins.filter((pin) => ids.has(pin.id)).map((pin) => pin.id),
    );
    const nextPins = pins
      .filter((pin) => !ids.has(pin.id))
      .map((pin) =>
        pin.mirrorPinId !== null && removedMirrorIds.has(pin.mirrorPinId)
          ? { ...pin, mirrorPinId: null, groupId: pin.groupId }
          : pin,
      );
    if (nextPins.length > 0) nextPinsByMeshId[meshId] = nextPins;
  }

  for (const [meshId, groups] of Object.entries(state.groupsByMeshId)) {
    const kept = groups
      .map((group) => ({
        ...group,
        pinIds: group.pinIds.filter((pinId) => !ids.has(pinId)),
      }))
      .filter((group) => group.pinIds.length > 0);
    if (kept.length > 0) nextGroupsByMeshId[meshId] = kept;
  }

  const nextSelectedPinIds = state.selectedPinIds.filter((pinId) => !ids.has(pinId));
  const dragState = state.dragState;
  const shouldCancelDrag = dragState?.draggedPinIds.some((pinId) => ids.has(pinId));

  return {
    state: {
      ...state,
      pinsByMeshId: nextPinsByMeshId,
      groupsByMeshId: nextGroupsByMeshId,
      selectedPinIds: nextSelectedPinIds,
      dragState: shouldCancelDrag ? null : dragState,
    },
    cancelledDrag: shouldCancelDrag ? cloneDragState(dragState) : null,
  };
}

export function clearPinsForMeshInState(
  state: PuppetWarpState,
  meshId: string,
): PuppetWarpState {
  const nextPinsByMeshId = { ...state.pinsByMeshId };
  delete nextPinsByMeshId[meshId];
  const nextGroupsByMeshId = { ...state.groupsByMeshId };
  delete nextGroupsByMeshId[meshId];
  const meshPinIds = new Set(getPins(state, meshId).map((pin) => pin.id));
  return {
    ...state,
    pinsByMeshId: nextPinsByMeshId,
    groupsByMeshId: nextGroupsByMeshId,
    selectedPinIds: state.selectedPinIds.filter((pinId) => !meshPinIds.has(pinId)),
    dragState: state.dragState?.meshId === meshId ? null : state.dragState,
  };
}

export function createGroupInState(
  state: PuppetWarpState,
  meshId: string,
  pinIds: string[],
  name: string,
): { state: PuppetWarpState; groupId: string | null } {
  const pins = getPins(state, meshId);
  const validPinIds = pinIds.filter((pinId, index) => {
    return index === pinIds.indexOf(pinId) && pins.some((pin) => pin.id === pinId);
  });
  if (validPinIds.length === 0) return { state, groupId: null };

  const groupId = crypto.randomUUID();
  const nextGroups = getGroups(state, meshId)
    .map((group) => ({
      ...group,
      pinIds: group.pinIds.filter((pinId) => !validPinIds.includes(pinId)),
    }))
    .filter((group) => group.pinIds.length > 0);
  nextGroups.push({ id: groupId, meshId, name, pinIds: validPinIds });

  return {
    state: {
      ...state,
      groupsByMeshId: {
        ...state.groupsByMeshId,
        [meshId]: nextGroups,
      },
      pinsByMeshId: {
        ...state.pinsByMeshId,
        [meshId]: getPins(state, meshId).map((pin) =>
          validPinIds.includes(pin.id) ? { ...pin, groupId } : pin,
        ),
      },
    },
    groupId,
  };
}

export function applySoftRegionHelperToState(
  state: PuppetWarpState,
  args: {
    meshId: string;
    meshVertices: number[];
    selectedVertexIndices: number[];
    presetId: SoftRegionPresetId;
  },
): { state: PuppetWarpState; result: SoftRegionHelperApplyResult } {
  const { meshId, meshVertices, selectedVertexIndices, presetId } = args;
  const pins = getPins(state, meshId);
  const groups = getGroups(state, meshId);
  const planResult = buildSoftRegionHelperPlan(
    meshId,
    meshVertices,
    selectedVertexIndices,
    presetId,
  );
  if (planResult.status === "rejected" || !planResult.plan) {
    return {
      state,
      result: {
        status: "rejected",
        reason: planResult.reason ?? "selectionTooDegenerate",
      },
    };
  }

  const { plan } = planResult;
  const existingGroup = groups.find(
    (group) =>
      group.managedTag === plan.managedTag &&
      group.managedSignature === plan.managedSignature,
  );
  const reusablePinIds = new Set(existingGroup?.pinIds ?? []);
  const plannedVertices = new Set(plan.pins.map((pin) => pin.vertexIndex));
  const occupiedByOtherPin = pins.some(
    (pin) => plannedVertices.has(pin.vertexIndex) && !reusablePinIds.has(pin.id),
  );
  if (occupiedByOtherPin) {
    return {
      state,
      result: { status: "rejected", reason: "occupiedByOtherPin" },
    };
  }

  const nextPins = pins.filter((pin) => !reusablePinIds.has(pin.id));
  const nextSelectedPinIds = state.selectedPinIds.filter(
    (pinId) => !reusablePinIds.has(pinId),
  );
  const groupId = existingGroup?.id ?? crypto.randomUUID();
  const createdPins = plan.pins.map((pinPlan) =>
    createPin(meshId, pinPlan.vertexIndex, pinPlan.kind, {
      radius: pinPlan.radius,
      strength: pinPlan.strength,
      curve: pinPlan.curve,
      groupId,
    }),
  );
  const nextGroups = groups.filter((group) => group.id !== existingGroup?.id);
  nextGroups.push({
    id: groupId,
    meshId,
    name: plan.groupName,
    pinIds: createdPins.map((pin) => pin.id),
    managedTag: plan.managedTag,
    managedSignature: plan.managedSignature,
  });

  return {
    state: {
      ...state,
      pinsByMeshId: {
        ...state.pinsByMeshId,
        [meshId]: [...nextPins, ...createdPins],
      },
      groupsByMeshId: {
        ...state.groupsByMeshId,
        [meshId]: nextGroups,
      },
      selectedPinIds: [...nextSelectedPinIds, ...createdPins.map((pin) => pin.id)],
    },
    result: {
      status: existingGroup ? "updated" : "created",
      groupId,
      managedSignature: plan.managedSignature,
    },
  };
}

export function removeGroupFromState(
  state: PuppetWarpState,
  groupId: string,
): PuppetWarpState {
  let targetMeshId: string | null = null;
  let groupPinIds: string[] = [];
  for (const [meshId, groups] of Object.entries(state.groupsByMeshId)) {
    const group = groups.find((entry) => entry.id === groupId);
    if (group) {
      targetMeshId = meshId;
      groupPinIds = group.pinIds;
      break;
    }
  }
  if (!targetMeshId) return state;
  return {
    ...state,
    groupsByMeshId: {
      ...state.groupsByMeshId,
      [targetMeshId]: getGroups(state, targetMeshId).filter(
        (group) => group.id !== groupId,
      ),
    },
    pinsByMeshId: {
      ...state.pinsByMeshId,
      [targetMeshId]: getPins(state, targetMeshId).map((pin) =>
        groupPinIds.includes(pin.id) ? { ...pin, groupId: null } : pin,
      ),
    },
  };
}

export function setSelectedPinsInState(
  state: PuppetWarpState,
  pinIds: string[],
): PuppetWarpState {
  return {
    ...state,
    selectedPinIds: filterExistingPinIds(state, pinIds),
  };
}

export function togglePinSelectionInState(
  state: PuppetWarpState,
  pinId: string,
): PuppetWarpState {
  const exists = state.selectedPinIds.includes(pinId);
  return {
    ...state,
    selectedPinIds: exists
      ? state.selectedPinIds.filter((id) => id !== pinId)
      : filterExistingPinIds(state, [...state.selectedPinIds, pinId]),
  };
}

export function setPinFalloffInState(
  state: PuppetWarpState,
  pinIds: string[],
  patch: Partial<Pick<PuppetWarpPin, "radius" | "strength" | "curve">>,
): PuppetWarpState {
  const ids = new Set(pinIds);
  const nextPinsByMeshId: Record<string, PuppetWarpPin[]> = {};
  for (const [meshId, pins] of Object.entries(state.pinsByMeshId)) {
    nextPinsByMeshId[meshId] = pins.map((pin) =>
      ids.has(pin.id)
        ? {
            ...pin,
            radius: patch.radius ?? pin.radius,
            strength: patch.strength ?? pin.strength,
            curve: patch.curve ?? pin.curve,
          }
        : pin,
    );
  }
  return {
    ...state,
    pinsByMeshId: nextPinsByMeshId,
  };
}

export function normalizeSymmetryTolerance(value: number): number {
  return Number.isFinite(value) && !Number.isNaN(value)
    ? Math.max(0, Math.round(value))
    : DEFAULT_SYMMETRY_TOLERANCE;
}

export function linkMirrorPinsInState(
  state: PuppetWarpState,
  pinId: string,
  mirrorPinId: string,
): PuppetWarpState {
  const left = findPinLocation(state, pinId);
  const right = findPinLocation(state, mirrorPinId);
  if (!left || !right || left.meshId !== right.meshId) return state;
  const meshId = left.meshId;
  return {
    ...state,
    pinsByMeshId: {
      ...state.pinsByMeshId,
      [meshId]: getPins(state, meshId).map((pin) => {
        if (
          (pin.mirrorPinId === pinId && pin.id !== mirrorPinId) ||
          (pin.mirrorPinId === mirrorPinId && pin.id !== pinId)
        ) {
          return { ...pin, mirrorPinId: null };
        }
        if (pin.id === pinId) return { ...pin, mirrorPinId };
        if (pin.id === mirrorPinId) return { ...pin, mirrorPinId: pinId };
        return pin;
      }),
    },
  };
}

export function beginDragState(
  state: PuppetWarpState,
  meshId: string,
  baseVertices: number[],
  draggedPinIds: string[],
  startWorldX: number,
  startWorldY: number,
  options?: Partial<
    Pick<
      PuppetWarpDragState,
      "editTarget" | "clipId" | "frame" | "restoreVertices" | "restoreInterpolation"
    >
  >,
): PuppetWarpState {
  return {
    ...state,
    dragState: {
      meshId,
      baseVertices: [...baseVertices],
      draggedPinIds: [...draggedPinIds],
      startWorldX,
      startWorldY,
      mergeKey: `puppet-warp:${meshId}:${crypto.randomUUID()}`,
      lastAppliedVertices: null,
      editTarget: options?.editTarget ?? "mesh",
      clipId: options?.clipId ?? null,
      frame: options?.frame ?? null,
      restoreVertices: options?.restoreVertices ? [...options.restoreVertices] : null,
      restoreInterpolation: options?.restoreInterpolation ?? null,
    },
  };
}

export function updateDragState(
  state: PuppetWarpState,
  lastAppliedVertices: number[],
): PuppetWarpState {
  return {
    ...state,
    dragState: state.dragState
      ? {
          ...state.dragState,
          lastAppliedVertices: [...lastAppliedVertices],
        }
      : null,
  };
}

export function cancelDragState(state: PuppetWarpState): {
  state: PuppetWarpState;
  dragState: PuppetWarpDragState | null;
} {
  return {
    state: {
      ...state,
      dragState: null,
    },
    dragState: cloneDragState(state.dragState),
  };
}

export function commitDragState(state: PuppetWarpState): PuppetWarpState {
  return {
    ...state,
    dragState: null,
  };
}
