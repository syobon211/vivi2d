import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useVMCStore } from "@/stores/vmcStore";
import { createEmptyProject } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";
import { VMCPanel } from "../VMCPanel";

function setup() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [
        { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
        { id: "p2", name: "角度Y", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
    },
    projectVersion: 1,
  });
  useVMCStore.getState().reset();
}

function setupWithMappings() {
  setup();
  useVMCStore.getState().addMapping({
    vmcName: "FaceChannel.A",
    parameterId: "p1",
    scale: 1.5,
    offset: 0,
  });
  useVMCStore.getState().addMapping({
    vmcName: "FaceChannel.O",
    parameterId: "p2",
    scale: 2,
    offset: 0.1,
  });
}

describe("VMCPanel", () => {
  afterEach(() => {
    resetEditorStore();
    useVMCStore.getState().reset();
  });

  it("プロジェクトなしで何も表示されない", () => {
    useEditorStore.setState({ project: null });
    const { container } = render(<VMCPanel />);
    expect(container.querySelector(".vmc-panel")).not.toBeInTheDocument();
  });

  it("パネルヘッダーが表示される", () => {
    setup();
    render(<VMCPanel />);
    expect(screen.getByText("VMCプロトコル")).toBeInTheDocument();
  });

  it("接続ボタンが表示される", () => {
    setup();
    render(<VMCPanel />);
    expect(screen.getByText("接続")).toBeInTheDocument();
  });

  it("接続中は切断ボタンが表示される", () => {
    setup();
    useVMCStore.getState().setConnected(true);
    render(<VMCPanel />);
    expect(screen.getByText("切断")).toBeInTheDocument();
  });

  it("ポート番号入力が表示される", () => {
    setup();
    const { container } = render(<VMCPanel />);
    const input = container.querySelector('.vmc-port-row input[type="number"]');
    expect(input).toBeInTheDocument();
    expect(input?.getAttribute("value")).toBe("39539");
  });

  it("マッピング追加ができる", () => {
    setup();
    render(<VMCPanel />);
    const vmcInput = screen.getByPlaceholderText("VMC名");
    fireEvent.change(vmcInput, { target: { value: "FaceChannel.A" } });
    const select = screen
      .getAllByRole("combobox")
      .find((s) => s.querySelector("option[value='p1']"));
    if (select) {
      fireEvent.change(select, { target: { value: "p1" } });
    }
    const addBtn = screen.getByText("+");
    fireEvent.click(addBtn);
    expect(useVMCStore.getState().mappings.length).toBe(1);
  });

  it("ステータスインジケーターが表示される", () => {
    setup();
    const { container } = render(<VMCPanel />);
    expect(container.querySelector(".vmc-status")).toBeInTheDocument();
  });


  it("ポート番号を変更できる", () => {
    setup();
    const { container } = render(<VMCPanel />);

    const portInput = container.querySelector(
      '.vmc-port-row input[type="number"]',
    ) as HTMLInputElement;
    fireEvent.change(portInput, { target: { value: "12345" } });

    expect(useVMCStore.getState().receivePort).toBe(12345);
  });

  it("接続中はポート入力がdisabled", () => {
    setup();
    useVMCStore.getState().setConnected(true);
    const { container } = render(<VMCPanel />);

    const portInput = container.querySelector(
      '.vmc-port-row input[type="number"]',
    ) as HTMLInputElement;
    expect(portInput).toBeDisabled();
  });

  it("未接続時はポート入力がenabled", () => {
    setup();
    const { container } = render(<VMCPanel />);

    const portInput = container.querySelector(
      '.vmc-port-row input[type="number"]',
    ) as HTMLInputElement;
    expect(portInput).not.toBeDisabled();
  });

  it("マッピングスケール値を変更できる", () => {
    setupWithMappings();
    const { container } = render(<VMCPanel />);

    const scaleInputs = container.querySelectorAll(
      '.vmc-mapping-item input[type="number"]',
    );
    expect(scaleInputs.length).toBe(2);

    fireEvent.change(scaleInputs[0]!, { target: { value: "3" } });

    const mappings = useVMCStore.getState().mappings;
    expect(mappings[0]!.scale).toBe(3);
    expect(mappings[1]!.scale).toBe(2);
  });

  it("マッピング削除ができる", async () => {
    setupWithMappings();
    const user = userEvent.setup();
    render(<VMCPanel />);

    expect(useVMCStore.getState().mappings.length).toBe(2);

    const deleteButtons = screen.getAllByTitle("マッピング削除");
    expect(deleteButtons.length).toBe(2);

    await user.click(deleteButtons[0]!);

    expect(useVMCStore.getState().mappings.length).toBe(1);
    expect(useVMCStore.getState().mappings[0]!.vmcName).toBe("FaceChannel.O");
  });

  it("ステータスインジケーターに未接続時クラスが付かない", () => {
    setup();
    const { container } = render(<VMCPanel />);

    const indicator = container.querySelector(".vmc-status")!;
    expect(indicator).not.toHaveClass("vmc-connected");
  });

  it("ステータスインジケーターに接続中クラスが付く", () => {
    setup();
    useVMCStore.getState().setConnected(true);
    const { container } = render(<VMCPanel />);

    const indicator = container.querySelector(".vmc-status")!;
    expect(indicator).toHaveClass("vmc-connected");
  });

  it("接続ボタンクリックで接続状態が切り替わる", async () => {
    setup();
    const user = userEvent.setup();
    render(<VMCPanel />);

    await user.click(screen.getByText("接続"));
    expect(useVMCStore.getState().connected).toBe(true);
  });

  it("切断ボタンクリックで切断される", async () => {
    setup();
    useVMCStore.getState().setConnected(true);
    const user = userEvent.setup();
    render(<VMCPanel />);

    await user.click(screen.getByText("切断"));
    expect(useVMCStore.getState().connected).toBe(false);
  });

  it("接続中のボタンにdisconnectクラスが付く", () => {
    setup();
    useVMCStore.getState().setConnected(true);
    render(<VMCPanel />);

    const disconnectBtn = screen.getByText("切断");
    expect(disconnectBtn).toHaveClass("vmc-btn-disconnect");
  });

  it("マッピング追加でVMC名が空だとdisabled", () => {
    setup();
    render(<VMCPanel />);

    const select = screen
      .getAllByRole("combobox")
      .find((s) => s.querySelector("option[value='p1']"));
    if (select) {
      fireEvent.change(select, { target: { value: "p1" } });
    }

    const addBtn = screen.getByText("+");
    expect(addBtn).toBeDisabled();
  });

  it("マッピング追加でパラメータ未選択だとdisabled", () => {
    setup();
    render(<VMCPanel />);

    const vmcInput = screen.getByPlaceholderText("VMC名");
    fireEvent.change(vmcInput, { target: { value: "FaceChannel.A" } });

    const addBtn = screen.getByText("+");
    expect(addBtn).toBeDisabled();
  });

  it("最終受信時刻が設定されている場合に表示される", () => {
    setup();
    useVMCStore.setState({ lastReceivedAt: 1_700_000_000_000 });
    render(<VMCPanel />);

    expect(screen.getByText(/最終受信:/)).toBeInTheDocument();
  });

  it("最終受信時刻がnullの場合は受信ステータスが表示されない", () => {
    setup();
    render(<VMCPanel />);

    expect(screen.queryByText(/最終受信:/)).not.toBeInTheDocument();
  });

  it("マッピングのVMC名が表示される", () => {
    setupWithMappings();
    render(<VMCPanel />);

    expect(screen.getByText("FaceChannel.A")).toBeInTheDocument();
    expect(screen.getByText("FaceChannel.O")).toBeInTheDocument();
  });

  it("マッピングのパラメータ名が表示される", () => {
    setupWithMappings();
    const { container } = render(<VMCPanel />);

    const paramSpans = container.querySelectorAll(".vmc-mapping-param");
    const paramNames = Array.from(paramSpans).map((el) => el.textContent);
    expect(paramNames).toContain("角度X");
    expect(paramNames).toContain("角度Y");
  });

  it("マッピングの矢印が表示される", () => {
    setupWithMappings();
    render(<VMCPanel />);

    const arrows = screen.getAllByText("→");
    expect(arrows.length).toBe(2);
  });

  it("マッピングセクションタイトルが表示される", () => {
    setup();
    render(<VMCPanel />);
    expect(screen.getByText("マッピング")).toBeInTheDocument();
  });
});
