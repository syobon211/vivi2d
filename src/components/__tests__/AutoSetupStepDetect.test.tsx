import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AutoSetupOptions } from "@/lib/auto-setup";
import { AutoSetupStepDetect } from "../AutoSetupStepDetect";

function createOptions(overrides: Partial<AutoSetupOptions> = {}): AutoSetupOptions {
  return {
    generateBones: true,
    generatePhysics: true,
    generateMeshes: false,
    generateWeights: false,
    meshPreset: "standard",
    minConfidence: 0.3,
    ...overrides,
  };
}

function renderHarness(
  initialOptions: AutoSetupOptions = createOptions(),
  overrides: { busy?: boolean; onDetect?: () => void } = {},
) {
  function Harness() {
    const [options, setOptions] = useState(initialOptions);
    return (
      <AutoSetupStepDetect
        options={options}
        setOptions={(updater) => setOptions((current) => updater(current))}
        experienceMode="beginner"
        onChangeExperienceMode={() => {}}
        onDetect={overrides.onDetect ?? vi.fn()}
        busy={overrides.busy}
      />
    );
  }

  return render(<Harness />);
}

describe("AutoSetupStepDetect", () => {
  it("enables weight generation only after bones and meshes are both enabled", async () => {
    const user = userEvent.setup();
    const { container } = renderHarness(createOptions({ generateBones: true }));
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    const [, meshCheckbox, weightCheckbox, bonePhysicsCheckbox] = checkboxes;

    expect(weightCheckbox).toBeDisabled();
    expect(bonePhysicsCheckbox).toBeChecked();

    await user.click(meshCheckbox!);
    expect(weightCheckbox).toBeEnabled();

    await user.click(weightCheckbox!);
    expect(container.querySelector(".auto-setup-badge")).toHaveTextContent("レビュー保留");

    await user.click(checkboxes[0]!);
    expect(weightCheckbox).toBeDisabled();
    expect(container.querySelector(".auto-setup-badge")).toBeNull();
  });

  it("shows the mesh preset selector only when mesh generation is enabled", async () => {
    const user = userEvent.setup();
    const { container } = renderHarness(createOptions({ generateMeshes: false }));
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );

    expect(container.querySelector("select.prop-select")).toBeNull();

    await user.click(checkboxes[1]!);
    const select = container.querySelector<HTMLSelectElement>("select.prop-select");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("standard");

    await user.selectOptions(select!, "fine");
    expect(select).toHaveValue("fine");
  });

  it("updates the confidence slider value and label", async () => {
    const { container } = renderHarness();
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]');

    expect(slider).toHaveValue("0.3");
    expect(screen.getByText("30%")).toBeInTheDocument();

    fireEvent.change(slider!, { target: { value: "0.6" } });

    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("disables the detect button and shows the busy label while detection is running", async () => {
    const onDetect = vi.fn();
    renderHarness(createOptions(), { busy: true, onDetect });

    const button = screen.getByRole("button", { name: "処理中…" });
    expect(button).toBeDisabled();
    expect(button.textContent).toBe("処理中…");
    expect(onDetect).not.toHaveBeenCalled();
  });

  it("calls onDetect when the detect button is pressed in the idle state", async () => {
    const onDetect = vi.fn();
    const user = userEvent.setup();
    renderHarness(createOptions(), { onDetect });

    await user.click(screen.getByRole("button", { name: "検出開始" }));
    expect(onDetect).toHaveBeenCalledOnce();
  });
});
