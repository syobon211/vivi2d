import { useRef } from "react";
import { endE2EPerfProbe, startE2EPerfProbe } from "@/lib/e2e-perf-probe";
import { useT } from "@/lib/i18n";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";

export function ToolButtons() {
  const t = useT();
  const activeTool = useViewportStore((s) => s.activeTool);
  const setTool = useViewportStore((s) => s.setTool);
  const pointerToolActivationRef = useRef<"select" | "pan" | "meshEdit" | null>(null);

  const handleSetTool = (tool: "select" | "pan" | "meshEdit") => {
    startE2EPerfProbe("toolButtons.clickToNextFrame", tool);
    if (tool === "meshEdit") {
      startE2EPerfProbe(
        "meshEdit.appReady",
        useSelectionStore.getState().selectedLayerId ?? "none",
      );
    }
    setTool(tool);
    requestAnimationFrame(() => {
      endE2EPerfProbe("toolButtons.clickToNextFrame", tool, { tool });
    });
  };

  const handleToolPointerDown =
    (tool: "select" | "pan" | "meshEdit") =>
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      pointerToolActivationRef.current = tool;
      handleSetTool(tool);
    };

  const handleToolClick =
    (tool: "select" | "pan" | "meshEdit") => (e: React.MouseEvent<HTMLButtonElement>) => {
      if (pointerToolActivationRef.current === tool && e.detail !== 0) {
        pointerToolActivationRef.current = null;
        return;
      }
      pointerToolActivationRef.current = null;
      handleSetTool(tool);
    };

  return (
    <div className="menu-group">
      <button
        type="button"
        className={`menu-btn tool-btn ${activeTool === "select" ? "active" : ""}`}
        onPointerDown={handleToolPointerDown("select")}
        onClick={handleToolClick("select")}
        title={t("menu.selectTitle")}
      >
        {t("menu.select")}
      </button>
      <button
        type="button"
        className={`menu-btn tool-btn ${activeTool === "pan" ? "active" : ""}`}
        onPointerDown={handleToolPointerDown("pan")}
        onClick={handleToolClick("pan")}
        title={t("menu.panTitle")}
      >
        {t("menu.pan")}
      </button>
      <button
        type="button"
        className={`menu-btn tool-btn ${activeTool === "meshEdit" ? "active" : ""}`}
        onPointerDown={handleToolPointerDown("meshEdit")}
        onClick={handleToolClick("meshEdit")}
        title={t("menu.meshTitle")}
      >
        {t("menu.mesh")}
      </button>
    </div>
  );
}
