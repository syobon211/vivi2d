import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MenuDropdown, MenuDropdownItem } from "../MenuDropdown";

describe("MenuDropdown", () => {
  it("ラベルが表示される", () => {
    render(
      <MenuDropdown label="ファイル">
        <div>内容</div>
      </MenuDropdown>,
    );
    expect(screen.getByText("ファイル ▾")).toBeInTheDocument();
  });

  it("クリックでドロップダウンが開く", async () => {
    const user = userEvent.setup();
    render(
      <MenuDropdown label="ファイル">
        <div>メニュー内容</div>
      </MenuDropdown>,
    );

    expect(screen.queryByText("メニュー内容")).not.toBeInTheDocument();

    await user.click(screen.getByText("ファイル ▾"));
    expect(screen.getByText("メニュー内容")).toBeInTheDocument();
  });

  it("再クリックで閉じる", async () => {
    const user = userEvent.setup();
    render(
      <MenuDropdown label="ファイル">
        <div>メニュー内容</div>
      </MenuDropdown>,
    );

    await user.click(screen.getByText("ファイル ▾"));
    expect(screen.getByText("メニュー内容")).toBeInTheDocument();

    await user.click(screen.getByText("ファイル ▾"));
    expect(screen.queryByText("メニュー内容")).not.toBeInTheDocument();
  });

  it("項目クリック後に閉じる", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <MenuDropdown label="ファイル">
        <MenuDropdownItem onClick={onClick}>保存</MenuDropdownItem>
      </MenuDropdown>,
    );

    await user.click(screen.getByText("ファイル ▾"));
    expect(screen.getByText("保存")).toBeInTheDocument();

    await user.click(screen.getByText("保存"));

    expect(screen.queryByText("保存")).not.toBeInTheDocument();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("外側クリックで閉じる", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MenuDropdown label="ファイル">
          <div>メニュー内容</div>
        </MenuDropdown>
        <div data-testid="outside">外側</div>
      </div>,
    );

    await user.click(screen.getByText("ファイル ▾"));
    expect(screen.getByText("メニュー内容")).toBeInTheDocument();

    await user.click(screen.getByTestId("outside"));
    expect(screen.queryByText("メニュー内容")).not.toBeInTheDocument();
  });

  it("className が適用される", () => {
    const { container } = render(
      <MenuDropdown label="テスト" className="custom-class">
        <div>内容</div>
      </MenuDropdown>,
    );
    expect(container.querySelector(".menu-dropdown.custom-class")).toBeInTheDocument();
  });

  it("className が省略された場合でもエラーにならない", () => {
    const { container } = render(
      <MenuDropdown label="テスト">
        <div>内容</div>
      </MenuDropdown>,
    );
    expect(container.querySelector(".menu-dropdown")).toBeInTheDocument();
  });


  it("トリガーに aria-haspopup と aria-expanded が付く", async () => {
    const user = userEvent.setup();
    render(
      <MenuDropdown label="ファイル">
        <MenuDropdownItem onClick={() => {}}>保存</MenuDropdownItem>
      </MenuDropdown>,
    );
    const trigger = screen.getByText("ファイル ▾");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("開いたパネルが role=menu と aria-label を持つ", async () => {
    const user = userEvent.setup();
    render(
      <MenuDropdown label="ファイル">
        <MenuDropdownItem onClick={() => {}}>保存</MenuDropdownItem>
      </MenuDropdown>,
    );
    await user.click(screen.getByText("ファイル ▾"));
    const menu = screen.getByRole("menu");
    expect(menu).toHaveAttribute("aria-label", "ファイル");
  });

  it("開いた直後に最初の有効な項目にフォーカスが当たる", async () => {
    const user = userEvent.setup();
    render(
      <MenuDropdown label="ファイル">
        <MenuDropdownItem onClick={() => {}}>保存</MenuDropdownItem>
        <MenuDropdownItem onClick={() => {}}>開く</MenuDropdownItem>
      </MenuDropdown>,
    );
    await user.click(screen.getByText("ファイル ▾"));
    expect(screen.getByText("保存")).toHaveFocus();
  });

  it("ArrowDown で次の項目にフォーカスが移る", async () => {
    const user = userEvent.setup();
    render(
      <MenuDropdown label="ファイル">
        <MenuDropdownItem onClick={() => {}}>保存</MenuDropdownItem>
        <MenuDropdownItem onClick={() => {}}>開く</MenuDropdownItem>
        <MenuDropdownItem onClick={() => {}}>閉じる</MenuDropdownItem>
      </MenuDropdown>,
    );
    await user.click(screen.getByText("ファイル ▾"));
    expect(screen.getByText("保存")).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("開く")).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("閉じる")).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("保存")).toHaveFocus();
  });

  it("ArrowUp で前の項目にフォーカスが移る（先頭から末尾へ巡回）", async () => {
    const user = userEvent.setup();
    render(
      <MenuDropdown label="ファイル">
        <MenuDropdownItem onClick={() => {}}>保存</MenuDropdownItem>
        <MenuDropdownItem onClick={() => {}}>開く</MenuDropdownItem>
      </MenuDropdown>,
    );
    await user.click(screen.getByText("ファイル ▾"));

    await user.keyboard("{ArrowUp}");
    expect(screen.getByText("開く")).toHaveFocus();
  });

  it("Home/End でジャンプできる", async () => {
    const user = userEvent.setup();
    render(
      <MenuDropdown label="ファイル">
        <MenuDropdownItem onClick={() => {}}>A</MenuDropdownItem>
        <MenuDropdownItem onClick={() => {}}>B</MenuDropdownItem>
        <MenuDropdownItem onClick={() => {}}>C</MenuDropdownItem>
      </MenuDropdown>,
    );
    await user.click(screen.getByText("ファイル ▾"));

    await user.keyboard("{End}");
    expect(screen.getByText("C")).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByText("A")).toHaveFocus();
  });

  it("ArrowDown は disabled 項目をスキップする", async () => {
    const user = userEvent.setup();
    render(
      <MenuDropdown label="ファイル">
        <MenuDropdownItem onClick={() => {}}>有効A</MenuDropdownItem>
        <MenuDropdownItem onClick={() => {}} disabled>
          無効
        </MenuDropdownItem>
        <MenuDropdownItem onClick={() => {}}>有効B</MenuDropdownItem>
      </MenuDropdown>,
    );
    await user.click(screen.getByText("ファイル ▾"));
    expect(screen.getByText("有効A")).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("有効B")).toHaveFocus();
  });

  it("Escape で閉じてトリガーへフォーカスが戻る", async () => {
    const user = userEvent.setup();
    render(
      <MenuDropdown label="ファイル">
        <MenuDropdownItem onClick={() => {}}>保存</MenuDropdownItem>
      </MenuDropdown>,
    );
    const trigger = screen.getByText("ファイル ▾");
    await user.click(trigger);

    await user.keyboard("{Escape}");
    expect(screen.queryByText("保存")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("MenuDropdownItem", () => {
  it("ボタンとして表示される", () => {
    render(<MenuDropdownItem onClick={() => {}}>項目1</MenuDropdownItem>);
    const btn = screen.getByText("項目1");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveClass("menu-dropdown-item");
  });

  it("role=menuitem を持つ", () => {
    render(<MenuDropdownItem onClick={() => {}}>項目1</MenuDropdownItem>);
    expect(screen.getByRole("menuitem", { name: "項目1" })).toBeInTheDocument();
  });

  it("クリック時にonClickが呼ばれる", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<MenuDropdownItem onClick={onClick}>項目1</MenuDropdownItem>);

    await user.click(screen.getByText("項目1"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disabled状態の項目はクリックできない", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <MenuDropdownItem onClick={onClick} disabled>
        無効項目
      </MenuDropdownItem>,
    );

    const btn = screen.getByText("無効項目");
    expect(btn).toBeDisabled();

    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("active状態の項目にactiveクラスが付く", () => {
    render(
      <MenuDropdownItem onClick={() => {}} active>
        アクティブ項目
      </MenuDropdownItem>,
    );
    expect(screen.getByText("アクティブ項目")).toHaveClass("active");
  });

  it("active=false の場合にactiveクラスが付かない", () => {
    render(
      <MenuDropdownItem onClick={() => {}} active={false}>
        非アクティブ項目
      </MenuDropdownItem>,
    );
    expect(screen.getByText("非アクティブ項目")).not.toHaveClass("active");
  });

  it("title属性が設定される", () => {
    render(
      <MenuDropdownItem onClick={() => {}} title="ツールチップ">
        項目
      </MenuDropdownItem>,
    );
    expect(screen.getByText("項目")).toHaveAttribute("title", "ツールチップ");
  });

  it("title属性を省略できる", () => {
    render(<MenuDropdownItem onClick={() => {}}>項目</MenuDropdownItem>);
    expect(screen.getByText("項目")).not.toHaveAttribute("title");
  });
});
