import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoneProperties } from "@/components/properties/BoneProperties";
import { createBoneNode } from "@/test/fixtures";

const mockSetBoneAngle = vi.fn();
const mockSetBoneScale = vi.fn();
const mockSetBoneLength = vi.fn();

vi.mock("@/stores/boneStore", () => ({
  useBoneStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      setBoneAngle: mockSetBoneAngle,
      setBoneScale: mockSetBoneScale,
      setBoneLength: mockSetBoneLength,
    }),
}));

vi.mock("@/hooks/useDefaultFormLock", () => ({
  useDefaultFormLock: () => false,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BoneProperties", () => {
  it("ボーンノードの場合にプロパティを表示する", () => {
    const bone = createBoneNode({
      x: 100,
      y: 200,
      bone: { angle: Math.PI / 4, length: 75, scaleX: 1.5, scaleY: 0.8 },
    });
    render(<BoneProperties layer={bone} />);

    expect(screen.getByText("ボーン")).toBeInTheDocument();
    expect(screen.getByText("X: 100")).toBeInTheDocument();
    expect(screen.getByText("Y: 200")).toBeInTheDocument();
    expect(screen.getByText("45°")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("150%")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("ボーン以外のノードでは何も表示しない", () => {
    const group = {
      id: "g1",
      name: "グループ",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      children: [],
      blendMode: "normal" as const,
      expanded: true,
      kind: "group" as const,
    };
    const { container } = render(<BoneProperties layer={group} />);
    expect(container.innerHTML).toBe("");
  });

  it("角度スライダーでsetBoneAngleが呼ばれる", () => {
    const bone = createBoneNode();
    render(<BoneProperties layer={bone} />);

    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0]!, { target: { value: "45" } });

    expect(mockSetBoneAngle).toHaveBeenCalled();
  });

  it("長さスライダーでsetBoneLengthが呼ばれる", () => {
    const bone = createBoneNode();
    render(<BoneProperties layer={bone} />);

    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[1]!, { target: { value: "100" } });

    expect(mockSetBoneLength).toHaveBeenCalled();
  });


  it("スケールXスライダーでsetBoneScaleが呼ばれる", () => {
    const bone = createBoneNode({
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    render(<BoneProperties layer={bone} />);

    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[2]!, { target: { value: "200" } });

    expect(mockSetBoneScale).toHaveBeenCalledWith(bone.id, 2, 1);
  });

  it("スケールYスライダーでsetBoneScaleが呼ばれる", () => {
    const bone = createBoneNode({
      bone: { angle: 0, length: 50, scaleX: 1.5, scaleY: 1 },
    });
    render(<BoneProperties layer={bone} />);

    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[3]!, { target: { value: "250" } });

    expect(mockSetBoneScale).toHaveBeenCalledWith(bone.id, 1.5, 2.5);
  });

  it("角度が正しく度数表示される（ラジアンから変換）", () => {
    const bone = createBoneNode({
      bone: { angle: Math.PI, length: 50, scaleX: 1, scaleY: 1 },
    });
    render(<BoneProperties layer={bone} />);
    expect(screen.getByText("180°")).toBeInTheDocument();
  });

  it("角度スライダーのmin/maxが-180/180に設定される", () => {
    const bone = createBoneNode();
    render(<BoneProperties layer={bone} />);

    const sliders = screen.getAllByRole("slider");
    expect(sliders[0]).toHaveAttribute("min", "-180");
    expect(sliders[0]).toHaveAttribute("max", "180");
  });

  it("長さスライダーのmin/maxが0/200に設定される", () => {
    const bone = createBoneNode();
    render(<BoneProperties layer={bone} />);

    const sliders = screen.getAllByRole("slider");
    expect(sliders[1]).toHaveAttribute("min", "0");
    expect(sliders[1]).toHaveAttribute("max", "200");
  });

  it("スケールXのパーセント表示が正しい", () => {
    const bone = createBoneNode({
      bone: { angle: 0, length: 50, scaleX: 2.5, scaleY: 1 },
    });
    render(<BoneProperties layer={bone} />);
    expect(screen.getByText("250%")).toBeInTheDocument();
  });

  it("位置セクションのラベルが表示される", () => {
    const bone = createBoneNode({
      x: 50,
      y: 100,
    });
    render(<BoneProperties layer={bone} />);
    expect(screen.getByText("位置")).toBeInTheDocument();
    expect(screen.getByText("X: 50")).toBeInTheDocument();
    expect(screen.getByText("Y: 100")).toBeInTheDocument();
  });

  it("角度スライダーで正しいラジアン値がsetBoneAngleに渡される", () => {
    const bone = createBoneNode();
    render(<BoneProperties layer={bone} />);

    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0]!, { target: { value: "90" } });

    expect(mockSetBoneAngle).toHaveBeenCalledWith(
      bone.id,
      expect.closeTo(Math.PI / 2, 5),
    );
  });

  it("長さスライダーで正しい値がsetBoneLengthに渡される", () => {
    const bone = createBoneNode();
    render(<BoneProperties layer={bone} />);

    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[1]!, { target: { value: "150" } });

    expect(mockSetBoneLength).toHaveBeenCalledWith(bone.id, 150);
  });
});
