import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createT } from "../i18n";
import { ViewerStage, type ReadinessWarning } from "../shell/ViewerStage";
import type { ViviProp } from "../props/prop-types";

const t = createT("en");

const prop: ViviProp = {
  id: "prop",
  name: "Prop",
  kind: "image",
  visible: true,
  drawOrder: 1,
  opacity: 1,
  transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
  source: {
    kind: "inlineBase64",
    mimeType: "image/png",
    bytes: "AAAA",
    portable: true,
  },
};

function renderStage(overrides: Partial<React.ComponentProps<typeof ViewerStage>> = {}) {
  const canvasRef = { current: null };
  const props: React.ComponentProps<typeof ViewerStage> = {
    t,
    locale: "en",
    loaded: true,
    dragging: false,
    bgMode: "transparent",
    canvasRef,
    onCanvasClick: vi.fn(),
    readinessWarnings: [],
    onClearReadinessWarnings: vi.fn(),
    onOpenSheetSection: vi.fn(),
    onDismissRecommendation: vi.fn(),
    onRestoreRecommendation: vi.fn(),
    lastHit: null,
    showHud: false,
    hudStats: { fps: 60, meshes: 1, vertices: 2 },
    viewerProps: [],
    lipSync: false,
    lipSyncMode: "viseme",
    currentVowel: "silent",
    recordingState: "idle",
    activePreset: null,
    toast: null,
    ...overrides,
  };
  return { ...render(<ViewerStage {...props} />), props };
}

describe("ViewerStage", () => {
  it("shows the empty drop prompt and drag border when no model is loaded", () => {
    const { container } = renderStage({ loaded: false, dragging: true });

    expect(container).toHaveTextContent("Drop .vivi file here");
    expect((container.firstElementChild as HTMLElement).style.cssText).toContain("dashed");
  });

  it("renders overlays and status indicators for an active viewer session", () => {
    renderStage({
      showHud: true,
      viewerProps: [prop],
      lipSync: true,
      currentVowel: "a",
      recordingState: "recording",
      activePreset: "Smile",
      toast: "Saved",
      lastHit: "Head [sparkles]",
    });

    expect(screen.getByText("60 FPS")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("Smile")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByTestId("hit-overlay")).toHaveTextContent("Head [sparkles]");
  });

  it("routes readiness card actions to the supplied handlers", () => {
    const warning: ReadinessWarning = {
      id: "calibration",
      label: "Calibration should be reviewed",
      targetSection: "calibration",
      recommendationKey: "calibrate",
    };
    const onClear = vi.fn();
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    renderStage({
      readinessWarnings: [warning],
      onClearReadinessWarnings: onClear,
      onOpenSheetSection: onOpen,
      onDismissRecommendation: onDismiss,
    });

    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(screen.getByText("Dismiss reminder"));
    fireEvent.click(screen.getByText("Close"));

    expect(onOpen).toHaveBeenCalledWith("calibration");
    expect(onDismiss).toHaveBeenCalledWith("calibrate");
    expect(onClear).toHaveBeenCalled();
  });

  it("allows dismissed readiness reminders to be restored", () => {
    const onRestore = vi.fn();
    renderStage({
      readinessWarnings: [
        {
          id: "connect",
          label: "Enable Local API",
          targetSection: "connect",
          recommendationKey: "connect",
          dismissed: true,
        },
      ],
      onRestoreRecommendation: onRestore,
    });

    fireEvent.click(screen.getByText("Restore reminder"));

    expect(onRestore).toHaveBeenCalledWith("connect");
  });
});
