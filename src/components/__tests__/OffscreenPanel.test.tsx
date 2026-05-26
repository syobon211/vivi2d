import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";
import { OffscreenPanel } from "../OffscreenPanel";

function setupWithTarget() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ id: "m1", name: "レイヤー1" }),
        createViviMesh({ id: "m2", name: "レイヤー2" }),
      ],
      offscreenTargets: [
        {
          id: "ot-1",
          width: 512,
          height: 512,
          sourceLayerIds: ["m1"],
        },
      ],
    },
    projectVersion: 1,
  });
}

function setupWithMultipleTargets() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ id: "m1", name: "レイヤー1" }),
        createViviMesh({ id: "m2", name: "レイヤー2" }),
        createViviMesh({ id: "m3", name: "レイヤー3" }),
      ],
      offscreenTargets: [
        {
          id: "ot-1",
          width: 512,
          height: 512,
          sourceLayerIds: ["m1"],
        },
        {
          id: "ot-2",
          width: 256,
          height: 256,
          sourceLayerIds: ["m2", "m3"],
        },
      ],
    },
    projectVersion: 1,
  });
}

function setupEmpty() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "m1", name: "レイヤー1" })],
    },
    projectVersion: 1,
  });
}

describe("OffscreenPanel", () => {
  afterEach(() => resetEditorStore());

  it("プロジェクトなしで何も表示されない", () => {
    useEditorStore.setState({ project: null });
    const { container } = render(<OffscreenPanel />);
    expect(container.querySelector(".offscreen-panel")).not.toBeInTheDocument();
  });

  it("パネルヘッダーが表示される", () => {
    setupEmpty();
    render(<OffscreenPanel />);
    expect(screen.getByText("オフスクリーン描画")).toBeInTheDocument();
  });

  it("ターゲットのサイズが表示される", () => {
    setupWithTarget();
    render(<OffscreenPanel />);
    expect(screen.getByText("512×512")).toBeInTheDocument();
  });

  it("ソースレイヤー名が表示される", () => {
    setupWithTarget();
    render(<OffscreenPanel />);
    expect(screen.getByText("レイヤー1")).toBeInTheDocument();
  });

  it("追加ボタンが表示される", () => {
    setupEmpty();
    render(<OffscreenPanel />);
    expect(screen.getByText("+ オフスクリーンターゲット追加")).toBeInTheDocument();
  });

  it("削除ボタンが表示される", () => {
    setupWithTarget();
    render(<OffscreenPanel />);
    expect(screen.getByTitle("ターゲット削除")).toBeInTheDocument();
  });


  it("バッファ幅を変更するとストアに反映される", () => {
    setupWithTarget();
    const { container } = render(<OffscreenPanel />);

    const widthInputs = container.querySelectorAll('input[type="number"]');
    const widthInput = widthInputs[0] as HTMLInputElement;
    expect(widthInput.value).toBe("512");

    fireEvent.change(widthInput, { target: { value: "1024" } });

    const project = useEditorStore.getState().project;
    const target = project?.offscreenTargets?.[0];
    expect(target?.width).toBe(1024);
  });

  it("バッファ高さを変更するとストアに反映される", () => {
    setupWithTarget();
    const { container } = render(<OffscreenPanel />);

    const heightInputs = container.querySelectorAll('input[type="number"]');
    const heightInput = heightInputs[1] as HTMLInputElement;
    expect(heightInput.value).toBe("512");

    fireEvent.change(heightInput, { target: { value: "768" } });

    const project = useEditorStore.getState().project;
    const target = project?.offscreenTargets?.[0];
    expect(target?.height).toBe(768);
  });

  it("ソースレイヤーを追加できる", async () => {
    setupWithTarget();
    const user = userEvent.setup();
    render(<OffscreenPanel />);

    const selects = screen.getAllByRole("combobox");
    const select = selects[0]!;

    await user.selectOptions(select, "m2");

    const project = useEditorStore.getState().project;
    const target = project?.offscreenTargets?.[0];
    expect(target?.sourceLayerIds).toContain("m2");
  });

  it("ソースレイヤーを削除できる", async () => {
    setupWithTarget();
    const user = userEvent.setup();
    render(<OffscreenPanel />);

    await user.click(screen.getByTitle("ソース削除"));

    const project = useEditorStore.getState().project;
    const target = project?.offscreenTargets?.[0];
    expect(target?.sourceLayerIds).not.toContain("m1");
    expect(target?.sourceLayerIds.length).toBe(0);
  });

  it("ターゲット追加ボタンクリックでプロジェクトサイズが使われる", async () => {
    setupEmpty();
    const user = userEvent.setup();
    render(<OffscreenPanel />);

    await user.click(screen.getByText("+ オフスクリーンターゲット追加"));

    const project = useEditorStore.getState().project;
    const targets = project?.offscreenTargets ?? [];
    expect(targets.length).toBe(1);
    expect(targets[0]?.width).toBe(800);
    expect(targets[0]?.height).toBe(600);
  });

  it("複数ターゲットが表示される", () => {
    setupWithMultipleTargets();
    render(<OffscreenPanel />);

    expect(screen.getByText("512×512")).toBeInTheDocument();
    expect(screen.getByText("256×256")).toBeInTheDocument();
  });

  it("複数ターゲットの削除ボタンが表示される", () => {
    setupWithMultipleTargets();
    render(<OffscreenPanel />);

    const deleteButtons = screen.getAllByTitle("ターゲット削除");
    expect(deleteButtons.length).toBe(2);
  });

  it("ターゲット削除でストアから消える", async () => {
    setupWithTarget();
    const user = userEvent.setup();
    render(<OffscreenPanel />);

    await user.click(screen.getByTitle("ターゲット削除"));

    const project = useEditorStore.getState().project;
    expect(project?.offscreenTargets?.length ?? 0).toBe(0);
  });

  it("ソースレイヤー追加ドロップダウンに既存ソースが表示されない", () => {
    setupWithTarget();
    render(<OffscreenPanel />);

    const selects = screen.getAllByRole("combobox");
    const options = selects[0]!.querySelectorAll("option");
    const optionValues = Array.from(options).map((o) => o.getAttribute("value"));

    expect(optionValues).not.toContain("m1");
    expect(optionValues).toContain("m2");
  });

  it("ソースレイヤーのラベルが表示される", () => {
    setupWithTarget();
    render(<OffscreenPanel />);
    expect(screen.getByText("ソースレイヤー:")).toBeInTheDocument();
  });

  it("複数ソースレイヤーの名前が全て表示される", () => {
    setupWithMultipleTargets();
    const { container } = render(<OffscreenPanel />);

    const sourceItems = container.querySelectorAll(".offscreen-source-item span");
    const sourceNames = Array.from(sourceItems).map((el) => el.textContent);
    expect(sourceNames).toContain("レイヤー1");
    expect(sourceNames).toContain("レイヤー2");
    expect(sourceNames).toContain("レイヤー3");
  });
});
