import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { createBoneNode, createEmptyProject } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";
import { IKPanel } from "../IKPanel";

function setupWithTwoBoneIK() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createBoneNode({ id: "bone-1", name: "Upper Arm" }),
        createBoneNode({ id: "bone-2", name: "Forearm" }),
      ],
      ikControllers: [
        {
          id: "ik-1",
          name: "Arm IK",
          solverType: "twoBone",
          boneChain: [
            { boneId: "bone-1", minAngle: -Math.PI, maxAngle: Math.PI },
            { boneId: "bone-2", minAngle: -Math.PI, maxAngle: Math.PI },
          ],
          targetX: 100,
          targetY: 200,
          influence: 0.8,
          parameterMappings: [],
        },
      ],
    },
    projectVersion: 1,
  });
}

function setupWithCcdIK() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createBoneNode({ id: "bone-1", name: "Bone A" }),
        createBoneNode({ id: "bone-2", name: "Bone B" }),
        createBoneNode({ id: "bone-3", name: "Bone C" }),
      ],
      ikControllers: [
        {
          id: "ik-ccd",
          name: "CCD IK",
          solverType: "ccd",
          boneChain: [
            { boneId: "bone-1", minAngle: -Math.PI, maxAngle: Math.PI },
            { boneId: "bone-2", minAngle: -Math.PI, maxAngle: Math.PI },
            { boneId: "bone-3", minAngle: -Math.PI, maxAngle: Math.PI },
          ],
          targetX: 150,
          targetY: 250,
          influence: 1,
          maxIterations: 10,
          parameterMappings: [],
        },
      ],
    },
    projectVersion: 1,
  });
}

function setupWithMalformedTwoBoneIK() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createBoneNode({ id: "bone-1", name: "Bone A" }),
        createBoneNode({ id: "bone-2", name: "Bone B" }),
        createBoneNode({ id: "bone-3", name: "Bone C" }),
      ],
      ikControllers: [
        {
          id: "ik-bad",
          name: "Malformed IK",
          solverType: "twoBone",
          boneChain: [
            { boneId: "bone-1", minAngle: -Math.PI, maxAngle: Math.PI },
            { boneId: "bone-2", minAngle: -Math.PI, maxAngle: Math.PI },
            { boneId: "bone-3", minAngle: -Math.PI, maxAngle: Math.PI },
          ],
          targetX: 0,
          targetY: 0,
          influence: 1,
          parameterMappings: [],
        },
      ],
    },
    projectVersion: 1,
  });
}

function setupEmpty() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createBoneNode({ id: "bone-1", name: "Upper Arm" }),
        createBoneNode({ id: "bone-2", name: "Forearm" }),
        createBoneNode({ id: "bone-3", name: "Hand" }),
      ],
    },
    projectVersion: 1,
  });
}

describe("IKPanel", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
  });

  afterEach(() => resetEditorStore());

  it("returns null when no project is loaded", () => {
    useEditorStore.setState({ project: null });
    const { container } = render(<IKPanel />);
    expect(container.querySelector(".ik-panel")).not.toBeInTheDocument();
  });

  it("renders an existing IK controller", () => {
    setupWithTwoBoneIK();
    render(<IKPanel />);
    expect(screen.getByText("Arm IK")).toBeInTheDocument();
    expect(screen.getByText("twoBone")).toBeInTheDocument();
    expect(screen.getByText(/Upper Arm -> Forearm/)).toBeInTheDocument();
  });

  it("updates controller influence from the slider", () => {
    setupWithTwoBoneIK();
    const { container } = render(<IKPanel />);
    const slider = container.querySelector(
      '.ik-slider-row input[type="range"]',
    ) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0.5" } });
    expect(useEditorStore.getState().project?.ikControllers?.[0]?.influence).toBe(0.5);
  });

  it("shows iterations only for CCD controllers", () => {
    setupWithCcdIK();
    render(<IKPanel />);
    expect(screen.getByText(/Iterations/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
  });

  it("shows bend-profile status for supported and unsupported controllers", () => {
    setupWithTwoBoneIK();
    const { rerender } = render(<IKPanel />);
    expect(screen.getByText("Current Bend Profile: Custom")).toBeInTheDocument();

    setupWithCcdIK();
    rerender(<IKPanel />);
    expect(screen.getByText("Current Bend Profile: N/A")).toBeInTheDocument();
  });

  it("treats malformed two-bone chains as unsupported", () => {
    setupWithMalformedTwoBoneIK();
    render(<IKPanel />);
    expect(screen.getByText("Current Bend Profile: N/A")).toBeInTheDocument();
    expect(screen.queryByText("Apply Profile")).not.toBeInTheDocument();
  });

  it("opens the add form and requires exactly two bones for two-bone IK", async () => {
    setupEmpty();
    const user = userEvent.setup();
    render(<IKPanel />);

    await user.click(screen.getByText("+ Add IK Controller"));
    await user.type(screen.getByPlaceholderText("IK controller name"), "Test IK");

    const createButton = screen.getByText("Create");
    expect(createButton).toBeDisabled();

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]!);
    expect(createButton).toBeDisabled();

    await user.click(checkboxes[1]!);
    expect(createButton).not.toBeDisabled();

    await user.click(checkboxes[2]!);
    expect(createButton).toBeDisabled();
  });

  it("creates a two-bone controller with a selected bend profile", async () => {
    setupEmpty();
    const user = userEvent.setup();
    render(<IKPanel />);

    await user.click(screen.getByText("+ Add IK Controller"));
    await user.type(screen.getByPlaceholderText("IK controller name"), "Profiled IK");
    await user.selectOptions(screen.getByLabelText("Initial Bend Profile"), "standard");

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]!);
    await user.click(checkboxes[1]!);
    await user.click(screen.getByText("Create"));

    const controller = useEditorStore
      .getState()
      .project?.ikControllers?.find((item) => item.name === "Profiled IK");
    expect(controller).toBeTruthy();
    expect(controller?.boneChain).toHaveLength(2);
    expect(controller?.boneChain[0]?.minAngle).not.toBeCloseTo(-Math.PI);
    expect(controller?.boneChain[1]?.minAngle).toBeCloseTo(0);
  });

  it("applies a bend profile to an existing two-bone controller", async () => {
    setupWithTwoBoneIK();
    const user = userEvent.setup();
    render(<IKPanel />);

    await user.selectOptions(screen.getByLabelText("Arm IK Bend Profile"), "loose");
    await user.click(screen.getByText("Apply Profile"));

    const controller = useEditorStore.getState().project?.ikControllers?.[0];
    expect(controller?.boneChain[0]?.minAngle).not.toBeCloseTo(-Math.PI);
    expect(controller?.boneChain[1]?.minAngle).toBeCloseTo((-15 * Math.PI) / 180);
    expect(screen.getByText("Current Bend Profile: Loose")).toBeInTheDocument();
  });
});
