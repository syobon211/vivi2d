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

  it("全トラックのカーブ・グリッド・ドット・ハンドルと合算値域を表示する", () => {
    const clip = createClipWithTracks();
    const { container } = render(<GraphEditor clip={clip} />);

    expect(container.querySelector(".graph-editor-container")).toBeInTheDocument();
    expect(container.querySelector(".graph-editor-svg")).toBeInTheDocument();
    expect(screen.getByTitle("グラフエディタ")).toBeInTheDocument();
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelectorAll(".graph-keyframe-dot")).toHaveLength(5);
    expect(container.querySelectorAll(".graph-handle").length).toBeGreaterThanOrEqual(1);
    const lines = Array.from(container.querySelectorAll("line"));
    expect(lines.length).toBeGreaterThan(1);
    expect(
      lines.filter((line) => line.getAttribute("stroke") === "var(--accent)"),
    ).toHaveLength(1);
    const labels = Array.from(
      container.querySelectorAll("text"),
      (text) => text.textContent,
    );
    expect(labels).toContain("0s");
    expect(labels).toContain("1s");
    const values = labels
      .filter((label) => label !== "" && !label?.endsWith("s"))
      .map(Number);
    expect(values.some((value) => value < 0)).toBe(true);
    expect(values.some((value) => value > 1)).toBe(true);
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
    const labels = Array.from(
      container.querySelectorAll('text[text-anchor="end"]'),
      (node) => node.textContent,
    );
    expect(labels).toEqual(["0", "0.5", "1"]);
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
    expect(handles).toHaveLength(4);
    for (const [frame, count] of [
      [0, 1],
      [45, 2],
      [89, 1],
    ] as const) {
      const group = container.querySelector(`[data-kf-id="p1-${frame}"]`)!.parentElement!;
      expect(group.querySelectorAll(".graph-handle")).toHaveLength(count);
    }
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
    const labels = Array.from(
      container.querySelectorAll('text[text-anchor="end"]'),
      (node) => node.textContent,
    );
    expect(labels).toEqual(["0", "0.5", "1"]);
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
    it("Enter キーで popup が開き input に focus される", () => {
      const clip = createClipWithTracks();
      useTimelineStore.setState({ selectedGraphTrackId: "p1" });
      const { container } = render(<GraphEditor clip={clip} />);

      const dot = container.querySelector('[data-kf-id="p1-0"]') as SVGElement | null;
      fireEvent.keyDown(dot!, { key: "Enter" });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("spinbutton")).toHaveFocus();
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

      expect(screen.getByRole("dialog")).toBeInTheDocument();
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
      const host = container.querySelector(".graph-editor-container")!;
      vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
        left: 20,
        top: 35,
        width: 500,
        height: 200,
        right: 520,
        bottom: 235,
        x: 20,
        y: 35,
        toJSON: () => ({}),
      });
      fireEvent.contextMenu(dot!, { clientX: 250, clientY: 175 });

      const dialog = screen.getByRole("dialog") as HTMLElement;
      expect(dialog.style.left).toBe("230px");
      expect(dialog.style.top).toBe("140px");
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

    it("ベジェ出力ハンドル (cp1) を pointermove で動かすと updateKeyframe(cp1x, cp1y) が呼ばれる", () => {
      const clip = createAnimationClip({
        id: "clip-bz",
        name: "Bezier",
        duration: 61,
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

      // A 600px by 120px plot makes the drag's expected normalized delta explicit.
      Object.defineProperties(container.querySelector(".graph-editor-container")!, {
        clientWidth: { configurable: true, value: 652 },
        clientHeight: { configurable: true, value: 156 },
      });
      const handles = container.querySelectorAll(".graph-handle");
      expect(handles.length).toBeGreaterThanOrEqual(1);
      const outHandle = handles[0] as SVGElement;

      fireEvent.pointerDown(outHandle, { pointerId: 2, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(outHandle.parentElement!, {
        pointerId: 2,
        clientX: 110,
        clientY: 35,
      });

      expect(spy.mock.calls.map((call) => call.slice(0, 4))).toEqual([
        ["clip-bz", "p1", 0, { cp1x: 0.35, cp1y: 0.25 }],
      ]);
    });

    it("ベジェ入力ハンドル (cp2) を pointermove で動かすと前のキーフレームの cp2x/cp2y が更新される", () => {
      const clip = createAnimationClip({
        id: "clip-bz-in",
        name: "BezierIn",
        duration: 61,
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

      // A 600px by 120px plot makes the drag's expected normalized delta explicit.
      Object.defineProperties(container.querySelector(".graph-editor-container")!, {
        clientWidth: { configurable: true, value: 652 },
        clientHeight: { configurable: true, value: 156 },
      });
      const handles = container.querySelectorAll(".graph-handle");
      expect(handles.length).toBeGreaterThanOrEqual(2);
      const inHandle = handles[1] as SVGElement;

      fireEvent.pointerDown(inHandle, { pointerId: 3, clientX: 200, clientY: 100 });
      fireEvent.pointerMove(inHandle.parentElement!, {
        pointerId: 3,
        clientX: 140,
        clientY: 115,
      });

      expect(spy.mock.calls.map((call) => call.slice(0, 4))).toEqual([
        ["clip-bz-in", "p1", 0, { cp2x: 0.65, cp2y: 0.75 }],
      ]);
    });

    it("描画幅がゼロの間にハンドルをドラッグしても不正な制御点を保存しない", () => {
      const clip = createAnimationClip({
        id: "clip-zero-seg",
        name: "ZeroSeg",
        duration: 61,
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
                frame: 60,
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

      const spy = vi.spyOn(useClipStore.getState(), "updateKeyframe");
      const { container } = render(<GraphEditor clip={clip} />);
      const handles = container.querySelectorAll(".graph-handle");
      expect(handles).toHaveLength(2);
      // Collapsing the panel leaves no plot width after the 40px/12px padding.
      Object.defineProperty(
        container.querySelector(".graph-editor-container")!,
        "clientWidth",
        {
          configurable: true,
          value: 52,
        },
      );
      for (const handle of handles) {
        fireEvent.pointerDown(handle, { pointerId: 4, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(handle.parentElement!, {
          pointerId: 4,
          clientX: 10,
          clientY: 10,
        });
        fireEvent.pointerUp(handle.parentElement!, { pointerId: 4 });
      }
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
