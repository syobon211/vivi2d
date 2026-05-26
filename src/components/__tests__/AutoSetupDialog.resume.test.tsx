import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoSetupResult } from "@/lib/auto-setup";
import * as autoSetup from "@/lib/auto-setup";
import { useI18nStore } from "@/lib/i18n";
import {
  buildAutoSetupDraftProjectKey,
  useAutoSetupDraftStore,
} from "@/stores/autoSetupDraftStore";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { TEST_RESUME_VIVI_PATH } from "@/test/path-fixtures";
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

function setupProject() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-a", name: "Mesh A" })],
    },
    projectVersion: 3,
    projectStructureVersion: 5,
    currentFilePath: TEST_RESUME_VIVI_PATH,
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

function createResult(): AutoSetupResult {
  return {
    detectedParts: [],
    boneResult: {
      bones: [
        {
          tempId: "bone-a",
          name: "Head",
          parentTempId: null,
          x: 10,
          y: 20,
          partCategory: "head",
        },
      ],
      parameters: [],
    },
    physicsGroups: [],
    meshResults: [],
    weightResults: [],
  };
}

describe("AutoSetupDialog resume", () => {
  beforeEach(() => {
    resetAllStores();
    vi.restoreAllMocks();
    useI18nStore.getState().setLocale("en");
  });

  afterEach(() => {
    useI18nStore.getState().setLocale("ja");
  });

  it("restores a saved draft for the same project", () => {
    setupProject();
    useAutoSetupDraftStore.getState().saveDraft({
      projectKey: currentProjectKey(),
      projectStructureVersion: 5,
      step: "detect",
      experienceMode: "beginner",
      options: {
        generateBones: true,
        generatePhysics: false,
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
      useOcclusionAwareMeshDensity: false,
    });

    render(<AutoSetupDialog onClose={() => {}} />);

    expect(
      screen.getByText("Resumed from a previous auto-setup session."),
    ).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[3]).not.toBeChecked();
  });

  it("start over clears the saved draft and resets the dialog", () => {
    setupProject();
    useAutoSetupDraftStore.getState().saveDraft({
      projectKey: currentProjectKey(),
      projectStructureVersion: 5,
      step: "detect",
      experienceMode: "beginner",
      options: {
        generateBones: true,
        generatePhysics: false,
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
      useOcclusionAwareMeshDensity: false,
    });

    render(<AutoSetupDialog onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));

    expect(
      screen.queryByText("Resumed from a previous auto-setup session."),
    ).not.toBeInTheDocument();
    expect(useAutoSetupDraftStore.getState().draft).toBeNull();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[3]).toBeChecked();
  });

  it("restores the preview step and clears the draft on apply", async () => {
    setupProject();
    useAutoSetupDraftStore.getState().saveDraft({
      projectKey: currentProjectKey(),
      projectStructureVersion: 5,
      step: "preview",
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
      result: createResult(),
      seeThroughRecommendationsApplied: false,
      cleanupSummary: null,
      eyeClippingSummary: null,
      eyeRigSummary: null,
      leftRightSplitSummary: null,
      mouthRigSummary: null,
      useOcclusionAwareMeshDensity: false,
    });
    const onClose = vi.fn();

    render(<AutoSetupDialog onClose={onClose} />);

    expect(document.querySelector(".auto-setup-section")).toBeInTheDocument();

    const applyButton = document.querySelector(
      ".auto-setup-actions .modal-btn-primary",
    ) as HTMLButtonElement | null;
    expect(applyButton).not.toBeNull();
    fireEvent.click(applyButton!);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(useAutoSetupDraftStore.getState().draft).toBeNull();
    });
  });

  it("does not save a partial draft while detect is still running", async () => {
    setupProject();
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(createResult());
    let resolveMeshes: ((value: autoSetup.MeshGenerationResult[]) => void) | undefined;
    vi.mocked(autoSetup.generateAutoMeshes).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMeshes = resolve;
        }),
    );

    const { unmount } = render(<AutoSetupDialog onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Start detection" }));

    await waitFor(() => {
      expect(autoSetup.generateAutoMeshes).toHaveBeenCalled();
    });

    unmount();
    expect(useAutoSetupDraftStore.getState().draft).toBeNull();

    resolveMeshes?.([]);
  });
});
