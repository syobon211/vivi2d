import { render } from "@testing-library/react";
import type { AnimationTrack } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { GraphCurve } from "../timeline/GraphCurve";


function renderInSvg(element: React.ReactElement) {
  return render(
    <svg>
      <title>test</title>
      {element}
    </svg>,
  );
}

function createLinearTrack(): AnimationTrack {
  return {
    parameterId: "p1",
    keyframes: [
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 30, value: 15, interpolation: "linear" },
      { frame: 60, value: 30, interpolation: "linear" },
    ],
  };
}

const frameToX = (frame: number) => 40 + frame * 5;
const valueToY = (value: number) => 100 - value * 2;

describe("GraphCurve", () => {
  it("パスが描画される", () => {
    const { container } = renderInSvg(
      <GraphCurve
        track={createLinearTrack()}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={false}
      />,
    );

    const path = container.querySelector("path");
    expect(path).toBeInTheDocument();
    expect(path!.getAttribute("d")).toContain("M");
    expect(path!.getAttribute("d")).toContain("L");
  });

  it("空のキーフレームリストでは何もレンダリングしない", () => {
    const emptyTrack: AnimationTrack = { parameterId: "p1", keyframes: [] };

    const { container } = renderInSvg(
      <GraphCurve
        track={emptyTrack}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={false}
      />,
    );

    expect(container.querySelector("path")).not.toBeInTheDocument();
  });

  it("selected=true でカーブ色が変わる", () => {
    const { container: c1 } = renderInSvg(
      <GraphCurve
        track={createLinearTrack()}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={false}
      />,
    );
    const { container: c2 } = renderInSvg(
      <GraphCurve
        track={createLinearTrack()}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={true}
      />,
    );

    const stroke1 = c1.querySelector("path")!.getAttribute("stroke");
    const stroke2 = c2.querySelector("path")!.getAttribute("stroke");
    expect(stroke1).not.toBe(stroke2);
  });

  it("ステップ補間でパスに水平線が含まれる", () => {
    const stepTrack: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        { frame: 0, value: 0, interpolation: "step" },
        { frame: 30, value: 15, interpolation: "linear" },
      ],
    };

    const { container } = renderInSvg(
      <GraphCurve
        track={stepTrack}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={false}
      />,
    );

    const d = container.querySelector("path")!.getAttribute("d")!;
    const lCount = (d.match(/L/g) || []).length;
    expect(lCount).toBe(2);
  });

  it("ベジェ補間でパスに C コマンドが含まれる", () => {
    const bezierTrack: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        {
          frame: 0,
          value: 0,
          interpolation: "bezier",
          cp1x: 0.25,
          cp1y: 0,
          cp2x: 0.75,
          cp2y: 1,
        },
        { frame: 30, value: 15, interpolation: "linear" },
      ],
    };

    const { container } = renderInSvg(
      <GraphCurve
        track={bezierTrack}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={false}
      />,
    );

    const d = container.querySelector("path")!.getAttribute("d")!;
    expect(d).toContain("C");
  });

  it("キーフレーム1つでもエラーにならない", () => {
    const singleTrack: AnimationTrack = {
      parameterId: "p1",
      keyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
    };

    expect(() =>
      renderInSvg(
        <GraphCurve
          track={singleTrack}
          frameToX={frameToX}
          valueToY={valueToY}
          selected={false}
        />,
      ),
    ).not.toThrow();
  });

  it("ellipse補間でサンプリング曲線が描画される（cwモード）", () => {
    const track: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        {
          frame: 0,
          value: 0,
          interpolation: "ellipse",
          ellipseRatio: 0.5,
          ellipseDirection: "cw",
        },
        { frame: 60, value: 30, interpolation: "linear" },
      ],
    };

    const { container } = renderInSvg(
      <GraphCurve
        track={track}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={true}
      />,
    );

    const d = container.querySelector("path")!.getAttribute("d")!;
    const lCount = (d.match(/L/g) || []).length;
    expect(lCount).toBe(20);
  });

  it("ellipse補間でデフォルトのratio/directionが使用される", () => {
    const track: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        { frame: 0, value: 0, interpolation: "ellipse" },
        { frame: 60, value: 30, interpolation: "linear" },
      ],
    };

    const { container } = renderInSvg(
      <GraphCurve
        track={track}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={true}
      />,
    );

    const path = container.querySelector("path");
    expect(path).toBeInTheDocument();
  });

  it("sns補間でサンプリング曲線が描画される", () => {
    const track: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        {
          frame: 0,
          value: 0,
          interpolation: "sns",
          snsOscillations: 2,
          snsDamping: 0.3,
        },
        { frame: 60, value: 30, interpolation: "linear" },
      ],
    };

    const { container } = renderInSvg(
      <GraphCurve
        track={track}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={true}
      />,
    );

    const d = container.querySelector("path")!.getAttribute("d")!;
    const lCount = (d.match(/L/g) || []).length;
    expect(lCount).toBe(20);
  });

  it("sns補間でデフォルトのoscillations/dampingが使用される", () => {
    const track: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        { frame: 0, value: 0, interpolation: "sns" },
        { frame: 60, value: 30, interpolation: "linear" },
      ],
    };

    const { container } = renderInSvg(
      <GraphCurve
        track={track}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={false}
      />,
    );

    const path = container.querySelector("path");
    expect(path).toBeInTheDocument();
  });

  it("bezier補間でcp未指定時にデフォルト制御点が使用される", () => {
    const track: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        { frame: 0, value: 0, interpolation: "bezier" },
        { frame: 60, value: 30, interpolation: "linear" },
      ],
    };

    const { container } = renderInSvg(
      <GraphCurve
        track={track}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={true}
      />,
    );

    const d = container.querySelector("path")!.getAttribute("d")!;
    expect(d).toContain("C");
  });

  it("selected=trueで不透明度が1になる", () => {
    const { container } = renderInSvg(
      <GraphCurve
        track={createLinearTrack()}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={true}
      />,
    );

    const path = container.querySelector("path");
    expect(path!.getAttribute("opacity")).toBe("1");
  });

  it("selected=falseで不透明度が0.5になる", () => {
    const { container } = renderInSvg(
      <GraphCurve
        track={createLinearTrack()}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={false}
      />,
    );

    const path = container.querySelector("path");
    expect(path!.getAttribute("opacity")).toBe("0.5");
  });

  it("混合補間タイプのトラックが正しくレンダリングされる", () => {
    const track: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        { frame: 0, value: 0, interpolation: "linear" },
        {
          frame: 15,
          value: 8,
          interpolation: "bezier",
          cp1x: 0.3,
          cp1y: 0.1,
          cp2x: 0.7,
          cp2y: 0.9,
        },
        { frame: 30, value: 15, interpolation: "step" },
        {
          frame: 45,
          value: 23,
          interpolation: "ellipse",
          ellipseRatio: 0.4,
          ellipseDirection: "ccw",
        },
        { frame: 60, value: 30, interpolation: "linear" },
      ],
    };

    const { container } = renderInSvg(
      <GraphCurve
        track={track}
        frameToX={frameToX}
        valueToY={valueToY}
        selected={true}
      />,
    );

    const d = container.querySelector("path")!.getAttribute("d")!;
    // linear(L) + bezier(C) + step(2L) + ellipse(20L)
    expect(d).toContain("L");
    expect(d).toContain("C ");
  });
});
