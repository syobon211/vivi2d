import { render, screen } from "@testing-library/react";
import type { ProjectData, SkinData } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkinProperties } from "@/components/properties/SkinProperties";
import { createViviMesh, createBoneNode, createGroup } from "@/test/fixtures";



const mockBindSkin = vi.fn();
const mockUnbindSkin = vi.fn();
const mockNormalizeAllWeights = vi.fn();

vi.mock("@/stores/skinStore", () => ({
  useSkinStore: {
    getState: () => ({
      bindSkin: mockBindSkin,
      unbindSkin: mockUnbindSkin,
      normalizeAllWeights: mockNormalizeAllWeights,
    }),
  },
}));

let mockProject: Partial<ProjectData> | null = null;

vi.mock("@/stores/editorStore", () => ({
  useEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ project: mockProject }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockProject = null;
});

describe("SkinProperties", () => {
  it("viviMesh以外のレイヤーではnullを返す", () => {
    const group = createGroup();
    mockProject = { layers: [], skins: {} };
    const { container } = render(<SkinProperties layer={group} />);
    expect(container.innerHTML).toBe("");
  });

  it("ボーンが存在しない場合は「全ボーンにバインド」ボタンが表示されない", () => {
    const mesh = createViviMesh({ name: "テストメッシュ" });
    mockProject = { layers: [mesh], skins: {} };
    render(<SkinProperties layer={mesh} />);

    expect(screen.getByText("スキン")).toBeInTheDocument();
    expect(screen.getByText("未バインド")).toBeInTheDocument();
    expect(screen.queryByText("全ボーンにバインド")).not.toBeInTheDocument();
  });

  it("ボーンが存在する場合は「全ボーンにバインド」ボタンが表示される", () => {
    const mesh = createViviMesh({ name: "テストメッシュ" });
    const bone = createBoneNode({ name: "テストボーン" });
    mockProject = { layers: [mesh, bone], skins: {} };
    render(<SkinProperties layer={mesh} />);

    expect(screen.getByText("全ボーンにバインド")).toBeInTheDocument();
  });

  it("バインド済みの場合は「バインド解除」ボタンが表示される", () => {
    const mesh = createViviMesh({ id: "mesh1", name: "テストメッシュ" });
    const bone = createBoneNode({ id: "bone1", name: "テストボーン" });
    const skinData: SkinData = {
      weights: [[{ boneId: "bone1", weight: 1 }]],
      bindPoseInverse: { bone1: [1, 0, 0, 1, 0, 0] },
    };
    mockProject = {
      layers: [mesh, bone],
      skins: { mesh1: skinData },
    };
    render(<SkinProperties layer={mesh} />);

    expect(screen.getByText("バインド解除")).toBeInTheDocument();
    expect(screen.queryByText("全ボーンにバインド")).not.toBeInTheDocument();
  });
});
