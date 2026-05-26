import { fireEvent, render, screen } from "@testing-library/react";
import type { ArtPathNode } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useArtPathStore } from "@/stores/artPathStore";
import { resetAllStores } from "@/test/store-reset";
import { ArtPathProperties } from "../ArtPathProperties";


function createArtPathLayer(overrides?: Partial<ArtPathNode>): ArtPathNode {
  return {
    kind: "artPath",
    id: "artpath-1",
    name: "テストパス",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    blendMode: "normal",
    expanded: true,
    children: [],
    closed: false,
    style: {
      color: 0xff0000,
      baseWidth: 3,
      lineCap: "round" as CanvasLineCap,
    },
    controlPoints: [
      { x: 10, y: 20, width: 1.0, handleIn: null, handleOut: null },
      { x: 50, y: 80, width: 2.0, handleIn: null, handleOut: null },
      { x: 90, y: 30, width: 1.5, handleIn: null, handleOut: null },
    ],
    ...overrides,
  } as ArtPathNode;
}

describe("ArtPathProperties", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("セクションタイトルを表示する", () => {
    render(<ArtPathProperties layer={createArtPathLayer()} />);
    expect(screen.getByText("アートパス")).toBeInTheDocument();
  });

  it("色入力が正しいhex値を表示する", () => {
    const layer = createArtPathLayer({
      style: { color: 0x00ff00, baseWidth: 3, lineCap: "round" },
    } as Partial<ArtPathNode>);
    const { container } = render(<ArtPathProperties layer={layer} />);

    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colorInput.value).toBe("#00ff00");
  });

  it("幅入力が正しい値を表示する", () => {
    const layer = createArtPathLayer();
    const { container } = render(<ArtPathProperties layer={layer} />);

    const widthInput = container.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(widthInput.value).toBe("3");
  });

  it("閉じたパスチェックボックスを表示する", () => {
    render(<ArtPathProperties layer={createArtPathLayer()} />);
    expect(screen.getByText("閉じたパス")).toBeInTheDocument();
  });

  it("制御点数を表示する", () => {
    render(<ArtPathProperties layer={createArtPathLayer()} />);
    expect(screen.getByText("制御点 (3)")).toBeInTheDocument();
  });

  it("制御点の座標を表示する", () => {
    render(<ArtPathProperties layer={createArtPathLayer()} />);

    expect(screen.getByText("(10, 20)")).toBeInTheDocument();
    expect(screen.getByText("(50, 80)")).toBeInTheDocument();
    expect(screen.getByText("(90, 30)")).toBeInTheDocument();
  });

  it("制御点の幅を表示する", () => {
    render(<ArtPathProperties layer={createArtPathLayer()} />);

    expect(screen.getByText("w:1.0")).toBeInTheDocument();
    expect(screen.getByText("w:2.0")).toBeInTheDocument();
    expect(screen.getByText("w:1.5")).toBeInTheDocument();
  });

  it("制御点削除ボタンが制御点数分ある", () => {
    render(<ArtPathProperties layer={createArtPathLayer()} />);

    const removeButtons = screen.getAllByTitle("制御点を削除");
    expect(removeButtons).toHaveLength(3);
  });

  it("線端セレクトが正しい値を表示する", () => {
    render(<ArtPathProperties layer={createArtPathLayer()} />);

    const select = screen.getByDisplayValue("丸");
    expect(select).toBeInTheDocument();
  });

  it("制御点が0個のとき空リストを表示する", () => {
    const layer = createArtPathLayer();
    layer.controlPoints = [];
    render(<ArtPathProperties layer={layer} />);

    expect(screen.getByText("制御点 (0)")).toBeInTheDocument();
    expect(screen.queryAllByTitle("制御点を削除")).toHaveLength(0);
  });


  it("色入力を変更するとsetStyleが呼ばれる", () => {
    const layer = createArtPathLayer();
    const spy = vi.spyOn(useArtPathStore.getState(), "setStyle");
    const { container } = render(<ArtPathProperties layer={layer} />);

    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#00ff00" } });

    expect(spy).toHaveBeenCalledWith(layer.id, { color: 0x00ff00 });
  });

  it("幅入力を変更するとsetStyleが呼ばれる", () => {
    const layer = createArtPathLayer();
    const spy = vi.spyOn(useArtPathStore.getState(), "setStyle");
    const { container } = render(<ArtPathProperties layer={layer} />);

    const widthInput = container.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: "5.5" } });

    expect(spy).toHaveBeenCalledWith(layer.id, { baseWidth: 5.5 });
  });

  it("閉じたパスチェックボックスを切り替えるとsetClosedが呼ばれる", () => {
    const layer = createArtPathLayer({ closed: false });
    const spy = vi.spyOn(useArtPathStore.getState(), "setClosed");
    const { container } = render(<ArtPathProperties layer={layer} />);

    const checkbox = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    expect(spy).toHaveBeenCalledWith(layer.id, true);
  });

  it("線端セレクトを変更するとsetStyleが呼ばれる", () => {
    const layer = createArtPathLayer();
    const spy = vi.spyOn(useArtPathStore.getState(), "setStyle");
    render(<ArtPathProperties layer={layer} />);

    const select = screen.getByDisplayValue("丸") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "butt" } });

    expect(spy).toHaveBeenCalledWith(layer.id, { lineCap: "butt" });
  });

  it("制御点削除ボタンをクリックするとremoveControlPointが呼ばれる", () => {
    const layer = createArtPathLayer();
    const spy = vi.spyOn(useArtPathStore.getState(), "removeControlPoint");
    render(<ArtPathProperties layer={layer} />);

    const deleteBtns = screen.getAllByTitle("制御点を削除");
    fireEvent.click(deleteBtns[1]!);

    expect(spy).toHaveBeenCalledWith(layer.id, 1);
  });
});
