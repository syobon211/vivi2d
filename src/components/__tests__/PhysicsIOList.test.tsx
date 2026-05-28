import { fireEvent, render, screen } from "@testing-library/react";
import type { ParameterDefinition } from "@vivi2d/core/types";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createBoneNode, createEmptyProject, createPhysicsGroup } from "@/test/fixtures";
import { resetEditorStore, resetPhysicsStore } from "@/test/store-reset";
import { PhysicsIOList } from "../physics/PhysicsIOList";


const testParams: ParameterDefinition[] = [
  { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
  { id: "p2", name: "角度Y", minValue: -30, maxValue: 30, defaultValue: 0 },
];

const testBone = createBoneNode({ id: "bone-1", name: "テストボーン" });

function setupStores() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: testParams,
      layers: [testBone],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
}


describe("PhysicsIOList", () => {
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

  it("入力セクションが表示される", () => {
    const group = createPhysicsGroup();

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getByText("入力")).toBeInTheDocument();
  });

  it("出力セクションが表示される", () => {
    const group = createPhysicsGroup();

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getByText("出力")).toBeInTheDocument();
  });

  it("入力追加ドロップダウンにパラメータが表示される", () => {
    const group = createPhysicsGroup();

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getAllByText("角度X").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("角度Y").length).toBeGreaterThanOrEqual(1);
  });

  it("入力がある場合、入力マッピングが表示される", () => {
    const group = createPhysicsGroup({
      inputs: [{ parameterId: "p1", weight: 1, type: "x" }],
    });

    render(<PhysicsIOList group={group} parameters={testParams} />);

    const mappings = document.querySelectorAll(".physics-mapping");
    expect(mappings.length).toBeGreaterThanOrEqual(1);
  });

  it("入力マッピングのタイプセレクトが表示される", () => {
    const group = createPhysicsGroup({
      inputs: [{ parameterId: "p1", weight: 1, type: "x" }],
    });

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getByText("X")).toBeInTheDocument();
  });

  it("入力削除ボタンが表示される", () => {
    const group = createPhysicsGroup({
      inputs: [{ parameterId: "p1", weight: 1, type: "x" }],
    });

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getByTitle("入力を削除")).toBeInTheDocument();
  });

  it("出力にパラメータ名が表示される", () => {
    const group = createPhysicsGroup({
      outputs: [{ parameterId: "p1", pendulumIndex: 0, weight: 10, type: "angle" }],
    });

    render(<PhysicsIOList group={group} parameters={testParams} />);

    const mappings = document.querySelectorAll(".physics-mapping");
    expect(mappings.length).toBeGreaterThanOrEqual(1);
  });

  it("ボーン出力がある場合にボーン名が表示される", () => {
    const group = createPhysicsGroup({
      outputs: [{ boneId: "bone-1", pendulumIndex: 0, weight: 2, type: "boneAngle" }],
    });

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getByText("テストボーン (角度)")).toBeInTheDocument();
  });

  it("出力にペンデュラムインデックスとウェイトが表示される", () => {
    const group = createPhysicsGroup({
      outputs: [{ parameterId: "p1", pendulumIndex: 0, weight: 10, type: "angle" }],
    });

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("w:10")).toBeInTheDocument();
  });

  it("出力削除ボタンが表示される", () => {
    const group = createPhysicsGroup({
      outputs: [{ parameterId: "p1", pendulumIndex: 0, weight: 10, type: "angle" }],
    });

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getByTitle("出力を削除")).toBeInTheDocument();
  });

  it("出力追加ドロップダウンにパラメータとボーンのoptgroupが存在する", () => {
    const group = createPhysicsGroup();

    const { container } = render(<PhysicsIOList group={group} parameters={testParams} />);

    const optgroups = container.querySelectorAll("optgroup");
    const labels = Array.from(optgroups).map((og) => og.getAttribute("label"));
    expect(labels).toContain("パラメータ");
    expect(labels).toContain("ボーン");
  });


  it("入力追加ドロップダウンで選択すると addPhysicsInput が呼ばれる", () => {
    const group = createPhysicsGroup();
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "addPhysicsInput");

    const { container } = render(<PhysicsIOList group={group} parameters={testParams} />);
    const selects = container.querySelectorAll("select") as NodeListOf<HTMLSelectElement>;
    fireEvent.change(selects[0]!, { target: { value: "p1" } });

    expect(spy).toHaveBeenCalledWith(group.id, {
      parameterId: "p1",
      weight: 1,
      type: "x",
    });
  });

  it("入力タイプを変更すると removePhysicsInput + addPhysicsInput が呼ばれる", () => {
    const group = createPhysicsGroup({
      inputs: [{ parameterId: "p1", weight: 1, type: "x" }],
    });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const removeSpy = vi.spyOn(usePhysicsStore.getState(), "removePhysicsInput");
    const addSpy = vi.spyOn(usePhysicsStore.getState(), "addPhysicsInput");

    const { container } = render(<PhysicsIOList group={group} parameters={testParams} />);
    const mappingSelects = container.querySelectorAll(
      ".physics-mapping select",
    ) as NodeListOf<HTMLSelectElement>;
    fireEvent.change(mappingSelects[0]!, { target: { value: "angle" } });

    expect(removeSpy).toHaveBeenCalledWith(group.id, 0);
    expect(addSpy).toHaveBeenCalledWith(group.id, {
      parameterId: "p1",
      weight: 1,
      type: "angle",
    });
  });

  it("入力削除ボタンをクリックすると removePhysicsInput が呼ばれる", () => {
    const group = createPhysicsGroup({
      inputs: [{ parameterId: "p1", weight: 1, type: "x" }],
    });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "removePhysicsInput");

    render(<PhysicsIOList group={group} parameters={testParams} />);
    fireEvent.click(screen.getByTitle("入力を削除"));

    expect(spy).toHaveBeenCalledWith(group.id, 0);
  });

  it("出力追加ドロップダウンでパラメータを選択すると addPhysicsOutput が呼ばれる", () => {
    const group = createPhysicsGroup();
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        layers: [testBone],
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "addPhysicsOutput");

    const { container } = render(<PhysicsIOList group={group} parameters={testParams} />);
    const selects = container.querySelectorAll("select") as NodeListOf<HTMLSelectElement>;
    fireEvent.change(selects[1]!, { target: { value: "p2" } });

    expect(spy).toHaveBeenCalledWith(group.id, {
      parameterId: "p2",
      pendulumIndex: 0,
      weight: 10,
      type: "angle",
    });
  });

  it("出力追加ドロップダウンでボーンを選択すると boneAngle 出力として追加される", () => {
    const group = createPhysicsGroup();
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        layers: [testBone],
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "addPhysicsOutput");

    const { container } = render(<PhysicsIOList group={group} parameters={testParams} />);
    const selects = container.querySelectorAll("select") as NodeListOf<HTMLSelectElement>;
    fireEvent.change(selects[1]!, { target: { value: `bone:${testBone.id}` } });

    expect(spy).toHaveBeenCalledWith(group.id, {
      boneId: testBone.id,
      pendulumIndex: 0,
      weight: 2,
      type: "boneAngle",
    });
  });

  it("出力削除ボタンをクリックすると removePhysicsOutput が呼ばれる", () => {
    const group = createPhysicsGroup({
      outputs: [{ parameterId: "p1", pendulumIndex: 0, weight: 10, type: "angle" }],
    });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: testParams,
        physicsGroups: [group],
      },
      projectVersion: 1,
    });
    const spy = vi.spyOn(usePhysicsStore.getState(), "removePhysicsOutput");

    render(<PhysicsIOList group={group} parameters={testParams} />);
    fireEvent.click(screen.getByTitle("出力を削除"));

    expect(spy).toHaveBeenCalledWith(group.id, 0);
  });

  it("存在しないパラメータIDの入力は「不明」と表示される", () => {
    const group = createPhysicsGroup({
      inputs: [{ parameterId: "non-existent", weight: 1, type: "x" }],
    });

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getByText("不明")).toBeInTheDocument();
  });

  it("存在しないボーンIDのboneAngle出力は「不明ボーン」と表示される", () => {
    const group = createPhysicsGroup({
      outputs: [
        { boneId: "missing-bone", pendulumIndex: 0, weight: 2, type: "boneAngle" },
      ],
    });

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getByText("不明ボーン")).toBeInTheDocument();
  });

  it("boneId も parameterId もない出力は「不明」と表示される", () => {
    const group = createPhysicsGroup({
      outputs: [{ pendulumIndex: 0, weight: 5, type: "angle" }],
    });

    render(<PhysicsIOList group={group} parameters={testParams} />);

    expect(screen.getByText("不明")).toBeInTheDocument();
  });

  it("パラメータなしでもボーン出力optgroupは表示される", () => {
    const group = createPhysicsGroup();
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: [],
        layers: [testBone],
      },
      projectVersion: 1,
    });

    const { container } = render(<PhysicsIOList group={group} parameters={[]} />);
    const optgroups = container.querySelectorAll("optgroup");
    const labels = Array.from(optgroups).map((og) => og.getAttribute("label"));
    expect(labels).toContain("ボーン");
    expect(labels).not.toContain("パラメータ");
  });

  it("空文字が選択された場合は何もしない", () => {
    const group = createPhysicsGroup();
    const inputSpy = vi.spyOn(usePhysicsStore.getState(), "addPhysicsInput");
    const outputSpy = vi.spyOn(usePhysicsStore.getState(), "addPhysicsOutput");

    const { container } = render(<PhysicsIOList group={group} parameters={testParams} />);
    const selects = container.querySelectorAll("select") as NodeListOf<HTMLSelectElement>;
    fireEvent.change(selects[0]!, { target: { value: "" } });
    fireEvent.change(selects[1]!, { target: { value: "" } });

    expect(inputSpy).not.toHaveBeenCalled();
    expect(outputSpy).not.toHaveBeenCalled();
  });
});
