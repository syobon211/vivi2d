import { afterEach, describe, expect, it, vi } from "vitest";
import { createViviWebPlayer, loadViviWebModel, ViviWebError, type ViviWebPlayer } from "@vivi2d/web";
import { collectSampleElements, ViviWebSdkBasicDemo } from "../src/sdk-demo";

vi.mock("@vivi2d/web", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vivi2d/web")>()),
  createViviWebPlayer: vi.fn(),
  loadViviWebModel: vi.fn(),
}));

const buttons = [
  "load-fixture", "load-delayed", "cancel-load", "reload-model", "start-player",
  "stop-player", "manual-update", "resize-small", "resize-large", "dispose-player",
  "reload-after-dispose", "apply-visible-inputs", "reset-inputs", "unknown-input",
  "error-fetch", "error-invalid-source", "error-validation", "error-parse",
  "error-invalid-input", "error-invalid-resize", "error-disposed",
  "error-source-shortcut-abort",
];

function setup() {
  document.body.replaceChildren();
  for (const [tag, id] of [
    ["canvas", "vivi-canvas"], ["div", "status"], ["div", "metadata-summary"],
    ["div", "parameter-controls"], ["output", "error-output"],
  ] as const) {
    const element = document.createElement(tag);
    element.id = id;
    document.body.append(element);
  }
  const fileInput = document.createElement("input");
  fileInput.id = "file-input";
  fileInput.type = "file";
  const strictInputs = document.createElement("input");
  strictInputs.dataset.testid = "strict-inputs";
  strictInputs.type = "checkbox";
  document.body.append(fileInput, strictInputs);
  for (const id of buttons) {
    const button = document.createElement("button");
    button.dataset.testid = id;
    document.body.append(button);
  }
  vi.mocked(loadViviWebModel).mockResolvedValue({
    metadata: { name: "Fixture", width: 1, height: 1, parameterCount: 0, expressionPresetCount: 0 },
  } as Awaited<ReturnType<typeof loadViviWebModel>>);
  return new ViviWebSdkBasicDemo(collectSampleElements());
}

function player() {
  return { dispose: vi.fn(), getParameters: () => [], running: false } as unknown as ViviWebPlayer;
}

afterEach(() => {
  window.dispatchEvent(new Event("beforeunload"));
  vi.resetAllMocks();
  document.body.replaceChildren();
});

describe("sample canvas replacement", () => {
  it.each(["cancel", "dispose"])(
    "ignores a stale abort event after %s and drains a rejected creation before reload",
    async (action) => {
      const demo = setup();
      let rejectCreation!: (error: Error) => void;
      vi.mocked(createViviWebPlayer)
        .mockImplementationOnce(() => new Promise((_, reject) => { rejectCreation = reject; }))
        .mockResolvedValueOnce(player());
      const firstLoad = demo.mount();
      await vi.waitFor(() => expect(createViviWebPlayer).toHaveBeenCalledTimes(1));
      const request = vi.mocked(createViviWebPlayer).mock.calls[0]![0];
      document.querySelector<HTMLButtonElement>(
        `[data-testid="${action === "cancel" ? "cancel-load" : "dispose-player"}"]`,
      )!.click();
      expect(request.signal?.aborted).toBe(true);
      const status = demo.getTestHooks().getStatusText();
      const aborted = new ViviWebError("VIVI_WEB_ABORTED", "Synthetic aborted creation.");
      request.onEvent?.({ type: "error", error: aborted });
      rejectCreation(aborted);
      await firstLoad;
      expect(demo.getTestHooks().getStatusText()).toBe(status);
      document.querySelector<HTMLButtonElement>('[data-testid="load-fixture"]')!.click();
      await vi.waitFor(() => expect(createViviWebPlayer).toHaveBeenCalledTimes(2));
      expect(demo.getTestHooks().getStatusText()).toContain("Ready. Press Start");
    },
  );

  it.each(["replace", "cancel", "dispose"])(
    "drains an in-flight player after %s before reusing its canvas",
    async (action) => {
      const demo = setup();
      const firstPlayer = player();
      const nextPlayer = player();
      let complete!: (value: ViviWebPlayer) => void;
      vi.mocked(createViviWebPlayer)
        .mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }))
        .mockImplementationOnce(async () => {
          expect(firstPlayer.dispose).toHaveBeenCalledOnce();
          return nextPlayer;
        });
      const firstLoad = demo.mount();
      await vi.waitFor(() => expect(createViviWebPlayer).toHaveBeenCalledTimes(1));
      if (action !== "replace") {
        document.querySelector<HTMLButtonElement>(
          `[data-testid="${action === "cancel" ? "cancel-load" : "dispose-player"}"]`,
        )!.click();
      }
      document.querySelector<HTMLButtonElement>('[data-testid="load-fixture"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(createViviWebPlayer).toHaveBeenCalledTimes(1);
      complete(firstPlayer);
      await firstLoad;
      await vi.waitFor(() => expect(createViviWebPlayer).toHaveBeenCalledTimes(2));
      expect(firstPlayer.dispose).toHaveBeenCalledOnce();
      expect(nextPlayer.dispose).not.toHaveBeenCalled();
      expect(demo.getTestHooks().getStatusText()).toContain("Ready. Press Start");
    },
  );
});
