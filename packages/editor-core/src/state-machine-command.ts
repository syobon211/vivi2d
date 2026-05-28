import type {
  AnimationState,
  AnimationStateMachine,
  ProjectData,
  StateTransition,
  TransitionCondition,
} from "@vivi2d/core/types";

const defaultCreateId = () => crypto.randomUUID();

function getMachines(project: ProjectData): AnimationStateMachine[] {
  return project.stateMachines;
}

function findMachine(
  project: ProjectData,
  machineId: string,
): AnimationStateMachine | undefined {
  return getMachines(project).find((machine) => machine.id === machineId);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function cloneCondition(condition: TransitionCondition): TransitionCondition {
  return {
    parameterId: condition.parameterId,
    operator: condition.operator,
    threshold: finiteOr(condition.threshold, 0),
  };
}

function cloneBlendTree(
  blendTree: AnimationState["blendTree"],
): AnimationState["blendTree"] {
  if (!blendTree) return blendTree;
  return {
    parameterId: blendTree.parameterId,
    entries: blendTree.entries.map((entry) => ({ ...entry })),
  };
}

export function addStateMachine(
  project: ProjectData,
  name: string,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  const initialStateId = createId();
  getMachines(project).push({
    id,
    name,
    states: [{ id: initialStateId, name: "idle", loop: true }],
    transitions: [],
    initialStateId,
    enabled: true,
  });
  return id;
}

export function removeStateMachine(project: ProjectData, machineId: string): boolean {
  const machines = getMachines(project);
  const index = machines.findIndex((machine) => machine.id === machineId);
  if (index === -1) return false;
  machines.splice(index, 1);
  return true;
}

export function toggleStateMachine(project: ProjectData, machineId: string): boolean {
  const machine = findMachine(project, machineId);
  if (!machine) return false;
  machine.enabled = !machine.enabled;
  return true;
}

export function renameStateMachine(
  project: ProjectData,
  machineId: string,
  name: string,
): boolean {
  const machine = findMachine(project, machineId);
  if (!machine) return false;
  machine.name = name;
  return true;
}

export function setInitialState(
  project: ProjectData,
  machineId: string,
  stateId: string,
): boolean {
  const machine = findMachine(project, machineId);
  if (!machine?.states.some((state) => state.id === stateId)) return false;
  machine.initialStateId = stateId;
  return true;
}

export function addState(
  project: ProjectData,
  machineId: string,
  name: string,
  clipId?: string,
  loop = false,
  createId: () => string = defaultCreateId,
): string {
  const machine = findMachine(project, machineId);
  if (!machine) return "";

  const stateId = createId();
  const state: AnimationState = { id: stateId, name, loop };
  if (clipId) state.clipId = clipId;
  machine.states.push(state);
  return stateId;
}

export function removeState(
  project: ProjectData,
  machineId: string,
  stateId: string,
): boolean {
  const machine = findMachine(project, machineId);
  if (!machine || machine.states.length <= 1) return false;

  const beforeCount = machine.states.length;
  machine.states = machine.states.filter((state) => state.id !== stateId);
  if (machine.states.length === beforeCount) return false;

  machine.transitions = machine.transitions.filter(
    (transition) =>
      transition.fromStateId !== stateId && transition.toStateId !== stateId,
  );
  if (machine.initialStateId === stateId) {
    machine.initialStateId = machine.states[0]!.id;
  }
  return true;
}

export function updateState(
  project: ProjectData,
  machineId: string,
  stateId: string,
  updates: Partial<Omit<AnimationState, "id">>,
): boolean {
  const machine = findMachine(project, machineId);
  const state = machine?.states.find((entry) => entry.id === stateId);
  if (!state) return false;

  if ("name" in updates && updates.name !== undefined) state.name = updates.name;
  if ("loop" in updates && updates.loop !== undefined) state.loop = updates.loop;
  if ("clipId" in updates) state.clipId = updates.clipId;
  if ("blendTree" in updates) state.blendTree = cloneBlendTree(updates.blendTree);
  return true;
}

export function addTransition(
  project: ProjectData,
  machineId: string,
  fromStateId: string,
  toStateId: string,
  createId: () => string = defaultCreateId,
): string {
  const machine = findMachine(project, machineId);
  if (!machine) return "";

  const id = createId();
  machine.transitions.push({
    id,
    fromStateId,
    toStateId,
    conditions: [],
    transitionDuration: 0.3,
    priority: 0,
  });
  return id;
}

export function removeTransition(
  project: ProjectData,
  machineId: string,
  transitionId: string,
): boolean {
  const machine = findMachine(project, machineId);
  if (!machine) return false;
  const beforeCount = machine.transitions.length;
  machine.transitions = machine.transitions.filter(
    (transition) => transition.id !== transitionId,
  );
  return machine.transitions.length !== beforeCount;
}

export function updateTransition(
  project: ProjectData,
  machineId: string,
  transitionId: string,
  updates: Partial<Omit<StateTransition, "id" | "conditions">>,
): boolean {
  const machine = findMachine(project, machineId);
  const transition = machine?.transitions.find((entry) => entry.id === transitionId);
  if (!transition) return false;

  if ("fromStateId" in updates && updates.fromStateId !== undefined) {
    transition.fromStateId = updates.fromStateId;
  }
  if ("toStateId" in updates && updates.toStateId !== undefined) {
    transition.toStateId = updates.toStateId;
  }
  if (
    "transitionDuration" in updates &&
    updates.transitionDuration !== undefined
  ) {
    transition.transitionDuration = finiteOr(
      updates.transitionDuration,
      transition.transitionDuration,
    );
  }
  if ("priority" in updates && updates.priority !== undefined) {
    transition.priority = finiteOr(updates.priority, transition.priority);
  }
  return true;
}

export function addCondition(
  project: ProjectData,
  machineId: string,
  transitionId: string,
  condition: TransitionCondition,
): boolean {
  const machine = findMachine(project, machineId);
  const transition = machine?.transitions.find((entry) => entry.id === transitionId);
  if (!transition) return false;
  transition.conditions.push(cloneCondition(condition));
  return true;
}

export function removeCondition(
  project: ProjectData,
  machineId: string,
  transitionId: string,
  index: number,
): boolean {
  const machine = findMachine(project, machineId);
  const transition = machine?.transitions.find((entry) => entry.id === transitionId);
  if (!transition || index < 0 || index >= transition.conditions.length) {
    return false;
  }
  transition.conditions.splice(index, 1);
  return true;
}

export function updateCondition(
  project: ProjectData,
  machineId: string,
  transitionId: string,
  index: number,
  updates: Partial<TransitionCondition>,
): boolean {
  const machine = findMachine(project, machineId);
  const transition = machine?.transitions.find((entry) => entry.id === transitionId);
  if (!transition || index < 0 || index >= transition.conditions.length) {
    return false;
  }

  const condition = transition.conditions[index]!;
  if ("parameterId" in updates && updates.parameterId !== undefined) {
    condition.parameterId = updates.parameterId;
  }
  if ("operator" in updates && updates.operator !== undefined) {
    condition.operator = updates.operator;
  }
  if ("threshold" in updates && updates.threshold !== undefined) {
    condition.threshold = finiteOr(updates.threshold, condition.threshold);
  }
  return true;
}
