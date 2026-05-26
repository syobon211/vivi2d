import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineRuler } from "../timeline/TimelineRuler";


describe("TimelineRuler", () => {
  it("ルーラー要素をレンダリングする", () => {
    const { container } = render(<TimelineRuler duration={90} fps={30} />);

    expect(container.querySelector(".tl-ruler")).toBeInTheDocument();
  });

  it("fps 間隔でルーラーマークを生成する", () => {
    const { container } = render(<TimelineRuler duration={90} fps={30} />);

    const marks = container.querySelectorAll(".tl-ruler-mark");
    expect(marks).toHaveLength(3);
  });

  it("ラベルに秒数が表示される", () => {
    const { container } = render(<TimelineRuler duration={90} fps={30} />);

    const labels = container.querySelectorAll(".tl-ruler-label");
    expect(labels[0]!.textContent).toBe("0s");
    expect(labels[1]!.textContent).toBe("1s");
    expect(labels[2]!.textContent).toBe("2s");
  });

  it("fps=24 で正しいマーク数が生成される", () => {
    const { container } = render(<TimelineRuler duration={120} fps={24} />);

    const marks = container.querySelectorAll(".tl-ruler-mark");
    expect(marks).toHaveLength(5);
  });

  it("duration=1 でマークが1つ生成される", () => {
    const { container } = render(<TimelineRuler duration={1} fps={30} />);

    const marks = container.querySelectorAll(".tl-ruler-mark");
    expect(marks).toHaveLength(1);
  });

  it("マークの位置がパーセントで設定される", () => {
    const { container } = render(<TimelineRuler duration={90} fps={30} />);

    const marks = container.querySelectorAll(".tl-ruler-mark") as NodeListOf<HTMLElement>;
    expect(marks[0]!.style.left).toBe("0%");
    const pct30 = ((30 / 89) * 100).toString();
    expect(marks[1]!.style.left).toContain(pct30.slice(0, 4));
  });
});
