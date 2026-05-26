import { fireEvent, render, screen } from "@testing-library/react";
import type {
  AnimationClip,
  AnimationStateMachine,
  ParameterDefinition,
} from "@vivi2d/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStateMachineStore } from "@/stores/stateMachineStore";
import { resetAllStores } from "@/test/store-reset";
import { StateMachineEditor } from "../StateMachineEditor";


function createMachine(
  overrides?: Partial<AnimationStateMachine>,
): AnimationStateMachine {
  return {
    id: "sm-1",
    name: "TestMachine",
    enabled: true,
    initialStateId: "state-1",
    states: [
      { id: "state-1", name: "Idle", clipId: undefined, loop: true },
      { id: "state-2", name: "Walk", clipId: "clip-1", loop: false },
    ],
    transitions: [
      {
        id: "trans-1",
        fromStateId: "*",
        toStateId: "state-2",
        conditions: [{ parameterId: "p-1", operator: ">", threshold: 0.5 }],
        transitionDuration: 0.3,
        priority: 0,
      },
    ],
    ...overrides,
  };
}

const mockParams: ParameterDefinition[] = [
  { id: "p-1", name: "Speed", minValue: 0, maxValue: 1, defaultValue: 0 },
];

const mockClips: AnimationClip[] = [
  { id: "clip-1", name: "WalkAnim", duration: 60, fps: 30, tracks: [] },
];

describe("StateMachineEditor", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("マシン名が表示される", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    const nameInput = screen.getByDisplayValue("TestMachine");
    expect(nameInput).toBeInTheDocument();
  });

  it("状態一覧が表示される", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    expect(screen.getByDisplayValue("Idle")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Walk")).toBeInTheDocument();
  });

  it("有効/無効チェックボックスが表示される", () => {
    const machine = createMachine({ enabled: true });
    const { container } = render(
      <StateMachineEditor machine={machine} parameters={mockParams} clips={mockClips} />,
    );

    const checkbox = container.querySelector(
      '.sm-group-header input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("初期状態バッジが正しい状態に表示される", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    expect(screen.getByText(/初期|Initial/i)).toBeInTheDocument();
    expect(screen.getByText("★")).toBeInTheDocument();
  });

  it("状態追加ボタンでフォームが表示される", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    const addBtn = screen.getByText(/\+ 状態追加|\+ Add State/i);
    fireEvent.click(addBtn);

    expect(screen.getByPlaceholderText(/状態名|State Name/i)).toBeInTheDocument();
    expect(screen.getByText(/OK|確認/)).toBeInTheDocument();
  });

  it("遷移ヘッダーが表示される", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    expect(screen.getByText(/\*.*→.*Walk/)).toBeInTheDocument();
  });

  it("遷移追加ボタンでフォームが表示される", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    const addBtn = screen.getByText(/\+ 遷移追加|\+ Add Transition/i);
    fireEvent.click(addBtn);

    expect(screen.getByText("→")).toBeInTheDocument();
  });

  it("クリップ選択ドロップダウンにクリップが表示される", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    expect(screen.getAllByText("WalkAnim").length).toBeGreaterThan(0);
  });

  it("ループトグルが表示される", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    expect(screen.getAllByText(/ループ|Loop/i).length).toBeGreaterThan(0);
  });

  it("状態が1つのとき削除ボタンが無効化される", () => {
    const machine = createMachine({
      states: [{ id: "state-1", name: "Only", clipId: undefined, loop: true }],
      transitions: [],
    });

    const { container } = render(
      <StateMachineEditor machine={machine} parameters={mockParams} clips={mockClips} />,
    );

    const deleteButtons = container.querySelectorAll(".sm-state .physics-btn-danger");
    expect(deleteButtons).toHaveLength(1);
    expect(deleteButtons[0]).toBeDisabled();
  });


  it("状態追加フォームでOKクリックするとaddStateが呼ばれる", () => {
    const addStateSpy = vi.spyOn(useStateMachineStore.getState(), "addState");
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 状態追加|\+ Add State/i));

    const input = screen.getByPlaceholderText(/状態名|State Name/i);
    fireEvent.change(input, { target: { value: "Run" } });

    fireEvent.click(screen.getByText(/OK|確認/));

    expect(addStateSpy).toHaveBeenCalledWith("sm-1", "Run");
    addStateSpy.mockRestore();
  });

  it("状態追加で空文字の場合はaddStateが呼ばれない", () => {
    const addStateSpy = vi.spyOn(useStateMachineStore.getState(), "addState");
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 状態追加|\+ Add State/i));
    fireEvent.click(screen.getByText(/OK|確認/));

    expect(addStateSpy).not.toHaveBeenCalled();
    addStateSpy.mockRestore();
  });

  it("状態追加でスペースのみの場合はaddStateが呼ばれない", () => {
    const addStateSpy = vi.spyOn(useStateMachineStore.getState(), "addState");
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 状態追加|\+ Add State/i));
    const input = screen.getByPlaceholderText(/状態名|State Name/i);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByText(/OK|確認/));

    expect(addStateSpy).not.toHaveBeenCalled();
    addStateSpy.mockRestore();
  });

  it("状態追加後にフォームが閉じる", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 状態追加|\+ Add State/i));
    const input = screen.getByPlaceholderText(/状態名|State Name/i);
    fireEvent.change(input, { target: { value: "NewState" } });
    fireEvent.click(screen.getByText(/OK|確認/));

    expect(screen.queryByPlaceholderText(/状態名|State Name/i)).not.toBeInTheDocument();
  });

  it("Enterキーで状態を追加できる", () => {
    const addStateSpy = vi.spyOn(useStateMachineStore.getState(), "addState");
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 状態追加|\+ Add State/i));
    const input = screen.getByPlaceholderText(/状態名|State Name/i);
    fireEvent.change(input, { target: { value: "Jump" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(addStateSpy).toHaveBeenCalledWith("sm-1", "Jump");
    addStateSpy.mockRestore();
  });

  it("Escapeキーで状態追加フォームを閉じる", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 状態追加|\+ Add State/i));
    const input = screen.getByPlaceholderText(/状態名|State Name/i);
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByPlaceholderText(/状態名|State Name/i)).not.toBeInTheDocument();
  });

  it("遷移追加フォームでOKクリックするとaddTransitionが呼ばれる", () => {
    const addTransitionSpy = vi.spyOn(useStateMachineStore.getState(), "addTransition");
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 遷移追加|\+ Add Transition/i));

    const selects = screen.getAllByRole("combobox");
    const toSelect = selects[selects.length - 1]!;
    fireEvent.change(toSelect, { target: { value: "state-1" } });

    const okButtons = screen.getAllByText(/OK|確認/);
    fireEvent.click(okButtons[okButtons.length - 1]!);

    expect(addTransitionSpy).toHaveBeenCalledWith("sm-1", expect.any(String), "state-1");
    addTransitionSpy.mockRestore();
  });

  it("遷移追加で遷移先が未選択の場合はOKボタンが無効化される", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 遷移追加|\+ Add Transition/i));
    const transitionsBefore = createMachine().transitions.length;
    const okButtons = screen.getAllByText(/OK|確認/);
    fireEvent.click(okButtons[okButtons.length - 1]!);

    expect(transitionsBefore).toBe(1);
  });

  it("★ボタンで初期状態を変更できる", () => {
    const setInitialSpy = vi.spyOn(useStateMachineStore.getState(), "setInitialState");
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText("★"));

    expect(setInitialSpy).toHaveBeenCalledWith("sm-1", "state-2");
    setInitialSpy.mockRestore();
  });

  it("有効/無効チェックボックスの切り替え", () => {
    const toggleSpy = vi.spyOn(useStateMachineStore.getState(), "toggleStateMachine");
    const machine = createMachine({ enabled: true });
    const { container } = render(
      <StateMachineEditor machine={machine} parameters={mockParams} clips={mockClips} />,
    );

    const checkbox = container.querySelector(
      '.sm-group-header input[type="checkbox"]',
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    expect(toggleSpy).toHaveBeenCalledWith("sm-1");
    toggleSpy.mockRestore();
  });


  it("マシン名入力変更でrenameStateMachineが呼ばれる", () => {
    const spy = vi.spyOn(useStateMachineStore.getState(), "renameStateMachine");
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    const nameInput = screen.getByDisplayValue("TestMachine");
    fireEvent.change(nameInput, { target: { value: "NewName" } });

    expect(spy).toHaveBeenCalledWith("sm-1", "NewName");
    spy.mockRestore();
  });

  it("ヘッダーの削除ボタンでremoveStateMachineが呼ばれる", () => {
    const spy = vi.spyOn(useStateMachineStore.getState(), "removeStateMachine");
    const { container } = render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    const headerDeleteBtn = container.querySelector(
      ".sm-group-header .physics-btn-danger",
    ) as HTMLButtonElement;
    fireEvent.click(headerDeleteBtn);

    expect(spy).toHaveBeenCalledWith("sm-1");
    spy.mockRestore();
  });

  it("状態名を変更するとupdateStateが呼ばれる", () => {
    const spy = vi.spyOn(useStateMachineStore.getState(), "updateState");
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    const stateNameInput = screen.getByDisplayValue("Idle");
    fireEvent.change(stateNameInput, { target: { value: "StayStill" } });

    expect(spy).toHaveBeenCalledWith("sm-1", "state-1", { name: "StayStill" });
    spy.mockRestore();
  });

  it("クリップを選択するとupdateStateが呼ばれる", () => {
    const spy = vi.spyOn(useStateMachineStore.getState(), "updateState");
    const { container } = render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    const selects = container.querySelectorAll(".sm-state .physics-select-sm");
    fireEvent.change(selects[0]!, { target: { value: "clip-1" } });

    expect(spy).toHaveBeenCalledWith("sm-1", "state-1", { clipId: "clip-1" });
    spy.mockRestore();
  });

  it("クリップ選択を解除（空値）するとclipId: undefinedでupdateStateが呼ばれる", () => {
    const spy = vi.spyOn(useStateMachineStore.getState(), "updateState");
    const { container } = render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    const selects = container.querySelectorAll(".sm-state .physics-select-sm");
    fireEvent.change(selects[1]!, { target: { value: "" } });

    expect(spy).toHaveBeenCalledWith("sm-1", "state-2", { clipId: undefined });
    spy.mockRestore();
  });

  it("ループトグルでupdateStateが呼ばれる", () => {
    const spy = vi.spyOn(useStateMachineStore.getState(), "updateState");
    const { container } = render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    const loopCheckboxes = container.querySelectorAll(
      '.sm-loop-toggle input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;
    fireEvent.click(loopCheckboxes[0]!);

    expect(spy).toHaveBeenCalledWith("sm-1", "state-1", { loop: false });
    spy.mockRestore();
  });

  it("状態の削除ボタンでremoveStateが呼ばれる（有効な場合）", () => {
    const spy = vi.spyOn(useStateMachineStore.getState(), "removeState");
    const { container } = render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    const deleteButtons = container.querySelectorAll(".sm-state .physics-btn-danger");
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[0]!);

    expect(spy).toHaveBeenCalledWith("sm-1", "state-1");
    spy.mockRestore();
  });

  it("状態追加フォームのキャンセルボタンでフォームが閉じる", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 状態追加|\+ Add State/i));
    expect(screen.getByPlaceholderText(/状態名|State Name/i)).toBeInTheDocument();

    const cancelBtns = screen.getAllByText(/キャンセル|Cancel/i);
    fireEvent.click(cancelBtns[0]!);

    expect(screen.queryByPlaceholderText(/状態名|State Name/i)).not.toBeInTheDocument();
  });

  it("遷移追加フォームのキャンセルボタンでフォームが閉じる", () => {
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 遷移追加|\+ Add Transition/i));

    const cancelBtns = screen.getAllByText(/キャンセル|Cancel/i);
    fireEvent.click(cancelBtns[cancelBtns.length - 1]!);

    expect(screen.queryByText("→")).not.toBeInTheDocument();
  });

  it("遷移追加フォームでfromStateIdを選択できる", () => {
    const addTransitionSpy = vi.spyOn(useStateMachineStore.getState(), "addTransition");
    render(
      <StateMachineEditor
        machine={createMachine()}
        parameters={mockParams}
        clips={mockClips}
      />,
    );

    fireEvent.click(screen.getByText(/\+ 遷移追加|\+ Add Transition/i));
    const selects = screen.getAllByRole("combobox");
    const fromSelect = selects[selects.length - 2]!;
    const toSelect = selects[selects.length - 1]!;
    fireEvent.change(fromSelect, { target: { value: "state-1" } });
    fireEvent.change(toSelect, { target: { value: "state-2" } });

    const okButtons = screen.getAllByText(/OK|確認/);
    fireEvent.click(okButtons[okButtons.length - 1]!);

    expect(addTransitionSpy).toHaveBeenCalledWith("sm-1", "state-1", "state-2");
    addTransitionSpy.mockRestore();
  });
});
