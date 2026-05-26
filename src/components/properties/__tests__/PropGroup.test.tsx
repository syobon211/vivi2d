import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PropGroup } from "../PropGroup";

describe("PropGroup", () => {
  it("ラベルと子要素をレンダリングする", () => {
    render(
      <PropGroup label="テストラベル">
        <span>子要素</span>
      </PropGroup>,
    );

    expect(screen.getByText("テストラベル")).toBeInTheDocument();
    expect(screen.getByText("子要素")).toBeInTheDocument();
  });

  it("prop-group クラスが適用される", () => {
    const { container } = render(
      <PropGroup label="L">
        <div>C</div>
      </PropGroup>,
    );

    expect(container.querySelector(".prop-group")).toBeInTheDocument();
    expect(container.querySelector(".prop-label")).toBeInTheDocument();
    expect(container.querySelector(".prop-value")).toBeInTheDocument();
  });

  it("複数の子要素をレンダリングする", () => {
    render(
      <PropGroup label="複数">
        <input type="text" />
        <button type="button">ボタン</button>
      </PropGroup>,
    );

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
