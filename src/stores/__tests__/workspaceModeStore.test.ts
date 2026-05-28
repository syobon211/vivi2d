import { beforeEach, describe, expect, it } from "vitest";
import { migrateWorkspaceMode, useWorkspaceModeStore } from "@/stores/workspaceModeStore";

describe("workspaceModeStore", () => {
  beforeEach(() => {
    localStorage.removeItem("vivi2d-workspace-mode");
    useWorkspaceModeStore.setState({ mode: "default" });
  });

  it("defaults to the standard workspace", () => {
    expect(useWorkspaceModeStore.getState().mode).toBe("default");
  });

  it("can switch to the rigging workspace explicitly", () => {
    useWorkspaceModeStore.getState().setMode("rigging");
    expect(useWorkspaceModeStore.getState().mode).toBe("rigging");
  });

  it("can switch to the animation workspace explicitly", () => {
    useWorkspaceModeStore.getState().setMode("animation");
    expect(useWorkspaceModeStore.getState().mode).toBe("animation");
  });

  it("toggles between default and rigging workspace", () => {
    useWorkspaceModeStore.getState().toggleRiggingMode();
    expect(useWorkspaceModeStore.getState().mode).toBe("rigging");

    useWorkspaceModeStore.getState().toggleRiggingMode();
    expect(useWorkspaceModeStore.getState().mode).toBe("default");
  });

  it("persists the selected mode to localStorage", () => {
    useWorkspaceModeStore.getState().setMode("rigging");
    const raw = localStorage.getItem("vivi2d-workspace-mode");
    expect(raw).toContain('"mode":"rigging"');
  });

  it("migrate falls back to default when persisted mode is invalid", () => {
    expect(migrateWorkspaceMode({ mode: "broken" }, 1).mode).toBe("default");
    expect(migrateWorkspaceMode(undefined, 1).mode).toBe("default");
  });
});
