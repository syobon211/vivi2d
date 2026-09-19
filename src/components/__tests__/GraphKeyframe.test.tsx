import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GraphKeyframe } from "../timeline/GraphKeyframe";

function renderInSvg(element: React.ReactElement) {
  return render(
    <svg>
      <title>test</title>
      {element}
    </svg>,
  );
}

describe("GraphKeyframe", () => {
  const defaultProps = {
    parameterId: "param-1",
    frame: 5,
    cx: 100,
    cy: 50,
    handleOutX: null,
    handleOutY: null,
    handleInX: null,
    handleInY: null,
    selected: false,
    onDragKeyframe: vi.fn(),
    onDragHandleOut: null,
    onDragHandleIn: null,
    onDragEnd: vi.fn(),
    onClick: vi.fn(),
  };

  it("両方のハンドルが表示される", () => {
    const { container } = renderInSvg(
      <GraphKeyframe
        {...defaultProps}
        handleOutX={150}
        handleOutY={30}
        handleInX={60}
        handleInY={70}
        onDragHandleOut={vi.fn()}
        onDragHandleIn={vi.fn()}
      />,
    );

    const handles = container.querySelectorAll(".graph-handle");
    expect(handles).toHaveLength(2);

    const lines = container.querySelectorAll("line");
    expect(lines).toHaveLength(2);
  });

  it("selected=true でキーフレームドットのスタイルが変わる", () => {
    const { container: c1 } = renderInSvg(
      <GraphKeyframe {...defaultProps} selected={false} />,
    );
    const { container: c2 } = renderInSvg(
      <GraphKeyframe {...defaultProps} selected={true} />,
    );

    const dot1 = c1.querySelector(".graph-keyframe-dot")!;
    const dot2 = c2.querySelector(".graph-keyframe-dot")!;
    expect(dot1.getAttribute("stroke-width")).toBe("1");
    expect(dot2.getAttribute("stroke-width")).toBe("2");
  });

  it("キーフレームドラッグでonDragKeyframeがdy付きで呼ばれる", () => {
    const onDragKeyframe = vi.fn();
    const onClick = vi.fn();
    const onDragEnd = vi.fn();
    const { container } = renderInSvg(
      <GraphKeyframe
        {...defaultProps}
        onDragKeyframe={onDragKeyframe}
        onClick={onClick}
        onDragEnd={onDragEnd}
      />,
    );

    const dot = container.querySelector(".graph-keyframe-dot")!;
    const g = dot.closest("g")!;
    expect(dot).toHaveAttribute("cx", "100");
    expect(dot).toHaveAttribute("cy", "50");
    expect(container.querySelectorAll(".graph-handle")).toHaveLength(0);
    fireEvent.pointerMove(g, { clientX: 110, clientY: 55, pointerId: 1 });
    fireEvent.pointerUp(g, { pointerId: 1 });
    expect(onDragKeyframe).not.toHaveBeenCalled();
    expect(onDragEnd).not.toHaveBeenCalled();
    vi.spyOn(dot as SVGElement, "setPointerCapture").mockImplementation(() => {});
    fireEvent.pointerDown(dot, { clientX: 100, clientY: 50, pointerId: 1 });
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(g, { pointerId: 1 });
    expect(onDragKeyframe).not.toHaveBeenCalled();
    expect(onDragEnd).toHaveBeenCalledTimes(1);

    onClick.mockClear();
    onDragEnd.mockClear();
    fireEvent.pointerDown(dot, { clientX: 100, clientY: 50, pointerId: 1 });
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(g, { clientX: 100, clientY: 60, pointerId: 1 });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDragKeyframe).toHaveBeenCalledWith(10);
    fireEvent.pointerUp(g, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(g, { clientX: 120, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(g, { pointerId: 1 });
    expect(onDragKeyframe).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("出力ハンドルドラッグでonDragHandleOutが呼ばれる", () => {
    const onDragHandleOut = vi.fn();
    const { container } = renderInSvg(
      <GraphKeyframe
        {...defaultProps}
        handleOutX={150}
        handleOutY={30}
        onDragHandleOut={onDragHandleOut}
      />,
    );

    const handles = container.querySelectorAll(".graph-handle");
    expect(handles).toHaveLength(1);
    const lines = container.querySelectorAll("line");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute("x1", "100");
    expect(lines[0]).toHaveAttribute("x2", "150");
    const outHandle = handles[0]!;
    const g = outHandle.closest("g")!;
    vi.spyOn(outHandle as SVGElement, "setPointerCapture").mockImplementation(() => {});
    fireEvent.pointerDown(outHandle, { clientX: 150, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(g, { clientX: 160, clientY: 35, pointerId: 1 });
    expect(onDragHandleOut).toHaveBeenCalledWith(10, 5);
  });

  it("入力ハンドルドラッグでonDragHandleInが呼ばれる", () => {
    const onDragHandleIn = vi.fn();
    const { container } = renderInSvg(
      <GraphKeyframe
        {...defaultProps}
        handleInX={60}
        handleInY={70}
        onDragHandleIn={onDragHandleIn}
      />,
    );

    const handles = container.querySelectorAll(".graph-handle");
    expect(handles).toHaveLength(1);
    const inHandle = handles[0]!;
    const g = inHandle.closest("g")!;
    vi.spyOn(inHandle as SVGElement, "setPointerCapture").mockImplementation(() => {});
    fireEvent.pointerDown(inHandle, { clientX: 60, clientY: 70, pointerId: 1 });
    fireEvent.pointerMove(g, { clientX: 55, clientY: 65, pointerId: 1 });
    expect(onDragHandleIn).toHaveBeenCalledWith(-5, -5);
  });

  // ============================================================
  // P8-5c: WCAG 2.2 SC 2.5.7 Dragging Movements
  // ============================================================

  it("右クリック (contextmenu) で onRequestEditValue が clientX/Y 付きで呼ばれる", () => {
    const onRequestEditValue = vi.fn();
    const onClick = vi.fn();
    const { container } = renderInSvg(
      <GraphKeyframe
        {...defaultProps}
        onClick={onClick}
        onRequestEditValue={onRequestEditValue}
      />,
    );

    const dot = container.querySelector(".graph-keyframe-dot")!;
    fireEvent.contextMenu(dot, { clientX: 250, clientY: 180 });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onRequestEditValue).toHaveBeenCalledTimes(1);
    expect(onRequestEditValue).toHaveBeenCalledWith(250, 180);
  });

  it("Enter キーで onRequestEditValue が呼ばれる (getBoundingClientRect の中心座標)", () => {
    const onRequestEditValue = vi.fn();
    const { container } = renderInSvg(
      <GraphKeyframe {...defaultProps} onRequestEditValue={onRequestEditValue} />,
    );

    const dot = container.querySelector(".graph-keyframe-dot")! as SVGElement;
    vi.spyOn(dot, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      width: 20,
      height: 20,
      right: 120,
      bottom: 70,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.keyDown(dot, { key: "Enter" });

    expect(onRequestEditValue).toHaveBeenCalledTimes(1);
    expect(onRequestEditValue).toHaveBeenCalledWith(110, 60);
  });

  it("Space キーで onRequestEditValue が呼ばれる", () => {
    const onRequestEditValue = vi.fn();
    const { container } = renderInSvg(
      <GraphKeyframe {...defaultProps} onRequestEditValue={onRequestEditValue} />,
    );

    const dot = container.querySelector(".graph-keyframe-dot")! as SVGElement;
    vi.spyOn(dot, "getBoundingClientRect").mockReturnValue({
      left: 200,
      top: 100,
      width: 10,
      height: 10,
      right: 210,
      bottom: 110,
      x: 200,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.keyDown(dot, { key: " " });

    expect(onRequestEditValue).toHaveBeenCalledTimes(1);
    expect(onRequestEditValue).toHaveBeenCalledWith(205, 105);
  });

  it("onRequestEditValue が未指定なら contextmenu / Enter / Space で何も起きない", () => {
    const onClick = vi.fn();
    const { container } = renderInSvg(
      <GraphKeyframe {...defaultProps} onClick={onClick} />,
    );

    const dot = container.querySelector(".graph-keyframe-dot")!;
    fireEvent.contextMenu(dot, { clientX: 0, clientY: 0 });
    fireEvent.keyDown(dot, { key: "Enter" });
    fireEvent.keyDown(dot, { key: " " });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("Tab/その他キーでは onRequestEditValue が呼ばれない", () => {
    const onRequestEditValue = vi.fn();
    const { container } = renderInSvg(
      <GraphKeyframe {...defaultProps} onRequestEditValue={onRequestEditValue} />,
    );

    const dot = container.querySelector(".graph-keyframe-dot")!;
    fireEvent.keyDown(dot, { key: "Tab" });
    fireEvent.keyDown(dot, { key: "a" });
    fireEvent.keyDown(dot, { key: "Escape" });

    expect(onRequestEditValue).not.toHaveBeenCalled();
  });

  it("a11y 属性: role='button' / tabIndex=0 / aria-keyshortcuts / aria-haspopup / data-kf-id が設定される", () => {
    const { container } = renderInSvg(
      <GraphKeyframe {...defaultProps} ariaLabel="キーフレーム フレーム5 値0.3" />,
    );

    const dot = container.querySelector(".graph-keyframe-dot")!;
    expect(dot.getAttribute("role")).toBe("button");
    expect(dot.getAttribute("tabindex")).toBe("0");
    expect(dot.getAttribute("aria-label")).toBe("キーフレーム フレーム5 値0.3");
    expect(dot.getAttribute("aria-haspopup")).toBe("dialog");
    expect(dot.getAttribute("aria-keyshortcuts")).toBe("Enter Space");
    expect(dot.getAttribute("data-kf-id")).toBe("param-1-5");
  });
});
