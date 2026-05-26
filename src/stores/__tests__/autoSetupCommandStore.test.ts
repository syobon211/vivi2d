import { beforeEach, describe, expect, it } from "vitest";
import { useAutoSetupCommandStore } from "@/stores/autoSetupCommandStore";
import { resetAllStores } from "@/test/store-reset";

describe("autoSetupCommandStore", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("consumes a compatible command exactly once", () => {
    useAutoSetupCommandStore.getState().requestCommand({
      kind: "readyToRig",
      projectKey: "project-a",
      projectStructureVersion: 3,
      requestedAt: 1,
    });

    const consumed = useAutoSetupCommandStore
      .getState()
      .consumeCompatibleCommand("project-a", 3);

    expect(consumed?.kind).toBe("readyToRig");
    expect(useAutoSetupCommandStore.getState().pendingCommand).toBeNull();
    expect(
      useAutoSetupCommandStore.getState().consumeCompatibleCommand("project-a", 3),
    ).toBeNull();
  });

  it("clears a stale command on project mismatch", () => {
    useAutoSetupCommandStore.getState().requestCommand({
      kind: "leftRightRepair",
      projectKey: "project-a",
      projectStructureVersion: 3,
      requestedAt: 1,
    });

    const consumed = useAutoSetupCommandStore
      .getState()
      .consumeCompatibleCommand("project-b", 3);

    expect(consumed).toBeNull();
    expect(useAutoSetupCommandStore.getState().pendingCommand).toBeNull();
  });

  it("clears a pending command when the active project changes", () => {
    useAutoSetupCommandStore.getState().requestCommand({
      kind: "mouthRig",
      projectKey: "project-a",
      projectStructureVersion: 3,
      requestedAt: 1,
    });

    useAutoSetupCommandStore.getState().clearCommandIfProjectChanged("project-b", 3);
    expect(useAutoSetupCommandStore.getState().pendingCommand).toBeNull();
  });
});
