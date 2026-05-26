import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { useI18nStore } from "@/lib/i18n";
import { useThemeStore } from "@/stores/themeStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";
import { resetAllStores } from "@/test/store-reset";

vi.mock("@/components/AppRuntimeHost", () => ({
  AppRuntimeHost: () => null,
}));
vi.mock("@/components/Canvas", () => ({
  Canvas: () => <div>Canvas</div>,
}));
vi.mock("@/components/ColliderPanel", () => ({
  ColliderPanel: () => <div>ColliderPanel</div>,
}));
vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ExpressionPresetPanel", () => ({
  ExpressionPresetPanel: () => <div>ExpressionPresetPanel</div>,
}));
vi.mock("@/components/IKPanel", () => ({
  IKPanel: () => <div>IKPanel</div>,
}));
vi.mock("@/components/LayerPanel", () => ({
  LayerPanel: () => <div>LayerPanel</div>,
}));
vi.mock("@/components/LipSyncPanel", () => ({
  LipSyncPanel: () => <div>LipSyncPanel</div>,
}));
vi.mock("@/components/MenuBar", () => ({
  MenuBar: () => <div>MenuBar</div>,
}));
vi.mock("@/components/NotificationToast", () => ({
  NotificationToast: () => <div>NotificationToast</div>,
}));
vi.mock("@/components/OffscreenPanel", () => ({
  OffscreenPanel: () => <div>OffscreenPanel</div>,
}));
vi.mock("@/components/PanelErrorBoundary", () => ({
  PanelErrorBoundary: ({
    children,
    panelName,
  }: {
    children: React.ReactNode;
    panelName: string;
  }) => <div data-testid={`boundary-${panelName}`}>{children}</div>,
}));
vi.mock("@/components/ParameterPanel", () => ({
  ParameterPanel: () => <div>ParameterPanel</div>,
}));
vi.mock("@/components/PhysicsPanel", () => ({
  PhysicsPanel: () => <div>PhysicsPanel</div>,
}));
vi.mock("@/components/PropertiesPanel", () => ({
  PropertiesPanel: () => <div>PropertiesPanel</div>,
}));
vi.mock("@/components/SceneBlendPanel", () => ({
  SceneBlendPanel: () => <div>SceneBlendPanel</div>,
}));
vi.mock("@/components/StateMachinePanel", () => ({
  StateMachinePanel: () => <div>StateMachinePanel</div>,
}));
vi.mock("@/components/TimelinePanel", () => ({
  TimelinePanel: () => <div>TimelinePanel</div>,
}));
vi.mock("@/components/VMCPanel", () => ({
  VMCPanel: () => <div>VMCPanel</div>,
}));
vi.mock("@/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: () => undefined,
}));
vi.mock("@/hooks/useProjectImportDrop", () => ({
  useProjectImportDrop: () => undefined,
}));

function panelShell(name: string): HTMLElement {
  const shell = document.querySelector<HTMLElement>(`[data-panel-name="${name}"]`);
  if (!shell) {
    throw new Error(`Missing panel shell: ${name}`);
  }
  return shell;
}

describe("App workspace mode shell", () => {
  beforeEach(() => {
    resetAllStores();
    useThemeStore.getState().setTheme("dark");
    useI18nStore.getState().setLocale("en");
  });

  it("renders the default workspace with authoring panels visible", () => {
    render(<App />);

    const workspace = document.querySelector<HTMLElement>(".workspace");
    expect(workspace?.dataset.workspaceMode).toBe("default");
    expect(panelShell("ParameterPanel")).not.toHaveAttribute("hidden");
    expect(panelShell("ExpressionPresetPanel")).not.toHaveAttribute("hidden");
    expect(panelShell("TimelinePanel")).not.toHaveAttribute("hidden");
  });

  it("keeps timeline mounted while hiding non-rigging panels in rigging mode", () => {
    useWorkspaceModeStore.getState().setMode("rigging");
    render(<App />);

    const workspace = document.querySelector<HTMLElement>(".workspace");
    expect(workspace?.dataset.workspaceMode).toBe("rigging");

    expect(panelShell("TimelinePanel")).not.toHaveAttribute("hidden");
    expect(panelShell("LayerPanel")).not.toHaveAttribute("hidden");
    expect(panelShell("PropertiesPanel")).not.toHaveAttribute("hidden");

    expect(panelShell("ParameterPanel")).toHaveAttribute("hidden");
    expect(panelShell("ExpressionPresetPanel")).toHaveAttribute("hidden");
    expect(panelShell("VMCPanel")).toHaveAttribute("hidden");
  });

  it("restores the default workspace without remounting the shell wrappers", () => {
    render(<App />);

    act(() => {
      useWorkspaceModeStore.getState().setMode("rigging");
    });
    expect(panelShell("ParameterPanel")).toHaveAttribute("hidden");

    act(() => {
      useWorkspaceModeStore.getState().setMode("default");
    });

    expect(panelShell("ParameterPanel")).not.toHaveAttribute("hidden");
    expect(panelShell("SceneBlendPanel")).not.toHaveAttribute("hidden");
  });

  it("keeps animation authoring panels visible in animation workspace mode", () => {
    useWorkspaceModeStore.getState().setMode("animation");
    render(<App />);

    const workspace = document.querySelector<HTMLElement>(".workspace");
    expect(workspace?.dataset.workspaceMode).toBe("animation");

    expect(panelShell("TimelinePanel")).not.toHaveAttribute("hidden");
    expect(panelShell("ParameterPanel")).not.toHaveAttribute("hidden");
    expect(panelShell("ExpressionPresetPanel")).not.toHaveAttribute("hidden");
    expect(panelShell("StateMachinePanel")).not.toHaveAttribute("hidden");
    expect(panelShell("LipSyncPanel")).not.toHaveAttribute("hidden");
    expect(panelShell("VMCPanel")).not.toHaveAttribute("hidden");

    expect(panelShell("ColliderPanel")).toHaveAttribute("hidden");
    expect(panelShell("PhysicsPanel")).toHaveAttribute("hidden");
    expect(panelShell("IKPanel")).toHaveAttribute("hidden");
    expect(panelShell("OffscreenPanel")).toHaveAttribute("hidden");
  });

  it("opens quick actions from the global shortcut", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "P", ctrlKey: true, shiftKey: true });

    expect(
      await screen.findByRole("dialog", { name: /quick actions/i }),
    ).toBeInTheDocument();
  });
});
