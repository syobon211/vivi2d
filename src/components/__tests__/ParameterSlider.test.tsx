import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ParameterDefinition } from "@vivi2d/core/types";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParameterSlider } from "@/components/ParameterSlider";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { useParameterStore } from "@/stores/parameterStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { resetAllStores } from "@/test/store-reset";


function setupParam(name = "角度X", min = -30, max = 30, def = 0): ParameterDefinition {
  loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
  useParameterDefinitionStore.getState().addParameter(name, min, max, def);
  const params = useEditorStore.getState().project!.parameters;
  const param = params[params.length - 1]!;
  useParameterStore.getState().setParameterValue(param.id, param.defaultValue);
  return param;
}

describe("ParameterSlider", () => {
  beforeEach(() => {
    resetAllStores();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [{ name: "テスト", left: 0, top: 0, right: 100, bottom: 100 }],
    } as any);
  });

  afterEach(() => {
    resetAllStores();
  });

  it("パラメータ名と現在値を表示する", () => {
    const param = setupParam("角度X", -30, 30, 5);
    render(<ParameterSlider param={param} value={5} />);
    expect(screen.getByText("角度X")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("スライダーのmin/max/valueが正しく設定される", () => {
    const param = setupParam("角度X", -30, 30, 10);
    render(<ParameterSlider param={param} value={10} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("min", "-30");
    expect(slider).toHaveAttribute("max", "30");
    expect(slider).toHaveValue("10");
  });

  it("スライダー変更でパラメータ値が更新される", () => {
    const param = setupParam("角度X", -30, 30, 0);
    render(<ParameterSlider param={param} value={0} />);
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "15" } });
    expect(useParameterStore.getState().parameterValues[param.id]).toBe(15);
  });

  it("スライダー変更で値がmaxにクランプされる", () => {
    const param = setupParam("角度X", -30, 30, 0);
    render(<ParameterSlider param={param} value={0} />);
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "999" } });
    expect(useParameterStore.getState().parameterValues[param.id]).toBe(30);
  });

  it("スライダー変更で値がminにクランプされる", () => {
    const param = setupParam("角度X", -30, 30, 0);
    render(<ParameterSlider param={param} value={0} />);
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "-999" } });
    expect(useParameterStore.getState().parameterValues[param.id]).toBe(-30);
  });

  it("パラメータ名ダブルクリックでデフォルト値にリセットされる", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 5);
    useParameterStore.getState().setParameterValue(param.id, 20);
    render(<ParameterSlider param={param} value={20} />);
    await user.dblClick(screen.getByText("角度X"));
    expect(useParameterStore.getState().parameterValues[param.id]).toBe(5);
  });

  it("削除ボタンでパラメータが削除される", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 0);
    render(<ParameterSlider param={param} value={0} />);
    await user.click(screen.getByTitle("パラメータを削除"));
    expect(useEditorStore.getState().project!.parameters).toHaveLength(0);
    expect(useParameterStore.getState().parameterValues[param.id]).toBeUndefined();
  });

  it("結合ボタンクリックでペアメニューが表示される", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 0);
    useParameterDefinitionStore.getState().addParameter("角度Y", -30, 30, 0);
    render(<ParameterSlider param={param} value={0} />);
    await user.click(screen.getByTitle("パラメータを結合"));
    expect(screen.getByText("角度Y")).toBeInTheDocument();
  });

  it("ペアメニューで候補を選択すると結合される", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 0);
    useParameterDefinitionStore.getState().addParameter("角度Y", -30, 30, 0);
    const paramY = useEditorStore.getState().project!.parameters[1]!;
    render(<ParameterSlider param={param} value={0} />);
    await user.click(screen.getByTitle("パラメータを結合"));
    await user.click(screen.getByText("角度Y"));
    const updatedParam = useEditorStore
      .getState()
      .project!.parameters.find((p) => p.id === param.id)!;
    expect(updatedParam.pairedParameterId).toBe(paramY.id);
  });

  it("結合候補がない場合はメニューに「結合可能なパラメータなし」が表示される", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 0);
    render(<ParameterSlider param={param} value={0} />);
    await user.click(screen.getByTitle("パラメータを結合"));
    expect(screen.getByText("結合可能なパラメータなし")).toBeInTheDocument();
  });

  it("グループ変更ボタンでグループ編集UIが表示される", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 0);
    render(<ParameterSlider param={param} value={0} />);
    await user.click(screen.getByTitle("グループ変更"));
    expect(screen.getByPlaceholderText("グループ名（空で解除）")).toBeInTheDocument();
  });

  it("グループ編集でOKボタンを押すとグループが設定される", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 0);
    render(<ParameterSlider param={param} value={0} />);
    await user.click(screen.getByTitle("グループ変更"));
    const input = screen.getByPlaceholderText("グループ名（空で解除）");
    await user.clear(input);
    await user.type(input, "顔");
    await user.click(screen.getByText(/OK|確認/));
    const updatedParam = useEditorStore
      .getState()
      .project!.parameters.find((p) => p.id === param.id)!;
    expect(updatedParam.group).toBe("顔");
  });

  it("グループ編集でEnterキーを押すとグループが設定される", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 0);
    render(<ParameterSlider param={param} value={0} />);
    await user.click(screen.getByTitle("グループ変更"));
    const input = screen.getByPlaceholderText("グループ名（空で解除）");
    await user.clear(input);
    await user.type(input, "体");
    await user.keyboard("{Enter}");
    const updatedParam = useEditorStore
      .getState()
      .project!.parameters.find((p) => p.id === param.id)!;
    expect(updatedParam.group).toBe("体");
  });

  it("グループ編集でEscapeキーを押すと編集がキャンセルされる", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 0);
    render(<ParameterSlider param={param} value={0} />);
    await user.click(screen.getByTitle("グループ変更"));
    expect(screen.getByPlaceholderText("グループ名（空で解除）")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByPlaceholderText("グループ名（空で解除）"),
    ).not.toBeInTheDocument();
  });

  it("グループ編集で空文字を送信するとグループが解除される", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 0);
    useParameterDefinitionStore.getState().setParameterGroup(param.id, "顔");
    render(<ParameterSlider param={param} value={0} />);
    await user.click(screen.getByTitle("グループ変更"));
    const input = screen.getByPlaceholderText("グループ名（空で解除）");
    await user.clear(input);
    await user.click(screen.getByText(/OK|確認/));
    const updatedParam = useEditorStore
      .getState()
      .project!.parameters.find((p) => p.id === param.id)!;
    expect(updatedParam.group).toBeUndefined();
  });

  it("existingGroupsを渡すとdatalistに候補が表示される", async () => {
    const user = userEvent.setup();
    const param = setupParam("角度X", -30, 30, 0);
    render(
      <ParameterSlider param={param} value={0} existingGroups={["顔", "体", "髪"]} />,
    );
    await user.click(screen.getByTitle("グループ変更"));
    const datalist = document.getElementById("param-group-edit-suggestions");
    expect(datalist).toBeInTheDocument();
    expect(datalist!.querySelectorAll("option")).toHaveLength(3);
  });
});
