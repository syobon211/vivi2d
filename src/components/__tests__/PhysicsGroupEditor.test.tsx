import { fireEvent, render, screen } from "@testing-library/react";
import type { ParameterDefinition } from "@vivi2d/core/types";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createEmptyProject, createPhysicsGroup } from "@/test/fixtures";
import { resetEditorStore, resetPhysicsStore } from "@/test/store-reset";
import { PhysicsGroupEditor } from "../physics/PhysicsGroupEditor";


const testParams: ParameterDefinition[] = [
  { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
  { id: "p2", name: "角度Y", minValue: -30, maxValue: 30, defaultValue: 0 },
];

function setupStores() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: testParams,
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
}


describe("PhysicsGroupEditor", () => {
  beforeEach(() => {
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [],
    } as any);
    setupStores();
  });
  afterEach(() => {
    resetEditorStore();
    resetPhysicsStore();
  });

  it("グループ名が表示される", () => {
    const group = createPhysicsGroup({ name: "髪物理" });

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    expect(screen.getByText("髪物理")).toBeInTheDocument();
  });

  it("有効/無効チェックボックスが表示される", () => {
    const group = createPhysicsGroup({ enabled: true });

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    const checkbox = screen.getByTitle("グループ有効/無効");
    expect(checkbox).toBeChecked();
  });

  it("削除ボタンが表示される", () => {
    const group = createPhysicsGroup();

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    expect(screen.getByTitle("グループを削除")).toBeInTheDocument();
  });

  it("重力スライダーが表示される", () => {
    const group = createPhysicsGroup({ gravityStrength: 9.8 });

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    expect(screen.getByText("重力")).toBeInTheDocument();
    expect(screen.getByText("9.8")).toBeInTheDocument();
  });

  it("風スライダーが表示される", () => {
    const group = createPhysicsGroup({ wind: 0 });

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    expect(screen.getByText("風")).toBeInTheDocument();
    expect(screen.getByText("0.0")).toBeInTheDocument();
  });

  it("振り子リストが表示される", () => {
    const group = createPhysicsGroup({
      pendulums: [
        { length: 1, mass: 1, damping: 0.05 },
        { length: 2, mass: 1.5, damping: 0.1 },
      ],
    });

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    expect(screen.getByText("振り子 (2)")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("振り子追加ボタンが表示される", () => {
    const group = createPhysicsGroup();

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    expect(screen.getByTitle("振り子を追加")).toBeInTheDocument();
  });

  it("振り子が2つ以上の場合、削除ボタンが表示される", () => {
    const group = createPhysicsGroup({
      pendulums: [
        { length: 1, mass: 1, damping: 0.05 },
        { length: 2, mass: 1.5, damping: 0.1 },
      ],
    });

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    const deleteBtns = screen.getAllByTitle("振り子を削除");
    expect(deleteBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("振り子が1つだけの場合、削除ボタンが表示されない", () => {
    const group = createPhysicsGroup({
      pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
    });

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    expect(screen.queryByTitle("振り子を削除")).not.toBeInTheDocument();
  });

  it("入力セクションが表示される", () => {
    const group = createPhysicsGroup();

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    expect(screen.getByText("入力")).toBeInTheDocument();
  });

  it("出力セクションが表示される", () => {
    const group = createPhysicsGroup();

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);

    expect(screen.getByText("出力")).toBeInTheDocument();
  });


  it("有効/無効チェックボックスをクリックすると updatePhysicsGroup が呼ばれる", () => {
    const group = createPhysicsGroup({ enabled: false });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "updatePhysicsGroup");

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);
    const checkbox = screen.getByTitle("グループ有効/無効") as HTMLInputElement;
    fireEvent.click(checkbox);

    expect(spy).toHaveBeenCalledWith(group.id, { enabled: true });
  });

  it("削除ボタンをクリックすると removePhysicsGroup が呼ばれる", () => {
    const group = createPhysicsGroup();
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "removePhysicsGroup");

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);
    fireEvent.click(screen.getByTitle("グループを削除"));

    expect(spy).toHaveBeenCalledWith(group.id);
  });

  it("重力スライダーを動かすと updatePhysicsGroup が呼ばれる", () => {
    const group = createPhysicsGroup({ gravityStrength: 5 });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "updatePhysicsGroup");

    const { container } = render(
      <PhysicsGroupEditor group={group} parameters={testParams} />,
    );
    const sliders = container.querySelectorAll(
      'input[type="range"]',
    ) as NodeListOf<HTMLInputElement>;
    fireEvent.change(sliders[0]!, { target: { value: "7.5" } });

    expect(spy).toHaveBeenCalledWith(group.id, { gravityStrength: 7.5 });
  });

  it("風スライダーを動かすと updatePhysicsGroup が呼ばれる", () => {
    const group = createPhysicsGroup({ wind: 0 });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "updatePhysicsGroup");

    const { container } = render(
      <PhysicsGroupEditor group={group} parameters={testParams} />,
    );
    const sliders = container.querySelectorAll(
      'input[type="range"]',
    ) as NodeListOf<HTMLInputElement>;
    fireEvent.change(sliders[1]!, { target: { value: "-3.5" } });

    expect(spy).toHaveBeenCalledWith(group.id, { wind: -3.5 });
  });

  it("振り子追加ボタンをクリックすると addPendulum が呼ばれる", () => {
    const group = createPhysicsGroup();
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "addPendulum");

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);
    fireEvent.click(screen.getByTitle("振り子を追加"));

    expect(spy).toHaveBeenCalledWith(group.id);
  });

  it("振り子の長さ/質量/減衰を変更すると updatePendulum が呼ばれる", () => {
    const group = createPhysicsGroup({
      pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
    });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "updatePendulum");

    const { container } = render(
      <PhysicsGroupEditor group={group} parameters={testParams} />,
    );
    const numberInputs = container.querySelectorAll(
      'input[type="number"]',
    ) as NodeListOf<HTMLInputElement>;
    fireEvent.change(numberInputs[0]!, { target: { value: "2.5" } });
    expect(spy).toHaveBeenCalledWith(group.id, 0, { length: 2.5 });

    fireEvent.change(numberInputs[1]!, { target: { value: "3" } });
    expect(spy).toHaveBeenCalledWith(group.id, 0, { mass: 3 });

    fireEvent.change(numberInputs[2]!, { target: { value: "0.25" } });
    expect(spy).toHaveBeenCalledWith(group.id, 0, { damping: 0.25 });
  });

  it("複数振り子で削除ボタンをクリックすると removePendulum が呼ばれる", () => {
    const group = createPhysicsGroup({
      pendulums: [
        { length: 1, mass: 1, damping: 0.05 },
        { length: 2, mass: 1.5, damping: 0.1 },
      ],
    });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "removePendulum");

    render(<PhysicsGroupEditor group={group} parameters={testParams} />);
    const deleteBtns = screen.getAllByTitle("振り子を削除");
    fireEvent.click(deleteBtns[0]!);

    expect(spy).toHaveBeenCalledWith(group.id, 0);
  });
});
