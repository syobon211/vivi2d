import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LayerSemanticRole } from "@vivi2d/core/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";
import { AutoSetupDialog } from "../AutoSetupDialog";

function createImportedMesh(
  id: string,
  name: string,
  semanticRole?: LayerSemanticRole,
  frontBackSplit: "front" | "middle" | "back" | "unknown" = "middle",
  confidence = 0.9,
  bbox: [number, number, number, number] = [0, 0, 10, 10],
) {
  return createViviMesh({
    id,
    name,
    semanticRole,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label: name,
        order: 0,
        confidence,
        leftRightSplit: "center",
        frontBackSplit,
        bbox,
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

describe("AutoSetupDialog depth-to-rig hints", () => {
  afterEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("ja");
  });

  it("renders blocking/warning/info hint counts for See-through projects", async () => {
    useI18nStore.getState().setLocale("en");
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [
          createImportedMesh("hair-front", "Hair Front", "hairFront", "front"),
          createImportedMesh("eye-left", "Eye Left", "eyeLeft"),
          createImportedMesh(
            "unknown",
            "Unknown",
            "unknown",
            "middle",
            0.9,
            [0, 0, 0, 10],
          ),
        ],
      },
      projectVersion: 1,
    });

    render(<AutoSetupDialog onClose={() => {}} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Advanced" }));

    expect(
      screen.getByText(
        /Depth-to-rig hints:\s*blocking 1\s*\|\s*warning 2\s*\|\s*info 1/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 import quality error(s) should be fixed before rigging."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Hair Front will likely benefit from finer deformation control."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Eye layers are incomplete on one side. Symmetric face rigging may be unstable.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Unknown still has an unknown role. Resolve its role before auto-rigging.",
      ),
    ).toBeInTheDocument();
  });

  it("does not render the hint block for non See-through projects", () => {
    useI18nStore.getState().setLocale("en");
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [createViviMesh({ id: "plain", name: "Plain", semanticRole: "body" })],
      },
      projectVersion: 1,
    });

    render(<AutoSetupDialog onClose={() => {}} />);

    expect(screen.queryByText(/Depth-to-rig hints:/i)).not.toBeInTheDocument();
  });

  it("opens depth inspector from the advanced hint block and selects the first layer-backed hint", async () => {
    useI18nStore.getState().setLocale("en");
    const run = vi.fn();
    useQuickActionRegistryStore.getState().registerAction({
      id: "project.depthInspector",
      section: "project",
      title: "Depth Inspector",
      keywords: ["depth", "inspector"],
      order: 1,
      run,
      getAvailability: () => ({ enabled: true }),
    });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [
          createImportedMesh("hair-front", "Hair Front", "hairFront", "front"),
          createImportedMesh(
            "unknown",
            "Unknown",
            "unknown",
            "middle",
            0.9,
            [0, 0, 0, 10],
          ),
        ],
      },
      projectVersion: 1,
    });

    render(<AutoSetupDialog onClose={() => {}} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Advanced" }));
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: /Open Depth Inspector \(depth-to-rig hints\)/i,
      }),
    );

    expect(useSelectionStore.getState().selectedLayerId).toBe("unknown");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
