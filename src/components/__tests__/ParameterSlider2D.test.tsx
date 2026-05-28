import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ParameterDefinition } from "@vivi2d/core/types";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParameterSlider2D } from "@/components/ParameterSlider2D";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { useParameterStore } from "@/stores/parameterStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { resetAllStores } from "@/test/store-reset";


function setupPairedParams(): {
  paramX: ParameterDefinition;
  paramY: ParameterDefinition;
} {
  loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
  const store = useParameterDefinitionStore.getState();
  store.addParameter("角度X", -30, 30, 0);
  store.addParameter("角度Y", -30, 30, 0);
  const params = useEditorStore.getState().project!.parameters;
  for (const p of params) {
    useParameterStore.getState().setParameterValue(p.id, p.defaultValue);
  }
  store.pairParameters(params[0]!.id, params[1]!.id);
  const updatedParams = useEditorStore.getState().project!.parameters;
  return { paramX: updatedParams[0]!, paramY: updatedParams[1]! };
}

describe("ParameterSlider2D", () => {
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

  it("パラメータ名が X / Y の形式で表示される", () => {
    const { paramX, paramY } = setupPairedParams();
    render(<ParameterSlider2D paramX={paramX} paramY={paramY} valueX={0} valueY={0} />);
    expect(screen.getByText("角度X / 角度Y")).toBeInTheDocument();
  });

  it("X軸とY軸の値が表示される", () => {
    const { paramX, paramY } = setupPairedParams();
    render(<ParameterSlider2D paramX={paramX} paramY={paramY} valueX={10} valueY={-5} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("-5")).toBeInTheDocument();
  });

  it("結合解除ボタンが表示される", () => {
    const { paramX, paramY } = setupPairedParams();
    render(<ParameterSlider2D paramX={paramX} paramY={paramY} valueX={0} valueY={0} />);
    expect(screen.getByTitle("結合を解除")).toBeInTheDocument();
  });

  it("結合解除ボタンクリックでパラメータの結合が解除される", async () => {
    const user = userEvent.setup();
    const { paramX, paramY } = setupPairedParams();
    render(<ParameterSlider2D paramX={paramX} paramY={paramY} valueX={0} valueY={0} />);
    await user.click(screen.getByTitle("結合を解除"));
    const updatedParam = useEditorStore
      .getState()
      .project!.parameters.find((p) => p.id === paramX.id)!;
    expect(updatedParam.pairedParameterId).toBeUndefined();
  });

  it("パラメータ名ダブルクリックでデフォルト値にリセットされる", async () => {
    const user = userEvent.setup();
    const { paramX, paramY } = setupPairedParams();
    useParameterStore.getState().setParameterValue(paramX.id, 15);
    useParameterStore.getState().setParameterValue(paramY.id, -10);
    render(
      <ParameterSlider2D paramX={paramX} paramY={paramY} valueX={15} valueY={-10} />,
    );
    await user.dblClick(screen.getByText("角度X / 角度Y"));
    expect(useParameterStore.getState().parameterValues[paramX.id]).toBe(0);
    expect(useParameterStore.getState().parameterValues[paramY.id]).toBe(0);
  });

  it("2DパッドのpointerDownイベントでパラメータ値が更新される", () => {
    const { paramX, paramY } = setupPairedParams();
    render(<ParameterSlider2D paramX={paramX} paramY={paramY} valueX={0} valueY={0} />);
    const pad = document.querySelector(".parameter-2d-pad")!;
    vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 140,
      height: 140,
      right: 140,
      bottom: 140,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(pad, { clientX: 70, clientY: 70 });

    const valX = useParameterStore.getState().parameterValues[paramX.id]!;
    const valY = useParameterStore.getState().parameterValues[paramY.id]!;
    expect(valX).toBeCloseTo(0, 0);
    expect(valY).toBeCloseTo(0, 0);
  });

  it("2DパッドのpointerMoveイベントでドラッグ中に値が更新される", () => {
    const { paramX, paramY } = setupPairedParams();
    render(<ParameterSlider2D paramX={paramX} paramY={paramY} valueX={0} valueY={0} />);
    const pad = document.querySelector(".parameter-2d-pad")!;
    vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 140,
      height: 140,
      right: 140,
      bottom: 140,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(pad, { clientX: 70, clientY: 70 });
    fireEvent.pointerMove(pad, { clientX: 140, clientY: 0 });

    const valX = useParameterStore.getState().parameterValues[paramX.id]!;
    const valY = useParameterStore.getState().parameterValues[paramY.id]!;
    expect(valX).toBeCloseTo(30, 0);
    expect(valY).toBeCloseTo(30, 0);
  });

  it("pointerDownなしのpointerMoveでは値が変わらない", () => {
    const { paramX, paramY } = setupPairedParams();
    render(<ParameterSlider2D paramX={paramX} paramY={paramY} valueX={0} valueY={0} />);
    const pad = document.querySelector(".parameter-2d-pad")!;
    vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 140,
      height: 140,
      right: 140,
      bottom: 140,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerMove(pad, { clientX: 140, clientY: 0 });

    expect(useParameterStore.getState().parameterValues[paramX.id]).toBe(0);
    expect(useParameterStore.getState().parameterValues[paramY.id]).toBe(0);
  });

  it("pointerUpでドラッグが終了する", () => {
    const { paramX, paramY } = setupPairedParams();
    render(<ParameterSlider2D paramX={paramX} paramY={paramY} valueX={0} valueY={0} />);
    const pad = document.querySelector(".parameter-2d-pad")!;
    vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 140,
      height: 140,
      right: 140,
      bottom: 140,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(pad, { clientX: 70, clientY: 70 });
    fireEvent.pointerUp(pad);

    fireEvent.pointerMove(pad, { clientX: 0, clientY: 0 });

    const valX = useParameterStore.getState().parameterValues[paramX.id]!;
    const valY = useParameterStore.getState().parameterValues[paramY.id]!;
    expect(valX).toBeCloseTo(0, 0);
    expect(valY).toBeCloseTo(0, 0);
  });

  it("カーソル位置がパーセントで正しくレンダリングされる", () => {
    const { paramX, paramY } = setupPairedParams();
    render(
      <ParameterSlider2D paramX={paramX} paramY={paramY} valueX={30} valueY={-30} />,
    );
    const cursor = document.querySelector(".parameter-2d-cursor")!;
    expect(cursor).toBeInTheDocument();
  });

  it("X軸とY軸のラベルが表示される", () => {
    const { paramX, paramY } = setupPairedParams();
    render(<ParameterSlider2D paramX={paramX} paramY={paramY} valueX={0} valueY={0} />);
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getByText("Y")).toBeInTheDocument();
  });
});
