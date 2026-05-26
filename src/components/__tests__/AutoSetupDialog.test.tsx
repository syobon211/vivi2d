import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeneratedBone } from "@/lib/ai-bone-generator";
import * as autoSetup from "@/lib/auto-setup";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import {
  resetAutoSetupDraftStore,
  resetEditorStore,
  resetHistoryStore,
} from "@/test/store-reset";
import { AutoSetupDialog } from "../AutoSetupDialog";

vi.mock("@/lib/auto-setup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auto-setup")>();
  return {
    ...actual,
    previewAutoSetup: vi.fn(actual.previewAutoSetup),
    generateAutoMeshes: vi.fn(() => Promise.resolve([])),
    generateAutoWeights: vi.fn(() => Promise.resolve([])),
  };
});

async function clickDetectAndWait() {
  const restartBtn =
    screen.queryByText("Start over") ?? screen.queryByText("最初からやり直す");
  if (restartBtn) {
    fireEvent.click(restartBtn);
    await waitFor(() => {
      expect(screen.queryByText("Start over")).not.toBeInTheDocument();
    });
  }
  const detectBtn = screen.getByText("検出開始");
  fireEvent.click(detectBtn);
  await waitFor(() => {
    expect(screen.queryByText("処理中…")).not.toBeInTheDocument();
  });
}

async function clickPreviewAndWait() {
  await act(async () => {
    fireEvent.click(screen.getByText("プレビュー"));
  });
  await screen.findByText("生成プレビュー");
}

function setupProject() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ id: "m1", name: "左目" }),
        createViviMesh({ id: "m2", name: "右目" }),
        createViviMesh({ id: "m3", name: "口" }),
        createViviMesh({ id: "m4", name: "前髪" }),
        createViviMesh({ id: "m5", name: "体" }),
      ],
    },
    projectVersion: 1,
  });
}

function mockDetectionResult() {
  const result: autoSetup.AutoSetupResult = {
    detectedParts: [
      {
        layerId: "m1",
        layerName: "左目",
        category: "eyeLeft",
        confidence: 0.9,
        bounds: { x: 0, y: 0, width: 50, height: 50 },
      },
      {
        layerId: "m2",
        layerName: "右目",
        category: "eyeRight",
        confidence: 0.85,
        bounds: { x: 50, y: 0, width: 50, height: 50 },
      },
      {
        layerId: "m4",
        layerName: "前髪",
        category: "hairFront",
        confidence: 0.7,
        bounds: { x: 0, y: 0, width: 100, height: 30 },
      },
    ],
    boneResult: {
      bones: [
        {
          tempId: "bone-1",
          name: "頭ボーン",
          parentTempId: null,
          x: 50,
          y: 50,
          partCategory: "head",
        },
      ],
      parameters: [
        { name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0, group: "頭" },
      ],
    },
    physicsGroups: [
      {
        name: "前髪揺れ",
        partCategory: "hairFront",
        layerIds: ["m4"],
        stiffness: 0.5,
        gravity: 0.3,
        damping: 0.1,
      },
    ],
    meshResults: [],
    weightResults: [],
  };
  vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);
  return result;
}

function mockEmptyDetectionResult() {
  const result: autoSetup.AutoSetupResult = {
    detectedParts: [],
    boneResult: null,
    physicsGroups: [],
    meshResults: [],
    weightResults: [],
  };
  vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);
  return result;
}

describe("AutoSetupDialog", async () => {
  afterEach(() => {
    resetEditorStore();
    resetHistoryStore();
    _resetMergeTimer();
    vi.restoreAllMocks();
    resetAutoSetupDraftStore();
  });

  it("ダイアログが表示される", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);
    expect(screen.getByText("自動セットアップ")).toBeInTheDocument();
  });

  it("検出ステップでオプションが表示される", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);
    expect(screen.getByText("ボーン生成")).toBeInTheDocument();
    expect(screen.getByText("物理設定生成")).toBeInTheDocument();
  });

  it("検出開始ボタンが表示される", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);
    expect(screen.getByText("検出開始")).toBeInTheDocument();
  });

  it("検出を実行するとパーツ一覧が表示される", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    expect(screen.getByText("検出結果", { exact: false })).toBeInTheDocument();
  });

  it("オーバーレイクリックで閉じる", async () => {
    setupProject();
    const onClose = vi.fn();
    render(<AutoSetupDialog onClose={onClose} />);
    fireEvent.click(document.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalled();
  });


  it("ダイアログに role=dialog / aria-modal / aria-labelledby が設定されている", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);
    const dialog = document.querySelector(".auto-setup-dialog")!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();
    expect(labelledBy).toMatch(/\S/);
    const titleEl = document.querySelector(`#${labelledBy}`);
    expect(titleEl?.textContent).toContain("自動セットアップ");
  });

  it("Escape キー押下で onClose が呼ばれる", async () => {
    setupProject();
    const onClose = vi.fn();
    render(<AutoSetupDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("検出処理中の Escape は無視される（意図しないキャンセルを防止）", async () => {
    setupProject();
    const onClose = vi.fn();
    const resolveMeshesRef: { fn: ((v: unknown[]) => void) | null } = { fn: null };
    vi.mocked(autoSetup.generateAutoMeshes).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMeshesRef.fn = resolve as (v: unknown[]) => void;
        }),
    );
    render(<AutoSetupDialog onClose={onClose} />);
    fireEvent.click(screen.getByText("検出開始"));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      resolveMeshesRef.fn?.([]);
    });
  });


  it("プロジェクトがnullの場合にnullを返す", async () => {
    useEditorStore.setState({ project: null });
    render(<AutoSetupDialog onClose={() => {}} />);
    expect(document.querySelector(".auto-setup-dialog")).not.toBeInTheDocument();
  });

  it("ボーン生成チェックボックスを操作できる", async () => {
    setupProject();
    const user = userEvent.setup();
    render(<AutoSetupDialog onClose={() => {}} />);

    const boneCheckbox = screen.getByText("ボーン生成").querySelector("input")!;
    expect(boneCheckbox).toBeChecked();

    await user.click(boneCheckbox);
    expect(boneCheckbox).not.toBeChecked();

    await user.click(boneCheckbox);
    expect(boneCheckbox).toBeChecked();
  });

  it("物理設定生成チェックボックスを操作できる", async () => {
    setupProject();
    const user = userEvent.setup();
    render(<AutoSetupDialog onClose={() => {}} />);

    const physicsCheckbox = screen.getByText("物理設定生成").querySelector("input")!;
    expect(physicsCheckbox).toBeChecked();

    await user.click(physicsCheckbox);
    expect(physicsCheckbox).not.toBeChecked();
  });

  it("確信度スライダーを操作できる", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeInTheDocument();
    expect(slider.value).toBe("0.3");

    fireEvent.change(slider, { target: { value: "0.5" } });
    expect(slider.value).toBe("0.5");
  });

  it("検出結果テーブルにパーツ情報が表示される", async () => {
    setupProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();

    expect(screen.getByText("有効")).toBeInTheDocument();
    expect(screen.getByText("レイヤー名")).toBeInTheDocument();
    expect(screen.getByText("種別")).toBeInTheDocument();
    expect(screen.getByText("確信度")).toBeInTheDocument();

    expect(screen.getAllByText("左目").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("右目").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("前髪").length).toBeGreaterThanOrEqual(2);

    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("検出結果テーブルのパーツ除外チェックボックスを操作できる", async () => {
    setupProject();
    mockDetectionResult();
    const user = userEvent.setup();
    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();

    const tableBody = screen.getByRole("table").querySelector("tbody")!;
    const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(3);

    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();

    await user.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();

    await user.click(checkboxes[0]!);
    expect(checkboxes[0]).toBeChecked();
  });

  it("プレビューステップへの遷移", async () => {
    setupProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();
    expect(screen.getByText("検出結果", { exact: false })).toBeInTheDocument();

    await clickPreviewAndWait();
    expect(screen.getByText("生成プレビュー")).toBeInTheDocument();

    expect(screen.getByText("ボーン (1本)")).toBeInTheDocument();
    expect(screen.getByText("パラメータ (1個)")).toBeInTheDocument();

    expect(screen.getByText("物理グループ (1個)")).toBeInTheDocument();
  });

  it("戻るボタンで検出ステップに遷移する", async () => {
    setupProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();
    expect(screen.getByText("検出結果", { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByText("戻る"));
    expect(screen.getByText("検出開始")).toBeInTheDocument();
  });

  it("プレビューから戻るボタンで結果ステップに戻る", async () => {
    setupProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();
    await clickPreviewAndWait();
    expect(screen.getByText("生成プレビュー")).toBeInTheDocument();

    fireEvent.click(screen.getByText("戻る"));
    expect(screen.getByText("検出結果", { exact: false })).toBeInTheDocument();
  });

  it("適用ボタンクリック後にonCloseが呼ばれる", async () => {
    setupProject();
    mockDetectionResult();
    const onClose = vi.fn();
    render(<AutoSetupDialog onClose={onClose} />);

    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("検出結果が空の場合にメッセージが表示される", async () => {
    setupProject();
    mockEmptyDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();

    expect(
      screen.getByText("パーツが検出されませんでした。レイヤー名を確認してください。"),
    ).toBeInTheDocument();
  });

  it("検出結果が空の場合にプレビューボタンが無効化される", async () => {
    setupProject();
    mockEmptyDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();

    const previewBtn = screen.getByText("プレビュー");
    expect(previewBtn).toBeDisabled();
  });

  it("オーバーレイクリックでonCloseが呼ばれる", async () => {
    setupProject();
    const onClose = vi.fn();
    render(<AutoSetupDialog onClose={onClose} />);

    const overlay = document.querySelector(".modal-overlay")!;
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ダイアログ内クリックではonCloseが呼ばれない", async () => {
    setupProject();
    const onClose = vi.fn();
    render(<AutoSetupDialog onClose={onClose} />);

    const dialog = document.querySelector(".auto-setup-dialog")!;
    fireEvent.click(dialog);

    expect(onClose).not.toHaveBeenCalled();
  });


  it("ダイアログタイトルが「自動セットアップ」であること（「AI」がつかないこと）", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);
    const title = screen.getByText("自動セットアップ");
    expect(title).toBeInTheDocument();
    expect(title.textContent).not.toContain("AI");
  });

  it("ボーン生成チェックボックスの切り替え", async () => {
    setupProject();
    const user = userEvent.setup();
    render(<AutoSetupDialog onClose={() => {}} />);

    const label = screen.getByText("ボーン生成");
    const checkbox = label.querySelector("input")!;

    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("物理設定生成チェックボックスの切り替え", async () => {
    setupProject();
    const user = userEvent.setup();
    render(<AutoSetupDialog onClose={() => {}} />);

    const label = screen.getByText("物理設定生成");
    const checkbox = label.querySelector("input")!;

    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("最低確信度スライダーの操作", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeInTheDocument();

    expect(slider.value).toBe("0.3");
    expect(screen.getByText("30%")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "0.5" } });
    expect(screen.getByText("50%")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "0.9" } });
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("検出結果テーブルのチェックボックスでパーツを除外できる", async () => {
    setupProject();
    mockDetectionResult();
    const user = userEvent.setup();
    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();

    const tableBody = screen.getByRole("table").querySelector("tbody")!;
    const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]');

    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();

    await user.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();

    await user.click(checkboxes[2]!);
    expect(checkboxes[2]).not.toBeChecked();

    expect(checkboxes[1]).toBeChecked();
  });

  it("除外されたパーツが適用時にスキップされる", async () => {
    setupProject();
    const resultWithLayerTempId: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
        {
          layerId: "m4",
          layerName: "前髪",
          category: "hairFront",
          confidence: 0.7,
          bounds: { x: 0, y: 0, width: 100, height: 30 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "m1",
            name: "左目ボーン",
            parentTempId: null,
            x: 25,
            y: 25,
            partCategory: "eyeLeft",
          },
          {
            tempId: "m4",
            name: "前髪ボーン",
            parentTempId: null,
            x: 50,
            y: 15,
            partCategory: "hairFront",
          },
        ],
        parameters: [
          { name: "目X", minValue: -10, maxValue: 10, defaultValue: 0, group: "目" },
        ],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(resultWithLayerTempId);

    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();

    const tableBody = screen.getByRole("table").querySelector("tbody")!;
    const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]!);

    await clickPreviewAndWait();

    const projectBefore = useEditorStore.getState().project!;
    const boneCountBefore = projectBefore.layers.filter((l) => l.kind === "bone").length;

    fireEvent.click(screen.getByText("適用"));

    const projectAfter = useEditorStore.getState().project!;
    const bones = projectAfter.layers.filter((l) => l.kind === "bone");
    expect(bones.length).toBe(boneCountBefore + 1);
    expect(bones.some((b) => b.name === "前髪ボーン")).toBe(true);
    expect(bones.some((b) => b.name === "左目ボーン")).toBe(false);
  });

  it("プレビュー画面でボーン数とパラメータ数が表示される", async () => {
    setupProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();
    await clickPreviewAndWait();

    expect(screen.getByText("ボーン (1本)")).toBeInTheDocument();
    expect(screen.getByText("パラメータ (1個)")).toBeInTheDocument();

    expect(screen.getByText(/頭ボーン/)).toBeInTheDocument();

    expect(screen.getByText(/角度X/)).toBeInTheDocument();
    expect(screen.getByText(/\[-30\.\.30\]/)).toBeInTheDocument();
  });

  it("プレビュー画面で物理グループが表示される", async () => {
    setupProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();
    await clickPreviewAndWait();

    expect(screen.getByText("物理グループ (1個)")).toBeInTheDocument();

    expect(screen.getByText(/前髪揺れ/)).toBeInTheDocument();
    expect(screen.getByText(/剛性0\.50/)).toBeInTheDocument();
    expect(screen.getByText(/重力0\.30/)).toBeInTheDocument();
    expect(screen.getByText(/減衰0\.10/)).toBeInTheDocument();
  });


  it("適用時に既存パラメータと同名のパラメータは追加されない", async () => {
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [createViviMesh({ id: "m1", name: "左目" })],
        parameters: [
          {
            id: "existing-p",
            name: "角度X",
            minValue: -30,
            maxValue: 30,
            defaultValue: 0,
          },
        ],
      },
      projectVersion: 1,
    });

    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "bone-dup",
            name: "テストボーン",
            parentTempId: null,
            x: 50,
            y: 50,
            partCategory: "head",
          },
        ],
        parameters: [
          { name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0, group: "頭" },
        ],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;
    const angleParams = project.parameters.filter((p) => p.name === "角度X");
    expect(angleParams).toHaveLength(1);
  });

  it("boneResult が null の場合でも適用が正常に完了する", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: null,
      physicsGroups: [
        {
          name: "前髪揺れ",
          partCategory: "hairFront",
          layerIds: ["m4"],
          stiffness: 0.5,
          gravity: 0.3,
          damping: 0.1,
        },
      ],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    const onClose = vi.fn();
    render(<AutoSetupDialog onClose={onClose} />);

    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("physicsGroups が空の場合でも適用が正常に完了する", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "bone-test",
            name: "テストボーン",
            parentTempId: null,
            x: 50,
            y: 50,
            partCategory: "head",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    const onClose = vi.fn();
    render(<AutoSetupDialog onClose={onClose} />);

    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });


  it("メッシュ結果があると適用後にメッシュデータが更新される", async () => {
    setupProject();
    const meshData = {
      vertices: [0, 0, 100, 0, 50, 100],
      uvs: [0, 0, 1, 0, 0.5, 1],
      indices: [0, 1, 2],
      divisionsX: 0,
      divisionsY: 0,
    };
    const meshResults: autoSetup.MeshGenerationResult[] = [
      { layerId: "m1", layerName: "左目", mesh: meshData },
    ];
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "bone-1",
            name: "テスト",
            parentTempId: null,
            x: 25,
            y: 25,
            partCategory: "head",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);
    vi.mocked(autoSetup.generateAutoMeshes).mockResolvedValue(meshResults);
    vi.mocked(autoSetup.generateAutoWeights).mockResolvedValue([]);

    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;
    const layer = project.layers.find((l) => l.id === "m1");
    expect(layer?.kind).toBe("viviMesh");
    if (layer?.kind === "viviMesh") {
      expect(layer.mesh.vertices).toEqual([0, 0, 100, 0, 50, 100]);
      expect(layer.mesh.indices).toEqual([0, 1, 2]);
    }
  });

  it("ウェイト結果がありボーンが追加されるとスキンデータが設定される", async () => {
    setupProject();
    const weightResults: autoSetup.WeightGenerationResult[] = [
      {
        layerId: "m1",
        weights: [
          [
            { boneId: "bone-1", weight: 0.7 },
            { boneId: "bone-2", weight: 0.3 },
          ],
          [
            { boneId: "bone-1", weight: 0.3 },
            { boneId: "bone-2", weight: 0.7 },
          ],
        ],
        boneIds: ["bone-1", "bone-2"],
      },
    ];
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "bone-1",
            name: "テスト1",
            parentTempId: null,
            x: 10,
            y: 10,
            partCategory: "head",
          },
          {
            tempId: "bone-2",
            name: "テスト2",
            parentTempId: null,
            x: 90,
            y: 90,
            partCategory: "body",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    const dummyMesh: autoSetup.MeshGenerationResult[] = [
      {
        layerId: "m1",
        layerName: "左目",
        mesh: {
          vertices: [0, 0, 10, 0, 5, 10],
          uvs: [0, 0, 1, 0, 0.5, 1],
          indices: [0, 1, 2],
          divisionsX: 0,
          divisionsY: 0,
        },
      },
    ];
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);
    vi.mocked(autoSetup.generateAutoMeshes).mockResolvedValue(dummyMesh);
    vi.mocked(autoSetup.generateAutoWeights).mockResolvedValue(weightResults);

    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();
    await clickPreviewAndWait();
    await act(async () => {
      fireEvent.click(screen.getByText("適用"));
    });

    const project = useEditorStore.getState().project!;
    expect(Object.keys(project.skins)).toHaveLength(0);
  });

  it("メッシュ/ウェイトオプションがUIに表示される", async () => {
    setupProject();
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(mockDetectionResult());

    render(<AutoSetupDialog onClose={() => {}} />);

    expect(screen.getByText("メッシュ自動生成")).toBeInTheDocument();
    expect(screen.getByText("ウェイト自動計算")).toBeInTheDocument();
  });

  it("プレビューにメッシュセクションが表示される", async () => {
    setupProject();
    const meshResults: autoSetup.MeshGenerationResult[] = [
      {
        layerId: "m1",
        layerName: "左目",
        mesh: {
          vertices: [0, 0, 10, 0, 5, 10, 10, 10],
          uvs: [0, 0, 1, 0, 0.5, 1, 1, 1],
          indices: [0, 1, 2, 1, 3, 2],
          divisionsX: 0,
          divisionsY: 0,
        },
      },
    ];
    const weightResults: autoSetup.WeightGenerationResult[] = [
      {
        layerId: "m1",
        weights: [[{ boneId: "bone-1", weight: 1 }]],
        boneIds: ["bone-1"],
      },
    ];
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(mockDetectionResult());
    vi.mocked(autoSetup.generateAutoMeshes).mockResolvedValue(meshResults);
    vi.mocked(autoSetup.generateAutoWeights).mockResolvedValue(weightResults);

    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();
    await clickPreviewAndWait();

    expect(screen.getByText(/メッシュ/)).toBeInTheDocument();
    expect(screen.getByText(/4頂点/)).toBeInTheDocument();
    expect(screen.getByText(/2三角形/)).toBeInTheDocument();

    expect(screen.getByText(/controller-rig Safe Auto Setup/)).toBeInTheDocument();
  });

  it("適用時にボーン親子階層が正しく構築される", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "bone-root",
            name: "胴体",
            parentTempId: null,
            x: 50,
            y: 200,
            partCategory: "body",
          },
          {
            tempId: "bone-head",
            name: "頭",
            parentTempId: "bone-root",
            x: 50,
            y: 50,
            partCategory: "head",
          },
          {
            tempId: "bone-eye",
            name: "左目",
            parentTempId: "bone-head",
            x: 30,
            y: 40,
            partCategory: "eyeLeft",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;

    const rootBones = project.layers.filter((l) => l.kind === "bone");
    expect(rootBones.length).toBe(1);
    expect(rootBones[0]!.name).toBe("胴体");

    const bodyBone = rootBones[0]!;
    const headBone = bodyBone.children.find((c) => c.name === "頭");
    expect(headBone).toBeDefined();
    expect(headBone!.kind).toBe("bone");
    expect((headBone as import("@vivi2d/core").BoneNode).parentBoneId).toBe(bodyBone.id);

    const eyeBone = headBone!.children.find((c) => c.name === "左目");
    expect(eyeBone).toBeDefined();
    expect(eyeBone!.kind).toBe("bone");
    expect((eyeBone as import("@vivi2d/core").BoneNode).parentBoneId).toBe(headBone!.id);
  });

  it("全ボーンがルート（parentTempId=null）の場合、全てルートレベルに配置される", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "b1",
            name: "ボーンA",
            parentTempId: null,
            x: 10,
            y: 10,
            partCategory: "head",
          },
          {
            tempId: "b2",
            name: "ボーンB",
            parentTempId: null,
            x: 50,
            y: 50,
            partCategory: "body",
          },
          {
            tempId: "b3",
            name: "ボーンC",
            parentTempId: null,
            x: 90,
            y: 90,
            partCategory: "armLeft",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    await act(async () => {
      fireEvent.click(screen.getByText("適用"));
    });

    const project = useEditorStore.getState().project!;
    const rootBones = project.layers.filter((l) => l.kind === "bone");
    expect(rootBones).toHaveLength(3);
    expect(rootBones.every((b) => b.children.length === 0)).toBe(true);
  });

  it("子ボーンが除外された場合、親は追加されるが子はスキップ", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "parent-bone",
            name: "親ボーン",
            parentTempId: null,
            x: 50,
            y: 50,
            partCategory: "body",
          },
          {
            tempId: "m1",
            name: "子ボーン",
            parentTempId: "parent-bone",
            x: 30,
            y: 30,
            partCategory: "eyeLeft",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();

    const tableBody = screen.getByRole("table").querySelector("tbody")!;
    const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]!);

    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;
    const bones = project.layers.filter((l) => l.kind === "bone");
    expect(bones).toHaveLength(1);
    expect(bones[0]!.name).toBe("親ボーン");
    expect(bones[0]!.children).toHaveLength(0);
  });

  it("複数ボーンが同じ親を持つ場合（スター型）", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "root",
            name: "体",
            parentTempId: null,
            x: 50,
            y: 200,
            partCategory: "body",
          },
          {
            tempId: "c1",
            name: "左腕",
            parentTempId: "root",
            x: 20,
            y: 180,
            partCategory: "armLeft",
          },
          {
            tempId: "c2",
            name: "右腕",
            parentTempId: "root",
            x: 80,
            y: 180,
            partCategory: "armRight",
          },
          {
            tempId: "c3",
            name: "頭",
            parentTempId: "root",
            x: 50,
            y: 50,
            partCategory: "head",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;
    const rootBones = project.layers.filter((l) => l.kind === "bone");
    expect(rootBones).toHaveLength(1);
    expect(rootBones[0]!.name).toBe("体");
    expect(rootBones[0]!.children).toHaveLength(3);
    const childNames = rootBones[0]!.children.map((c) => c.name).sort();
    expect(childNames).toEqual(["右腕", "左腕", "頭"]);
  });

  it("4段チェーン型階層（A→B→C→D）が正しく構築される", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "a",
            name: "A",
            parentTempId: null,
            x: 50,
            y: 200,
            partCategory: "body",
          },
          {
            tempId: "b",
            name: "B",
            parentTempId: "a",
            x: 50,
            y: 150,
            partCategory: "head",
          },
          {
            tempId: "c",
            name: "C",
            parentTempId: "b",
            x: 50,
            y: 100,
            partCategory: "eyeLeft",
          },
          {
            tempId: "d",
            name: "D",
            parentTempId: "c",
            x: 50,
            y: 50,
            partCategory: "eyeRight",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;
    const rootBones = project.layers.filter((l) => l.kind === "bone");
    expect(rootBones).toHaveLength(1);
    expect(rootBones[0]!.name).toBe("A");

    const bNode = rootBones[0]!.children[0]!;
    expect(bNode.name).toBe("B");
    const cNode = bNode.children[0]!;
    expect(cNode.name).toBe("C");
    const dNode = cNode.children[0]!;
    expect(dNode.name).toBe("D");
    expect(dNode.children).toHaveLength(0);
  });

  it("parentTempIdが存在しないtempIdを指す場合、子はルートに残る", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "b1",
            name: "ボーンA",
            parentTempId: null,
            x: 50,
            y: 50,
            partCategory: "body",
          },
          {
            tempId: "b2",
            name: "ボーンB",
            parentTempId: "nonexistent",
            x: 50,
            y: 100,
            partCategory: "head",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;
    const rootBones = project.layers.filter((l) => l.kind === "bone");
    expect(rootBones).toHaveLength(2);
  });

  it("実際的なVTuberモデル階層（体→頭→目/口, 体→腕）が構築される", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
        {
          layerId: "m2",
          layerName: "右目",
          category: "eyeRight",
          confidence: 0.85,
          bounds: { x: 50, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "bone_body",
            name: "体",
            parentTempId: null,
            x: 50,
            y: 300,
            partCategory: "body",
          },
          {
            tempId: "bone_head",
            name: "頭",
            parentTempId: "bone_body",
            x: 50,
            y: 100,
            partCategory: "head",
          },
          {
            tempId: "bone_eye_l",
            name: "左目",
            parentTempId: "bone_head",
            x: 30,
            y: 80,
            partCategory: "eyeLeft",
          },
          {
            tempId: "bone_eye_r",
            name: "右目",
            parentTempId: "bone_head",
            x: 70,
            y: 80,
            partCategory: "eyeRight",
          },
          {
            tempId: "bone_mouth",
            name: "口",
            parentTempId: "bone_head",
            x: 50,
            y: 130,
            partCategory: "mouth",
          },
          {
            tempId: "bone_arm_l",
            name: "左腕",
            parentTempId: "bone_body",
            x: 10,
            y: 250,
            partCategory: "armLeft",
          },
          {
            tempId: "bone_arm_r",
            name: "右腕",
            parentTempId: "bone_body",
            x: 90,
            y: 250,
            partCategory: "armRight",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;

    const rootBones = project.layers.filter((l) => l.kind === "bone");
    expect(rootBones).toHaveLength(1);
    const bodyBone = rootBones[0]!;
    expect(bodyBone.name).toBe("体");

    expect(bodyBone.children).toHaveLength(3);
    const headBone = bodyBone.children.find((c) => c.name === "頭")!;
    expect(headBone).toBeDefined();
    expect(bodyBone.children.some((c) => c.name === "左腕")).toBe(true);
    expect(bodyBone.children.some((c) => c.name === "右腕")).toBe(true);

    expect(headBone.children).toHaveLength(3);
    expect(headBone.children.some((c) => c.name === "左目")).toBe(true);
    expect(headBone.children.some((c) => c.name === "右目")).toBe(true);
    expect(headBone.children.some((c) => c.name === "口")).toBe(true);
  });

  it("ウェイト＋親子階層の同時適用が正しく動作する", async () => {
    setupProject();
    const weightResults: autoSetup.WeightGenerationResult[] = [
      {
        layerId: "m1",
        weights: [
          [
            { boneId: "root", weight: 0.7 },
            { boneId: "child", weight: 0.3 },
          ],
        ],
        boneIds: ["root", "child"],
      },
    ];
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "root",
            name: "ルート",
            parentTempId: null,
            x: 50,
            y: 200,
            partCategory: "body",
          },
          {
            tempId: "child",
            name: "子",
            parentTempId: "root",
            x: 50,
            y: 50,
            partCategory: "head",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [
        {
          layerId: "m1",
          layerName: "左目",
          mesh: {
            vertices: [0, 0, 10, 0, 5, 10],
            uvs: [0, 0, 1, 0, 0.5, 1],
            indices: [0, 1, 2],
            divisionsX: 0,
            divisionsY: 0,
          },
        },
      ],
      weightResults,
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);
    vi.mocked(autoSetup.generateAutoMeshes).mockResolvedValue(result.meshResults);
    vi.mocked(autoSetup.generateAutoWeights).mockResolvedValue(weightResults);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;

    const rootBones = project.layers.filter((l) => l.kind === "bone");
    expect(rootBones).toHaveLength(1);
    expect(rootBones[0]!.children).toHaveLength(1);

    await act(async () => {});
    expect(Object.keys(project.skins)).toHaveLength(0);
  });

  it("中間ノードが除外された場合、孫はルートに残る", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "root",
            name: "ルート",
            parentTempId: null,
            x: 50,
            y: 200,
            partCategory: "body",
          },
          {
            tempId: "m1",
            name: "中間",
            parentTempId: "root",
            x: 50,
            y: 100,
            partCategory: "head",
          },
          {
            tempId: "leaf",
            name: "リーフ",
            parentTempId: "m1",
            x: 50,
            y: 50,
            partCategory: "eyeLeft",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();

    const tableBody = screen.getByRole("table").querySelector("tbody")!;
    const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]!);

    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;
    const rootBones = project.layers.filter((l) => l.kind === "bone");
    expect(rootBones).toHaveLength(2);
    expect(rootBones.some((b) => b.name === "ルート")).toBe(true);
    expect(rootBones.some((b) => b.name === "リーフ")).toBe(true);
  });

  it("親が除外された場合、子ボーンはルートに残る", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "m1",
            name: "親ボーン",
            parentTempId: null,
            x: 50,
            y: 200,
            partCategory: "body",
          },
          {
            tempId: "bone-child",
            name: "子ボーン",
            parentTempId: "m1",
            x: 50,
            y: 50,
            partCategory: "head",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);

    await clickDetectAndWait();

    const tableBody = screen.getByRole("table").querySelector("tbody")!;
    const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]!);

    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;

    const bones = project.layers.filter((l) => l.kind === "bone");
    expect(bones.length).toBe(1);
    expect(bones[0]!.name).toBe("子ボーン");
    expect(bones[0]!.children.length).toBe(0);
  });

  it("空のboneResult.bonesでも適用が正常に完了する", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);
    const onClose = vi.fn();

    render(<AutoSetupDialog onClose={onClose} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    const project = useEditorStore.getState().project!;
    const bones = project.layers.filter((l) => l.kind === "bone");
    expect(bones).toHaveLength(0);
  });

  it("projectStructureVersionがメッシュ/ウェイト適用後にインクリメントされる", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "b1",
            name: "ルート",
            parentTempId: null,
            x: 50,
            y: 50,
            partCategory: "body",
          },
          {
            tempId: "b2",
            name: "子",
            parentTempId: "b1",
            x: 50,
            y: 20,
            partCategory: "head",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [
        {
          layerId: "m1",
          layerName: "左目",
          mesh: {
            vertices: [0, 0, 10, 0, 5, 10],
            uvs: [0, 0, 1, 0, 0.5, 1],
            indices: [0, 1, 2],
            divisionsX: 0,
            divisionsY: 0,
          },
        },
      ],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);
    vi.mocked(autoSetup.generateAutoMeshes).mockResolvedValue(result.meshResults);
    vi.mocked(autoSetup.generateAutoWeights).mockResolvedValue([]);

    const versionBefore = useEditorStore.getState().projectStructureVersion;

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const versionAfter = useEditorStore.getState().projectStructureVersion;
    expect(versionAfter).toBeGreaterThan(versionBefore);
  });

  it("ボーンのみ（メッシュ/ウェイトなし）ではprojectStructureVersionはインクリメントされない", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "b1",
            name: "ルート",
            parentTempId: null,
            x: 50,
            y: 50,
            partCategory: "body",
          },
          {
            tempId: "b2",
            name: "子",
            parentTempId: "b1",
            x: 50,
            y: 20,
            partCategory: "head",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);
    vi.mocked(autoSetup.generateAutoMeshes).mockResolvedValue([]);
    vi.mocked(autoSetup.generateAutoWeights).mockResolvedValue([]);

    const versionBefore = useEditorStore.getState().projectStructureVersion;

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const versionAfter = useEditorStore.getState().projectStructureVersion;
    expect(versionAfter).toBe(versionBefore);
  });

  it("ボーン1本のみ（親子関係なし）が正しく追加される", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "single",
            name: "単独ボーン",
            parentTempId: null,
            x: 100,
            y: 200,
            partCategory: "body",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;
    const bones = project.layers.filter((l) => l.kind === "bone");
    expect(bones).toHaveLength(1);
    expect(bones[0]!.name).toBe("単独ボーン");
    expect(bones[0]!.children).toHaveLength(0);
  });

  it("複数のルートボーンがある場合、それぞれ独立してルートに配置される", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "tree1_root",
            name: "ツリー1",
            parentTempId: null,
            x: 20,
            y: 50,
            partCategory: "body",
          },
          {
            tempId: "tree1_child",
            name: "ツリー1-子",
            parentTempId: "tree1_root",
            x: 20,
            y: 20,
            partCategory: "head",
          },
          {
            tempId: "tree2_root",
            name: "ツリー2",
            parentTempId: null,
            x: 80,
            y: 50,
            partCategory: "armLeft",
          },
          {
            tempId: "tree2_child",
            name: "ツリー2-子",
            parentTempId: "tree2_root",
            x: 80,
            y: 20,
            partCategory: "armRight",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;
    const rootBones = project.layers.filter((l) => l.kind === "bone");
    expect(rootBones).toHaveLength(2);
    expect(rootBones[0]!.children).toHaveLength(1);
    expect(rootBones[1]!.children).toHaveLength(1);
  });

  it("適用操作は 1 回の Undo で元に戻せる（履歴が単一エントリ）", async () => {
    setupProject();
    resetHistoryStore();
    _resetMergeTimer();

    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "root",
            name: "ルート",
            parentTempId: null,
            x: 50,
            y: 200,
            partCategory: "body",
          },
          {
            tempId: "child",
            name: "子",
            parentTempId: "root",
            x: 50,
            y: 100,
            partCategory: "head",
          },
        ],
        parameters: [
          { name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0, group: "頭" },
          { name: "角度Y", minValue: -30, maxValue: 30, defaultValue: 0, group: "頭" },
        ],
      },
      physicsGroups: [
        {
          name: "前髪揺れ",
          partCategory: "hairFront",
          layerIds: ["m4"],
          stiffness: 0.5,
          gravity: 0.3,
          damping: 0.1,
        },
      ],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();

    const projectBefore = useEditorStore.getState().project!;
    const snapshotBefore = structuredClone(projectBefore);
    const undoDepthBefore = useHistoryStore.getState().undoStack.length;

    fireEvent.click(screen.getByText("適用"));

    const undoDepthAfter = useHistoryStore.getState().undoStack.length;
    expect(undoDepthAfter - undoDepthBefore).toBe(1);

    useHistoryStore.getState().undo();
    const projectRestored = useEditorStore.getState().project!;
    expect(projectRestored).toEqual(snapshotBefore);
  });

  it("大量のボーン（10本以上）の階層が正しく構築される", async () => {
    setupProject();
    const bones: GeneratedBone[] = [
      {
        tempId: "root",
        name: "ルート",
        parentTempId: null,
        x: 50,
        y: 300,
        partCategory: "body",
      },
    ];
    for (let i = 0; i < 10; i++) {
      bones.push({
        tempId: `child_${i}`,
        name: `子${i}`,
        parentTempId: "root",
        x: i * 10,
        y: 200,
        partCategory: "head",
      });
    }
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "左目",
          category: "eyeLeft",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: { bones, parameters: [] },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const project = useEditorStore.getState().project!;
    const rootBones = project.layers.filter((l) => l.kind === "bone");
    expect(rootBones).toHaveLength(1);
    expect(rootBones[0]!.children).toHaveLength(10);
  });

  it("skips user-edited managed Auto Setup bones on reapply", async () => {
    setupProject();
    const result: autoSetup.AutoSetupResult = {
      detectedParts: [
        {
          layerId: "m1",
          layerName: "managed source",
          category: "head",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ],
      boneResult: {
        bones: [
          {
            tempId: "managed_head",
            name: "Managed Head",
            parentTempId: null,
            x: 50,
            y: 40,
            partCategory: "head",
          },
        ],
        parameters: [],
      },
      physicsGroups: [],
      meshResults: [],
      weightResults: [],
    };
    vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);

    const first = render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const projectAfterFirstApply = useEditorStore.getState().project!;
    const editedProject = structuredClone(projectAfterFirstApply);
    const generatedBone = editedProject.layers.find(
      (layer) => layer.kind === "bone" && layer.name === "Managed Head",
    );
    expect(generatedBone).toBeDefined();
    generatedBone!.x = 123;
    useEditorStore.setState({ project: editedProject });
    first.unmount();

    render(<AutoSetupDialog onClose={() => {}} />);
    await clickDetectAndWait();
    await clickPreviewAndWait();
    fireEvent.click(screen.getByText("適用"));

    const projectAfterReapply = useEditorStore.getState().project!;
    const generatedBones = projectAfterReapply.layers.filter(
      (layer) => layer.kind === "bone" && layer.name === "Managed Head",
    );
    expect(generatedBones).toHaveLength(1);
    expect(generatedBones[0]!.x).toBe(123);
  });
});
