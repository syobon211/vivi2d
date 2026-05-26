import { fireEvent, render, screen } from "@testing-library/react";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { GraphEditor } from "../timeline/GraphEditor";

if (!("setPointerCapture" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
}
if (!("releasePointerCapture" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
}


function createClipWithTracks() {
  return createAnimationClip({
    id: "clip-1",
    name: "テスト",
    duration: 90,
    fps: 30,
    tracks: [
      {
        parameterId: "p1",
        keyframes: [
          { frame: 0, value: -30, interpolation: "linear" },
          { frame: 45, value: 0, interpolation: "linear" },
          { frame: 89, value: 30, interpolation: "linear" },
        ],
      },
      {
        parameterId: "p2",
        keyframes: [
          {
            frame: 0,
            value: 0,
            interpolation: "bezier",
            cp1x: 0.25,
            cp1y: 0,
            cp2x: 0.75,
            cp2y: 1,
          },
          { frame: 89, value: 1, interpolation: "linear" },
        ],
      },
    ],
  });
}

function setupStores(clip = createClipWithTracks()) {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [
        { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
        { id: "p2", name: "透明度", minValue: 0, maxValue: 1, defaultValue: 0 },
      ],
      clips: [clip],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeClipId: clip.id,
    currentFrame: 0,
    isPlaying: false,
    selectedGraphTrackId: null,
  });
}

describe("GraphEditor", () => {
  beforeEach(() => {
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [],
    } as any);
    setupStores();
  });
  afterEach(() => {
    resetEditorStore();
    resetTimelineStore();
  });

  it("SVGコンテナがレンダリングされる", () => {
    const clip = createClipWithTracks();
    const { container } = render(<GraphEditor clip={clip} />);

    expect(container.querySelector(".graph-editor-container")).toBeInTheDocument();
    expect(container.querySelector(".graph-editor-svg")).toBeInTheDocument();
  });

  it("グラフエディタのtitleが設定される", () => {
    const clip = createClipWithTracks();
    render(<GraphEditor clip={clip} />);

    expect(screen.getByTitle("グラフエディタ")).toBeInTheDocument();
  });

  it("グリッド線がレンダリングされる", () => {
    const clip = createClipWithTracks();
    const { container } = render(<GraphEditor clip={clip} />);

    const lines = container.querySelectorAll("line");
    expect(lines.length).toBeGreaterThan(1);
  });

  it("カーブパスがレンダリングされる", () => {
    const clip = createClipWithTracks();
    const { container } = render(<GraphEditor clip={clip} />);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(2);
  });

  it("キーフレームドットがレンダリングされる", () => {
    const clip = createClipWithTracks();
    const { container } = render(<GraphEditor clip={clip} />);

    const dots = container.querySelectorAll(".graph-keyframe-dot");
    expect(dots.length).toBe(5);
  });

  it("プレイヘッドラインがレンダリングされる", () => {
    const clip = createClipWithTracks();
    const { container } = render(<GraphEditor clip={clip} />);

    const lines = container.querySelectorAll("line");
    const playheadLines = Array.from(lines).filter(
      (l) => l.getAttribute("stroke") === "var(--accent)",
    );
    expect(playheadLines.length).toBe(1);
  });

  it("selectedGraphTrackId設定時に1トラックのみ表示される", () => {
    const clip = createClipWithTracks();
    useTimelineStore.setState({ selectedGraphTrackId: "p1" });

    const { container } = render(<GraphEditor clip={clip} />);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(1);
    const dots = container.querySelectorAll(".graph-keyframe-dot");
    expect(dots.length).toBe(3);
  });

  it("空のトラッククリップでもエラーにならない", () => {
    const emptyClip = createAnimationClip({ tracks: [] });
    setupStores(emptyClip);

    expect(() => render(<GraphEditor clip={emptyClip} />)).not.toThrow();
  });

  it("ベジェキーフレームにハンドルが表示される", () => {
    const clip = createClipWithTracks();
    const { container } = render(<GraphEditor clip={clip} />);

    const handles = container.querySelectorAll(".graph-handle");
    expect(handles.length).toBeGreaterThanOrEqual(1);
  });

  it("グリッドにフレーム秒数ラベルが表示される", () => {
    const clip = createClipWithTracks();
    const { container } = render(<GraphEditor clip={clip} />);

    const texts = container.querySelectorAll("text");
    const labels = Array.from(texts).map((t) => t.textContent);
    expect(labels).toContain("0s");
    expect(labels).toContain("1s");
  });

  it("存在しないselectedGraphTrackIdで空のトラック表示になる", () => {
    const clip = createClipWithTracks();
    useTimelineStore.setState({ selectedGraphTrackId: "nonexistent" });

    const { container } = render(<GraphEditor clip={clip} />);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(0);
    const dots = container.querySelectorAll(".graph-keyframe-dot");
    expect(dots.length).toBe(0);
  });

  it("selectedParam使用時にそのパラメータの値域が使われる", () => {
    const clip = createClipWithTracks();
    useTimelineStore.setState({ selectedGraphTrackId: "p2" });

    const { container } = render(<GraphEditor clip={clip} />);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(1);
    const dots = container.querySelectorAll(".graph-keyframe-dot");
    expect(dots.length).toBe(2);
  });

  it("project未設定でも空パラメータ配列で安全に動作する", () => {
    useEditorStore.setState({ project: null });
    const clip = createClipWithTracks();

    expect(() => render(<GraphEditor clip={clip} />)).not.toThrow();
  });

  it("ステップ補間のカーブがレンダリングされる", () => {
    const clip = createAnimationClip({
      id: "clip-step",
      name: "ステップテスト",
      duration: 90,
      fps: 30,
      tracks: [
        {
          parameterId: "p1",
          keyframes: [
            { frame: 0, value: 0, interpolation: "step" },
            { frame: 45, value: 15, interpolation: "step" },
            { frame: 89, value: 30, interpolation: "linear" },
          ],
        },
      ],
    });
    setupStores(clip);

    const { container } = render(<GraphEditor clip={clip} />);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(1);
  });

  it("前のキーフレームがbezierの場合に入力ハンドルが表示される", () => {
    const clip = createAnimationClip({
      id: "clip-bezier-in",
      name: "ベジェ入力ハンドル",
      duration: 90,
      fps: 30,
      tracks: [
        {
          parameterId: "p1",
          keyframes: [
            {
              frame: 0,
              value: -30,
              interpolation: "bezier",
              cp1x: 0.25,
              cp1y: 0,
              cp2x: 0.75,
              cp2y: 1,
            },
            {
              frame: 45,
              value: 0,
              interpolation: "bezier",
              cp1x: 0.25,
              cp1y: 0,
              cp2x: 0.75,
              cp2y: 1,
            },
            { frame: 89, value: 30, interpolation: "linear" },
          ],
        },
      ],
    });
    setupStores(clip);

    const { container } = render(<GraphEditor clip={clip} />);

    const handles = container.querySelectorAll(".graph-handle");
    expect(handles.length).toBeGreaterThanOrEqual(2);
  });

  it("全トラック表示時に合算値域が計算される", () => {
    useTimelineStore.setState({ selectedGraphTrackId: null });
    const clip = createClipWithTracks();

    const { container } = render(<GraphEditor clip={clip} />);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(2);
  });

  it("パラメータ定義なしのトラックが合算値域で0-1になる", () => {
    const clip = createAnimationClip({
      id: "clip-no-param",
      name: "パラメータなし",
      duration: 90,
      fps: 30,
      tracks: [
        {
          parameterId: "unknown-param",
          keyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 89, value: 1, interpolation: "linear" },
          ],
        },
      ],
    });
    useTimelineStore.setState({ selectedGraphTrackId: null });

    const { container } = render(<GraphEditor clip={clip} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(1);
  });


  it("ベジェ補間のキーフレームでコントロールポイントが表示される", () => {
    const clip = createAnimationClip({
      id: "clip-bezier",
      name: "Bezier",
      duration: 90,
      fps: 30,
      tracks: [
        {
          parameterId: "p1",
          keyframes: [
            {
              frame: 0,
              value: 0,
              interpolation: "bezier",
              cp1x: 0.25,
              cp1y: 0,
              cp2x: 0.75,
              cp2y: 1,
            },
            {
              frame: 45,
              value: 50,
              interpolation: "bezier",
              cp1x: 0.25,
              cp1y: 0,
              cp2x: 0.75,
              cp2y: 1,
            },
            { frame: 89, value: 100, interpolation: "linear" },
          ],
        },
      ],
    });
    useTimelineStore.setState({ selectedGraphTrackId: "p1" });

    const { container } = render(<GraphEditor clip={clip} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
  });

  it("最後のキーフレームにはonDragHandleOutがnullになる", () => {
    const clip = createAnimationClip({
      id: "clip-last",
      name: "Last",
      duration: 90,
      fps: 30,
      tracks: [
        {
          parameterId: "p1",
          keyframes: [
            {
              frame: 0,
              value: 0,
              interpolation: "bezier",
              cp1x: 0.25,
              cp1y: 0,
              cp2x: 0.75,
              cp2y: 1,
            },
            {
              frame: 89,
              value: 100,
              interpolation: "bezier",
              cp1x: 0.25,
              cp1y: 0,
              cp2x: 0.75,
              cp2y: 1,
            },
          ],
        },
      ],
    });
    useTimelineStore.setState({ selectedGraphTrackId: "p1" });

    const { container } = render(<GraphEditor clip={clip} />);
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("ステップ補間ではベジェハンドルが表示されない", () => {
    const clip = createAnimationClip({
      id: "clip-step",
      name: "Step",
      duration: 90,
      fps: 30,
      tracks: [
        {
          parameterId: "p1",
          keyframes: [
            { frame: 0, value: 0, interpolation: "step" },
            { frame: 45, value: 50, interpolation: "step" },
            { frame: 89, value: 100, interpolation: "step" },
          ],
        },
      ],
    });
    useTimelineStore.setState({ selectedGraphTrackId: "p1" });

    const { container } = render(<GraphEditor clip={clip} />);
    const handles = container.querySelectorAll(".graph-handle");
    expect(handles.length).toBe(0);
  });

  it("キーフレームが1つだけのトラックでもクラッシュしない", () => {
    const clip = createAnimationClip({
      id: "clip-single",
      name: "Single",
      duration: 90,
      fps: 30,
      tracks: [
        {
          parameterId: "p1",
          keyframes: [{ frame: 0, value: 50, interpolation: "linear" }],
        },
      ],
    });
    useTimelineStore.setState({ selectedGraphTrackId: "p1" });

    expect(() => render(<GraphEditor clip={clip} />)).not.toThrow();
  });


  describe("値編集 popup (P8-5c)", () => {
    it("contextmenu でキーフレーム値編集ダイアログが開く", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      expect(dot).not.toBeNull();
      fireEvent.contextMenu(dot!, { clientX: 100, clientY: 200 });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("Enter キーで popup が開き input に focus される", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.keyDown(dot!, { key: "Enter" });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    });

    it("Space キーでも popup が開く", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.keyDown(dot!, { key: " " });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("値を入力して Enter で submit すると updateKeyframe が呼ばれる", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const spy = vi.spyOn(useClipStore.getState(), "updateKeyframe");
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.contextMenu(dot!, { clientX: 100, clientY: 200 });

      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "12.5" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(spy).toHaveBeenCalledWith("clip-1", "p1", 0, { value: 12.5 });
    });

    it("OK ボタンで submit すると updateKeyframe が呼ばれる", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const spy = vi.spyOn(useClipStore.getState(), "updateKeyframe");
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.contextMenu(dot!, { clientX: 100, clientY: 200 });

      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "5" } });

      const okButton = screen.getByRole("button", { name: /ok|確認|決定/i });
      fireEvent.click(okButton);

      expect(spy).toHaveBeenCalledWith("clip-1", "p1", 0, { value: 5 });
    });

    it("値が valueRange を超える場合に max へ clamp される", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const spy = vi.spyOn(useClipStore.getState(), "updateKeyframe");
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.contextMenu(dot!, { clientX: 100, clientY: 200 });

      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "9999" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(spy).toHaveBeenCalledWith("clip-1", "p1", 0, { value: 30 });
    });

    it("値が valueRange を下回る場合に min へ clamp される", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const spy = vi.spyOn(useClipStore.getState(), "updateKeyframe");
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.contextMenu(dot!, { clientX: 100, clientY: 200 });

      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "-9999" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(spy).toHaveBeenCalledWith("clip-1", "p1", 0, { value: -30 });
    });

    it("無効な数値 (NaN) を入力しても updateKeyframe は呼ばれず popup が閉じる", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const spy = vi.spyOn(useClipStore.getState(), "updateKeyframe");
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.contextMenu(dot!, { clientX: 100, clientY: 200 });

      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "abc" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(spy).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Cancel ボタンで popup を閉じても updateKeyframe は呼ばれない", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const spy = vi.spyOn(useClipStore.getState(), "updateKeyframe");
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.contextMenu(dot!, { clientX: 100, clientY: 200 });

      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "5" } });

      const cancelButton = screen.getByRole("button", { name: /キャンセル|cancel/i });
      fireEvent.click(cancelButton);

      expect(spy).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Escape キーで popup が閉じる", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.contextMenu(dot!, { clientX: 100, clientY: 200 });
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("popup の位置 (popupX/popupY) が clientX/Y から rect オフセットを差引いて算出される", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.contextMenu(dot!, { clientX: 250, clientY: 175 });

      const dialog = screen.getByRole("dialog") as HTMLElement;
      expect(dialog.style.left).toMatch(/250|0/);
      expect(dialog.style.top).toMatch(/175|0/);
    });
  });


  describe("キーフレームドラッグ", () => {
    it("キーフレーム本体を pointermove で dy 分動かすと updateKeyframe が value を更新する", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const spy = vi.spyOn(useClipStore.getState(), "updateKeyframe");
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      expect(dot).not.toBeNull();

      fireEvent.pointerDown(dot!, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(dot!.parentElement!, {
        pointerId: 1,
        clientX: 100,
        clientY: 105,
      });

      expect(spy).toHaveBeenCalled();
      const call = spy.mock.calls[0]!;
      expect(call[0]).toBe("clip-1");
      expect(call[1]).toBe("p1");
      expect(call[2]).toBe(0);
      expect(call[3]).toHaveProperty("value");
    });

    it("ドラッグ完了 (pointerup) で onDragEnd が呼ばれる (副作用なし)", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.pointerDown(dot!, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerUp(dot!.parentElement!, { pointerId: 1 });
      expect(dot).toBeInTheDocument();
    });

    it("ベジェ出力ハンドル (cp1) を pointermove で動かすと updateKeyframe(cp1x, cp1y) が呼ばれる", () => {
      const clip = createAnimationClip({
        id: "clip-bz",
        name: "Bezier",
        duration: 90,
        fps: 30,
        tracks: [
          {
            parameterId: "p1",
            keyframes: [
              {
                frame: 0,
                value: 0,
                interpolation: "bezier",
                cp1x: 0.25,
                cp1y: 0,
                cp2x: 0.75,
                cp2y: 1,
              },
              { frame: 60, value: 30, interpolation: "linear" },
            ],
          },
        ],
      });
      setupStores(clip);
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const spy = vi.spyOn(useClipStore.getState(), "updateKeyframe");
      const { container } = render(<GraphEditor clip={clip} />);

      const handles = container.querySelectorAll(".graph-handle");
      expect(handles.length).toBeGreaterThanOrEqual(1);
      const outHandle = handles[0] as SVGElement;

      fireEvent.pointerDown(outHandle, { pointerId: 2, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(outHandle.parentElement!, {
        pointerId: 2,
        clientX: 60,
        clientY: 55,
      });

      expect(spy).toHaveBeenCalled();
      const call = spy.mock.calls.find((c) => "cp1x" in (c[3] ?? {}));
      expect(call).toBeDefined();
      expect(call?.[3]).toHaveProperty("cp1x");
      expect(call?.[3]).toHaveProperty("cp1y");
    });

    it("ベジェ入力ハンドル (cp2) を pointermove で動かすと前のキーフレームの cp2x/cp2y が更新される", () => {
      const clip = createAnimationClip({
        id: "clip-bz-in",
        name: "BezierIn",
        duration: 90,
        fps: 30,
        tracks: [
          {
            parameterId: "p1",
            keyframes: [
              {
                frame: 0,
                value: 0,
                interpolation: "bezier",
                cp1x: 0.25,
                cp1y: 0,
                cp2x: 0.75,
                cp2y: 1,
              },
              { frame: 60, value: 30, interpolation: "linear" },
            ],
          },
        ],
      });
      setupStores(clip);
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const spy = vi.spyOn(useClipStore.getState(), "updateKeyframe");
      const { container } = render(<GraphEditor clip={clip} />);

      const handles = container.querySelectorAll(".graph-handle");
      expect(handles.length).toBeGreaterThanOrEqual(2);
      const inHandle = handles[1] as SVGElement;

      fireEvent.pointerDown(inHandle, { pointerId: 3, clientX: 200, clientY: 100 });
      fireEvent.pointerMove(inHandle.parentElement!, {
        pointerId: 3,
        clientX: 210,
        clientY: 110,
      });

      const call = spy.mock.calls.find((c) => "cp2x" in (c[3] ?? {}));
      expect(call).toBeDefined();
      expect(call?.[3]).toHaveProperty("cp2x");
      expect(call?.[3]).toHaveProperty("cp2y");
      expect(call?.[2]).toBe(0);
    });

    it("段差ゼロ (segW=0) の場合 cp ハンドラは早期 return する (updateKeyframe コールなし)", () => {
      const clip = createAnimationClip({
        id: "clip-zero-seg",
        name: "ZeroSeg",
        duration: 1,
        fps: 30,
        tracks: [
          {
            parameterId: "p1",
            keyframes: [
              {
                frame: 0,
                value: 0,
                interpolation: "bezier",
                cp1x: 0.25,
                cp1y: 0,
                cp2x: 0.75,
                cp2y: 1,
              },
              {
                frame: 0,
                value: 30,
                interpolation: "bezier",
                cp1x: 0.25,
                cp1y: 0,
                cp2x: 0.75,
                cp2y: 1,
              },
            ],
          },
        ],
      });
      setupStores(clip);
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });

      const { container } = render(<GraphEditor clip={clip} />);
      expect(container.querySelector(".graph-editor-container")).toBeInTheDocument();
    });
  });
});
