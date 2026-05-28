import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LayerSemanticRole } from "@vivi2d/core/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as autoSetup from "@/lib/auto-setup";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";
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

function createImportedMesh(id: string, name: string, semanticRole?: LayerSemanticRole) {
  return createViviMesh({
    id,
    name,
    semanticRole,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label: name,
        order: 0,
        confidence: 0.9,
        leftRightSplit: "center",
        frontBackSplit: "middle",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

function setupSeeThroughProject() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createImportedMesh("body", "Body", "body"),
        createImportedMesh("eye-left", "Eye Left", "eyeLeft"),
        createImportedMesh("eye-right", "Eye Right", "eyeRight"),
        createImportedMesh("accessory", "Accessory", "accessory"),
        createImportedMesh("unknown", "Unknown", "unknown"),
      ],
    },
    projectVersion: 1,
  });
}

function setupGenericProject() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ id: "plain", name: "Plain Layer", semanticRole: "body" }),
      ],
    },
    projectVersion: 1,
  });
}

function mockDetectionResult() {
  const result: autoSetup.AutoSetupResult = {
    detectedParts: [
      {
        layerId: "body",
        layerName: "Body",
        category: "body",
        confidence: 0.9,
        bounds: { x: 0, y: 0, width: 10, height: 10 },
      },
      {
        layerId: "accessory",
        layerName: "Accessory",
        category: "accessory",
        confidence: 0.8,
        bounds: { x: 0, y: 0, width: 10, height: 10 },
      },
      {
        layerId: "unknown",
        layerName: "Unknown",
        category: "unknown",
        confidence: 0.7,
        bounds: { x: 0, y: 0, width: 10, height: 10 },
      },
    ],
    boneResult: null,
    physicsGroups: [],
    meshResults: [],
    weightResults: [],
  };
  vi.mocked(autoSetup.previewAutoSetup).mockReturnValue(result);
  return result;
}

async function detectAndWait() {
  await userEvent.setup().click(screen.getByText("検出開始"));
  await waitFor(() => {
    expect(screen.getByText(/検出結果/)).toBeInTheDocument();
  });
}

function getRowCheckbox(text: string) {
  const row = screen.getByText(text).closest("tr");
  expect(row).not.toBeNull();
  return within(row as HTMLElement).getByRole("checkbox") as HTMLInputElement;
}

describe("AutoSetupDialog See-through Slice C", () => {
  afterEach(() => {
    resetAllStores();
    vi.restoreAllMocks();
  });

  it("shows a See-through summary in the detect step", () => {
    setupSeeThroughProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    expect(
      screen.getByRole("region", {
        name: /See-through assisted setup|See-through 支援セットアップ/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Imported ViviMeshes|取り込み ViviMesh/)).toBeInTheDocument();
    expect(screen.getAllByText(/Warnings|警告/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Info|情報/)).toBeInTheDocument();
    expect(
      screen.getByText(/Mouth layers are missing\.|口レイヤーが見つかりません。/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /1 imported layer\(s\) need review\.|1 件の取り込みレイヤーに確認が必要です。/,
      ),
    ).toBeInTheDocument();
  });

  it("applies recommendations and pre-excludes accessory and unknown parts after detect", async () => {
    setupSeeThroughProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await userEvent
      .setup()
      .click(
        screen.getByText(/Use See-through recommendations|See-through 推奨設定を使う/),
      );
    await detectAndWait();

    expect(getRowCheckbox("Body")).toBeChecked();
    expect(getRowCheckbox("Accessory")).not.toBeChecked();
    expect(getRowCheckbox("Unknown")).not.toBeChecked();
    expect(
      screen.getByText(
        /Recommended exclusions are applied for accessory and unknown parts\.|アクセサリと未確定パーツの推奨除外を適用しています。/,
      ),
    ).toBeInTheDocument();
  });

  it("restores recommended exclusions after manual toggles", async () => {
    setupSeeThroughProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    const user = userEvent.setup();
    await user.click(
      screen.getByText(/Use See-through recommendations|See-through 推奨設定を使う/),
    );
    await detectAndWait();

    await user.click(getRowCheckbox("Accessory"));
    expect(getRowCheckbox("Accessory")).toBeChecked();

    await user.click(screen.getByText(/Restore recommended exclusions|推奨除外を復元/));
    expect(getRowCheckbox("Accessory")).not.toBeChecked();
  });

  it("does not silently reapply exclusions on a later detect run", async () => {
    setupSeeThroughProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    const user = userEvent.setup();
    await user.click(
      screen.getByText(/Use See-through recommendations|See-through 推奨設定を使う/),
    );
    await detectAndWait();

    await user.click(getRowCheckbox("Accessory"));
    expect(getRowCheckbox("Accessory")).toBeChecked();

    await user.click(screen.getByText("戻る"));
    await detectAndWait();

    expect(getRowCheckbox("Accessory")).toBeChecked();
  });

  it("keeps the generic flow for non See-through projects", () => {
    setupGenericProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    expect(
      screen.queryByRole("region", {
        name: /See-through assisted setup|See-through 支援セットアップ/,
      }),
    ).not.toBeInTheDocument();
  });
});
