import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LayerSemanticRole } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as autoSetup from "@/lib/auto-setup";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";
import { AutoSetupDialog } from "../AutoSetupDialog";

vi.mock("@/lib/auto-setup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auto-setup")>();
  return {
    ...actual,
    previewAutoSetup: vi.fn(actual.previewAutoSetup),
    generateAutoMeshes: vi.fn(() => Promise.resolve([])),
    generateAutoWeights: vi.fn(() => Promise.resolve([])),
  };
});

function createImportedMesh(
  id: string,
  name: string,
  semanticRole?: LayerSemanticRole,
  frontBackSplit: "front" | "middle" | "back" | "unknown" = "middle",
  confidence = 0.9,
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
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

function setupSeeThroughProject() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createImportedMesh("eye-left", "Eye Left", "eyeLeft"),
        createImportedMesh("hair-back", "Hair Back", "hairBack", "back"),
        createImportedMesh("body", "Body", "body"),
        createImportedMesh("accessory-front", "Accessory Front", "accessory", "front"),
        createImportedMesh("low-confidence", "Low Confidence", "hairFront", "front", 0.4),
      ],
    },
    projectVersion: 1,
  });
}

function mockDetectionResult() {
  vi.mocked(autoSetup.previewAutoSetup).mockReturnValue({
    detectedParts: [
      {
        layerId: "body",
        layerName: "Body",
        category: "body",
        confidence: 1,
        bounds: { x: 0, y: 0, width: 10, height: 10 },
      },
    ],
    boneResult: null,
    physicsGroups: [],
    meshResults: [],
    weightResults: [],
  });
}

function getDetectButton() {
  const buttons = screen.getAllByRole("button");
  return buttons[buttons.length - 1] as HTMLButtonElement;
}

describe("AutoSetupDialog occlusion-aware mesh density", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
  });

  afterEach(() => {
    resetAllStores();
    vi.restoreAllMocks();
  });

  it("shows recommendation counts and defaults the toggle on for See-through projects", async () => {
    setupSeeThroughProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    expect(
      screen.getByText(
        /Occlusion-aware mesh density:\s*fine 2\s*\|\s*standard 2\s*\|\s*coarse 1/i,
      ),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Advanced" }));
    expect(
      screen.getByRole("checkbox", { name: "Use occlusion-aware mesh density" }),
    ).toBeChecked();
  });

  it("passes preset overrides when the toggle stays enabled", async () => {
    setupSeeThroughProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Advanced" }));
    await userEvent.setup().click(getDetectButton());

    await waitFor(() => {
      expect(autoSetup.generateAutoMeshes).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Function),
        "standard",
        expect.objectContaining({
          presetOverrides: {
            "eye-left": "fine",
            "hair-back": "coarse",
            body: "standard",
            "accessory-front": "fine",
            "low-confidence": "standard",
          },
        }),
      );
    });
  });

  it("omits preset overrides when the toggle is turned off", async () => {
    setupSeeThroughProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Use occlusion-aware mesh density" }),
    );
    await user.click(getDetectButton());

    await waitFor(() => {
      expect(autoSetup.generateAutoMeshes).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Function),
        "standard",
        expect.objectContaining({
          presetOverrides: undefined,
        }),
      );
    });
  });
});
