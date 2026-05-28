import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { resetEditorStore } from "@/test/store-reset";
import { TemplateDropdown } from "../TemplateDropdown";

describe("TemplateDropdown", () => {
  beforeEach(() => {
    resetEditorStore();
    clearTextures();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
  });

  afterEach(() => {
    resetEditorStore();
    clearTextures();
  });

  it("physicsカテゴリのテンプレートボタンが表示される", () => {
    render(<TemplateDropdown category="physics" />);
    expect(screen.getByText("テンプレート")).toBeInTheDocument();
  });

  it("クリックでテンプレートメニューが開く", async () => {
    const user = userEvent.setup();
    render(<TemplateDropdown category="physics" />);

    await user.click(screen.getByText("テンプレート"));

    expect(screen.getByText("髪揺れ（3段チェーン）")).toBeInTheDocument();
  });

  it("再クリックでメニューが閉じる", async () => {
    const user = userEvent.setup();
    render(<TemplateDropdown category="physics" />);

    await user.click(screen.getByText("テンプレート"));
    expect(screen.getByText("髪揺れ（3段チェーン）")).toBeInTheDocument();

    await user.click(screen.getByText("テンプレート"));
    expect(screen.queryByText("髪揺れ（3段チェーン）")).not.toBeInTheDocument();
  });

  it("テンプレート項目クリックで適用され、メニューが閉じる", async () => {
    const user = userEvent.setup();
    render(<TemplateDropdown category="physics" />);

    await user.click(screen.getByText("テンプレート"));
    await user.click(screen.getByText("髪揺れ（3段チェーン）"));

    expect(screen.queryByText("髪揺れ（3段チェーン）")).not.toBeInTheDocument();

    const project = useEditorStore.getState().project;
    expect(project?.physicsGroups.length).toBeGreaterThanOrEqual(1);
  });

  it("存在しないカテゴリの場合はnullを返す", () => {
    const { container } = render(<TemplateDropdown category={"nonexistent" as any} />);
    expect(container.innerHTML).toBe("");
  });
});
