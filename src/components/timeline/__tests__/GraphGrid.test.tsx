import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GraphGrid } from "../GraphGrid";


const defaultProps = {
  duration: 60,
  fps: 30,
  valueRange: { min: -1, max: 1 },
  frameToX: vi.fn((frame: number) => 50 + frame * 5),
  valueToY: vi.fn((value: number) => 100 - value * 50),
  getSize: vi.fn(() => ({ w: 400, h: 200 })),
};

describe("GraphGrid", () => {
  it("SVG要素をレンダリングする", () => {
    const { container } = render(
      <svg>
        <GraphGrid {...defaultProps} />
      </svg>,
    );

    const lines = container.querySelectorAll("line");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("時間軸のグリッド線を秒単位で生成する", () => {
    const { container } = render(
      <svg>
        <GraphGrid {...defaultProps} />
      </svg>,
    );

    const texts = container.querySelectorAll("text");
    const labels = Array.from(texts).map((t) => t.textContent);
    expect(labels).toContain("0s");
    expect(labels).toContain("1s");
  });

  it("値軸のグリッド線を生成する", () => {
    const { container } = render(
      <svg>
        <GraphGrid {...defaultProps} />
      </svg>,
    );

    const texts = container.querySelectorAll("text");
    const labels = Array.from(texts)
      .map((t) => t.textContent)
      .filter((l) => l && !l.endsWith("s"));
    expect(labels.length).toBeGreaterThan(0);
  });

  it("frameToX と valueToY が呼ばれる", () => {
    render(
      <svg>
        <GraphGrid {...defaultProps} />
      </svg>,
    );

    expect(defaultProps.frameToX).toHaveBeenCalled();
    expect(defaultProps.valueToY).toHaveBeenCalled();
    expect(defaultProps.getSize).toHaveBeenCalled();
  });

  it("大きな値範囲でstepが調整される", () => {
    const props = {
      ...defaultProps,
      valueRange: { min: -30, max: 30 },
    };

    const { container } = render(
      <svg>
        <GraphGrid {...props} />
      </svg>,
    );

    const texts = container.querySelectorAll("text");
    expect(texts.length).toBeGreaterThan(0);
  });

  it("duration=0 のとき空のレンダリング", () => {
    const props = { ...defaultProps, duration: 0 };

    const { container } = render(
      <svg>
        <GraphGrid {...props} />
      </svg>,
    );

    const texts = container.querySelectorAll("text");
    const timeLabels = Array.from(texts).filter((t) => t.textContent?.endsWith("s"));
    expect(timeLabels.length).toBe(0);
  });

  it("中間範囲（2〜10）でstep=1になる", () => {
    const props = {
      ...defaultProps,
      valueRange: { min: 0, max: 5 },
    };

    const { container } = render(
      <svg>
        <GraphGrid {...props} />
      </svg>,
    );

    const texts = container.querySelectorAll("text");
    const valueLabels = Array.from(texts)
      .map((t) => t.textContent)
      .filter((l) => l && !l.endsWith("s"));
    expect(valueLabels).toContain("0");
    expect(valueLabels).toContain("5");
  });
});
