import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LipSyncPanel } from "@/components/LipSyncPanel";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useLipSyncStore } from "@/stores/lipsyncStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { resetEditorStore, resetLipSyncStore } from "@/test/store-reset";

describe("LipSyncPanel", () => {
  beforeEach(() => {
    resetEditorStore();
    resetLipSyncStore();
    clearTextures();
  });

  it("プロジェクトなしでは何も表示しない", () => {
    const { container } = render(<LipSyncPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("有効チェックボックスで enabled を切り替えられる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LipSyncPanel />);

    expect(screen.getByText("リップシンク")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(useEditorStore.getState().project!.lipsyncConfig.enabled).toBe(true);
  });

  it("接続・エラー・音量の状態変化を表示する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LipSyncPanel />);
    expect(screen.getByText("未接続")).toBeInTheDocument();
    expect(screen.getByText("音量")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    act(() => useLipSyncStore.getState().setConnected(true));
    expect(screen.getByText("接続中")).toBeInTheDocument();
    act(() => useLipSyncStore.getState().setVolume(0.75));
    expect(screen.getByText("75%")).toBeInTheDocument();
    act(() => useLipSyncStore.getState().setError("マイクの許可が拒否されました"));
    expect(screen.getByText("マイクの許可が拒否されました")).toBeInTheDocument();
  });

  it("ソース選択でソースを変更できる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LipSyncPanel />);

    const selects = screen.getAllByRole("combobox");
    const sourceSelect = selects.find((s) => s.querySelector('option[value="file"]'));
    expect(sourceSelect).toBeDefined();

    fireEvent.change(sourceSelect!, { target: { value: "file" } });
    expect(useEditorStore.getState().project!.lipsyncConfig.source).toBe("file");
  });

  it("ゲイン・平滑化・閾値を各スライダーから変更できる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LipSyncPanel />);

    const sliders = screen.getAllByRole("slider");
    const gainSlider = sliders.find((s) => s.getAttribute("max") === "10");
    expect(gainSlider).toBeDefined();

    fireEvent.change(gainSlider!, { target: { value: "5.0" } });
    expect(useEditorStore.getState().project!.lipsyncConfig.gain).toBe(5.0);
    const smoothingSlider = sliders.find((s) => s.getAttribute("max") === "0.99");
    expect(smoothingSlider).toBeDefined();
    fireEvent.change(smoothingSlider!, { target: { value: "0.5" } });
    expect(useEditorStore.getState().project!.lipsyncConfig.smoothing).toBe(0.5);
    const thresholdSlider = sliders.find((s) => s.getAttribute("max") === "0.2");
    expect(thresholdSlider).toBeDefined();
    fireEvent.change(thresholdSlider!, { target: { value: "0.1" } });
    expect(useEditorStore.getState().project!.lipsyncConfig.threshold).toBe(0.1);
  });

  it("パラメータ選択で対象パラメータを変更できる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useParameterDefinitionStore.getState().addParameter("口開閉", 0, 1, 0);
    const paramId = useEditorStore.getState().project!.parameters[0]!.id;

    render(<LipSyncPanel />);

    const selects = screen.getAllByRole("combobox");
    const paramSelect = selects.find((s) => s.querySelector('option[value=""]'));
    expect(paramSelect).toBeDefined();

    fireEvent.change(paramSelect!, { target: { value: paramId } });
    expect(useEditorStore.getState().project!.lipsyncConfig.targetParameterId).toBe(
      paramId,
    );
  });

  it("パラメータ選択を空にすると null が設定される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useParameterDefinitionStore.getState().addParameter("口開閉", 0, 1, 0);
    const paramId = useEditorStore.getState().project!.parameters[0]!.id;

    useEditorStore.setState((s) => ({
      ...s,
      project: {
        ...s.project!,
        lipsyncConfig: { ...s.project!.lipsyncConfig, targetParameterId: paramId },
      } as any,
    }));

    render(<LipSyncPanel />);

    const selects = screen.getAllByRole("combobox");
    const paramSelect = selects.find((s) => s.querySelector('option[value=""]'));
    fireEvent.change(paramSelect!, { target: { value: "" } });

    expect(useEditorStore.getState().project!.lipsyncConfig.targetParameterId).toBeNull();
  });
});
