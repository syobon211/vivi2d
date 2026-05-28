import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import {
  buildAutoSetupDraftProjectKey,
  useAutoSetupDraftStore,
} from "@/stores/autoSetupDraftStore";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { TEST_EXPERIENCE_VIVI_PATH } from "@/test/path-fixtures";
import { resetAllStores } from "@/test/store-reset";
import { AutoSetupDialog } from "../AutoSetupDialog";

function setupProject() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createViviMesh({
          id: "mesh-a",
          name: "Hair Front",
          semanticRole: "hairFront",
          importMetadata: {
            source: "seeThrough",
            seeThrough: {
              label: "hair_front",
              order: 0,
              confidence: 0.9,
              leftRightSplit: "center",
              frontBackSplit: "front",
              bbox: [0, 0, 10, 10],
              depthStats: { min: 0, max: 1, mean: 0.5 },
            },
          },
        }),
      ],
    },
    projectVersion: 2,
    projectStructureVersion: 7,
    currentFilePath: TEST_EXPERIENCE_VIVI_PATH,
  });
}

function currentProjectKey() {
  const state = useEditorStore.getState();
  return buildAutoSetupDraftProjectKey(
    state.project!,
    state.currentFilePath,
    state.projectVersion,
  );
}

describe("AutoSetupDialog experience mode", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
  });

  it("defaults to beginner and hides advanced diagnostics", () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    expect(screen.getByRole("button", { name: "Beginner" })).toHaveClass(
      "modal-btn-primary",
    );
    expect(
      screen.queryByRole("checkbox", { name: "Use occlusion-aware mesh density" }),
    ).not.toBeInTheDocument();
  });

  it("shows advanced diagnostics after switching to advanced mode", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Advanced" }));

    expect(
      screen.getByRole("checkbox", { name: "Use occlusion-aware mesh density" }),
    ).toBeInTheDocument();
  });

  it("hides advanced diagnostics again when switched back to beginner", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(screen.getByRole("button", { name: "Beginner" }));

    expect(
      screen.queryByRole("checkbox", { name: "Use occlusion-aware mesh density" }),
    ).not.toBeInTheDocument();
  });

  it("restores the saved experience mode from the resume draft", () => {
    setupProject();
    useAutoSetupDraftStore.getState().saveDraft({
      projectKey: currentProjectKey(),
      projectStructureVersion: 7,
      step: "detect",
      experienceMode: "advanced",
      options: {
        generateBones: true,
        generatePhysics: true,
        generateMeshes: true,
        generateWeights: true,
        meshPreset: "standard",
        minConfidence: 0.3,
      },
      excludedIds: [],
      result: null,
      seeThroughRecommendationsApplied: false,
      cleanupSummary: null,
      eyeClippingSummary: null,
      eyeRigSummary: null,
      leftRightSplitSummary: null,
      mouthRigSummary: null,
      useOcclusionAwareMeshDensity: true,
    });

    render(<AutoSetupDialog onClose={() => {}} />);

    expect(screen.getByRole("button", { name: "Advanced" })).toHaveClass(
      "modal-btn-primary",
    );
    expect(
      screen.getByRole("checkbox", { name: "Use occlusion-aware mesh density" }),
    ).toBeInTheDocument();
  });
});
