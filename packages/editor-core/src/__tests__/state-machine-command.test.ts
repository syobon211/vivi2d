import { describe, expect, it } from "vitest";
import {
  addCondition,
  addState,
  addStateMachine,
  addTransition,
  removeCondition,
  removeState,
  removeStateMachine,
  removeTransition,
  renameStateMachine,
  setInitialState,
  toggleStateMachine,
  updateCondition,
  updateState,
  updateTransition,
} from "../state-machine-command";
import { createProject } from "./fixtures";

function idFactory(ids: string[]): () => string {
  return () => ids.shift() ?? "unexpected-id";
}

describe("state machine commands", () => {
  it("creates, toggles, renames, and removes machines", () => {
    const project = createProject();

    const machineId = addStateMachine(project, "Locomotion", idFactory(["sm", "idle"]));

    expect(machineId).toBe("sm");
    expect(project.stateMachines).toHaveLength(1);
    expect(project.stateMachines[0]).toMatchObject({
      id: "sm",
      name: "Locomotion",
      enabled: true,
      initialStateId: "idle",
    });
    expect(project.stateMachines[0]?.states).toEqual([
      { id: "idle", name: "idle", loop: true },
    ]);
    expect(toggleStateMachine(project, "sm")).toBe(true);
    expect(project.stateMachines[0]?.enabled).toBe(false);
    expect(renameStateMachine(project, "sm", "Face")).toBe(true);
    expect(project.stateMachines[0]?.name).toBe("Face");
    expect(removeStateMachine(project, "missing")).toBe(false);
    expect(removeStateMachine(project, "sm")).toBe(true);
    expect(project.stateMachines).toEqual([]);
  });

  it("manages states and removes dependent transitions", () => {
    const project = createProject();
    addStateMachine(project, "Machine", idFactory(["sm", "idle"]));

    const walkId = addState(project, "sm", "walk", "clip-walk", true, () => "walk");
    const runId = addState(project, "sm", "run", undefined, false, () => "run");
    const transitionId = addTransition(project, "sm", walkId, runId, () => "t1");

    expect(walkId).toBe("walk");
    expect(runId).toBe("run");
    expect(project.stateMachines[0]?.states[1]).toMatchObject({
      id: "walk",
      name: "walk",
      clipId: "clip-walk",
      loop: true,
    });
    expect(setInitialState(project, "sm", walkId)).toBe(true);
    expect(project.stateMachines[0]?.initialStateId).toBe(walkId);
    expect(updateState(project, "sm", runId, { name: "sprint", loop: true })).toBe(
      true,
    );
    expect(project.stateMachines[0]?.states[2]).toMatchObject({
      id: "run",
      name: "sprint",
      loop: true,
    });
    expect(transitionId).toBe("t1");
    expect(removeState(project, "sm", walkId)).toBe(true);
    expect(project.stateMachines[0]?.initialStateId).toBe("idle");
    expect(project.stateMachines[0]?.transitions).toEqual([]);
  });

  it("does not remove the final state", () => {
    const project = createProject();
    addStateMachine(project, "Machine", idFactory(["sm", "idle"]));

    expect(removeState(project, "sm", "idle")).toBe(false);
    expect(project.stateMachines[0]?.states).toHaveLength(1);
  });

  it("manages transitions and conditions", () => {
    const project = createProject();
    addStateMachine(project, "Machine", idFactory(["sm", "idle"]));
    addState(project, "sm", "walk", undefined, false, () => "walk");
    const transitionId = addTransition(project, "sm", "*", "walk", () => "t1");

    expect(transitionId).toBe("t1");
    expect(project.stateMachines[0]?.transitions[0]).toMatchObject({
      id: "t1",
      fromStateId: "*",
      toStateId: "walk",
      transitionDuration: 0.3,
      priority: 0,
    });
    expect(
      updateTransition(project, "sm", "t1", {
        fromStateId: "idle",
        transitionDuration: Number.NaN,
        priority: 5,
      }),
    ).toBe(true);
    expect(project.stateMachines[0]?.transitions[0]).toMatchObject({
      fromStateId: "idle",
      transitionDuration: 0.3,
      priority: 5,
    });

    const condition = {
      parameterId: "speed",
      operator: ">",
      threshold: Number.POSITIVE_INFINITY,
    } as const;
    expect(addCondition(project, "sm", "t1", condition)).toBe(true);
    expect(project.stateMachines[0]?.transitions[0]?.conditions[0]).toEqual({
      parameterId: "speed",
      operator: ">",
      threshold: 0,
    });
    expect(
      updateCondition(project, "sm", "t1", 0, { operator: "<=", threshold: 0.7 }),
    ).toBe(true);
    expect(project.stateMachines[0]?.transitions[0]?.conditions[0]).toMatchObject({
      operator: "<=",
      threshold: 0.7,
    });
    expect(removeCondition(project, "sm", "t1", 99)).toBe(false);
    expect(removeCondition(project, "sm", "t1", 0)).toBe(true);
    expect(removeTransition(project, "sm", "t1")).toBe(true);
    expect(project.stateMachines[0]?.transitions).toEqual([]);
  });

  it("returns empty ids and false for missing targets", () => {
    const project = createProject();

    expect(addState(project, "missing", "state", undefined, false, () => "unused")).toBe(
      "",
    );
    expect(addTransition(project, "missing", "a", "b", () => "unused")).toBe("");
    expect(toggleStateMachine(project, "missing")).toBe(false);
    expect(renameStateMachine(project, "missing", "name")).toBe(false);
    expect(setInitialState(project, "missing", "state")).toBe(false);
    expect(updateState(project, "missing", "state", { name: "new" })).toBe(false);
    expect(updateTransition(project, "missing", "transition", { priority: 1 })).toBe(
      false,
    );
    expect(
      addCondition(project, "missing", "transition", {
        parameterId: "p",
        operator: ">",
        threshold: 0,
      }),
    ).toBe(false);
  });

  it("clones nested updates supplied by callers", () => {
    const project = createProject();
    addStateMachine(project, "Machine", idFactory(["sm", "idle"]));
    const blendTree = {
      parameterId: "speed",
      entries: [{ threshold: 0, clipId: "walk" }],
    };

    updateState(project, "sm", "idle", { blendTree });
    blendTree.entries[0]!.clipId = "mutated";

    expect(project.stateMachines[0]?.states[0]?.blendTree?.entries[0]?.clipId).toBe(
      "walk",
    );
  });
});
