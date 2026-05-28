import { fireEvent, render, screen } from "@testing-library/react";
import type {
  AnimationState,
  ParameterDefinition,
  StateTransition,
} from "@vivi2d/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransitionEditor } from "../TransitionEditor";


const states: AnimationState[] = [
  { id: "s1", name: "Idle", clipId: undefined, loop: true },
  { id: "s2", name: "Walk", clipId: "c1", loop: false },
];

const parameters: ParameterDefinition[] = [
  { id: "p1", name: "Speed", minValue: 0, maxValue: 1, defaultValue: 0 },
  { id: "p2", name: "Angle", minValue: -30, maxValue: 30, defaultValue: 0 },
];

function createTransition(overrides?: Partial<StateTransition>): StateTransition {
  return {
    id: "t1",
    fromStateId: "s1",
    toStateId: "s2",
    conditions: [],
    transitionDuration: 0.3,
    priority: 0,
    ...overrides,
  };
}

describe("TransitionEditor", () => {
  const onRemove = vi.fn();
  const onUpdate = vi.fn();
  const onAddCondition = vi.fn();
  const onRemoveCondition = vi.fn();
  const onUpdateCondition = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderEditor = (transition?: StateTransition) =>
    render(
      <TransitionEditor
        transition={transition ?? createTransition()}
        states={states}
        parameters={parameters}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onAddCondition={onAddCondition}
        onRemoveCondition={onRemoveCondition}
        onUpdateCondition={onUpdateCondition}
      />,
    );

  it("遷移ラベルが表示される", () => {
    renderEditor();
    expect(screen.getByText(/Idle.*→.*Walk/)).toBeInTheDocument();
  });

  it("fromStateId='*'でAny表示される", () => {
    renderEditor(createTransition({ fromStateId: "*" }));
    expect(screen.getByText(/\*.*→.*Walk/)).toBeInTheDocument();
  });

  it("削除ボタンでonRemoveが呼ばれる", () => {
    renderEditor();
    const xButtons = screen.getAllByText("x");
    fireEvent.click(xButtons[0]!);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("priority入力が表示される", () => {
    renderEditor(createTransition({ priority: 5 }));
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
  });

  it("priority変更でonUpdateが呼ばれる", () => {
    renderEditor();
    const priorityInput = screen.getByDisplayValue("0");
    fireEvent.change(priorityInput, { target: { value: "3" } });
    expect(onUpdate).toHaveBeenCalledWith({ priority: 3 });
  });

  it("transitionDuration入力が表示される", () => {
    renderEditor(createTransition({ transitionDuration: 0.5 }));
    expect(screen.getByDisplayValue("0.5")).toBeInTheDocument();
  });

  it("条件追加ボタンでonAddConditionが呼ばれる", () => {
    renderEditor();
    const addBtn = screen.getByText(/\+ 条件追加|\+ Add Condition/i);
    fireEvent.click(addBtn);
    expect(onAddCondition).toHaveBeenCalledWith({
      parameterId: "p1",
      operator: ">",
      threshold: 0,
    });
  });

  it("条件が表示される", () => {
    const transition = createTransition({
      conditions: [{ parameterId: "p1", operator: ">", threshold: 0.5 }],
    });
    renderEditor(transition);

    expect(screen.getByDisplayValue("0.5")).toBeInTheDocument();
  });

  it("条件のオペレータが6種類表示される", () => {
    const transition = createTransition({
      conditions: [{ parameterId: "p1", operator: ">", threshold: 0 }],
    });
    const { container } = renderEditor(transition);

    const opSelect = container.querySelector(".sm-op-select") as HTMLSelectElement;
    expect(opSelect.options).toHaveLength(6);
  });

  it("パラメータがないとき条件追加ボタンが無効化される", () => {
    render(
      <TransitionEditor
        transition={createTransition()}
        states={states}
        parameters={[]}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onAddCondition={onAddCondition}
        onRemoveCondition={onRemoveCondition}
        onUpdateCondition={onUpdateCondition}
      />,
    );

    const addBtn = screen.getByText(/\+ 条件追加|\+ Add Condition/i);
    expect(addBtn).toBeDisabled();
  });

  it("不明な状態IDで'?'が表示される", () => {
    renderEditor(createTransition({ fromStateId: "unknown", toStateId: "also-unknown" }));
    expect(screen.getByText(/\?.*→.*\?/)).toBeInTheDocument();
  });


  it("crossfade (transitionDuration) 入力変更でonUpdateが呼ばれる", () => {
    const { container } = renderEditor(createTransition({ transitionDuration: 0.3 }));
    const crossfadeInput = container.querySelector(
      'input[step="0.05"]',
    ) as HTMLInputElement;
    fireEvent.change(crossfadeInput, { target: { value: "1.2" } });

    expect(onUpdate).toHaveBeenCalledWith({ transitionDuration: 1.2 });
  });

  it("crossfade負値は0にクランプされる", () => {
    const { container } = renderEditor(createTransition({ transitionDuration: 0.3 }));
    const crossfadeInput = container.querySelector(
      'input[step="0.05"]',
    ) as HTMLInputElement;
    fireEvent.change(crossfadeInput, { target: { value: "-5" } });

    expect(onUpdate).toHaveBeenCalledWith({ transitionDuration: 0 });
  });

  it("条件のパラメータを変更するとonUpdateConditionが呼ばれる", () => {
    const transition = createTransition({
      conditions: [{ parameterId: "p1", operator: ">", threshold: 0 }],
    });
    const { container } = renderEditor(transition);

    const paramSelect = container.querySelector(
      ".sm-condition select:not(.sm-op-select)",
    ) as HTMLSelectElement;
    fireEvent.change(paramSelect, { target: { value: "p2" } });

    expect(onUpdateCondition).toHaveBeenCalledWith(0, { parameterId: "p2" });
  });

  it("条件のオペレータを変更するとonUpdateConditionが呼ばれる", () => {
    const transition = createTransition({
      conditions: [{ parameterId: "p1", operator: ">", threshold: 0 }],
    });
    const { container } = renderEditor(transition);

    const opSelect = container.querySelector(".sm-op-select") as HTMLSelectElement;
    fireEvent.change(opSelect, { target: { value: "<=" } });

    expect(onUpdateCondition).toHaveBeenCalledWith(0, { operator: "<=" });
  });

  it("条件の閾値を変更するとonUpdateConditionが呼ばれる", () => {
    const transition = createTransition({
      conditions: [{ parameterId: "p1", operator: ">", threshold: 0.42 }],
    });
    renderEditor(transition);

    const thresholdInput = screen.getByDisplayValue("0.42") as HTMLInputElement;
    fireEvent.change(thresholdInput, { target: { value: "0.75" } });

    expect(onUpdateCondition).toHaveBeenCalledWith(0, { threshold: 0.75 });
  });

  it("条件の削除ボタンでonRemoveConditionが呼ばれる", () => {
    const transition = createTransition({
      conditions: [
        { parameterId: "p1", operator: ">", threshold: 0 },
        { parameterId: "p2", operator: "<", threshold: 10 },
      ],
    });
    const { container } = renderEditor(transition);

    const condDeleteBtns = container.querySelectorAll(
      ".sm-condition .physics-btn-danger",
    );
    expect(condDeleteBtns).toHaveLength(2);
    fireEvent.click(condDeleteBtns[1]!);

    expect(onRemoveCondition).toHaveBeenCalledWith(1);
  });
});
