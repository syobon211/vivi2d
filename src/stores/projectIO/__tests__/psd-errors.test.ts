import type { ProjectData } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  parseAsync: vi.fn(),
  notify: vi.fn(),
  apply: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/lib/psd-loader", () => ({ parsePsd: mocks.parse }));
vi.mock("@/lib/workers/psd-parse-client", () => ({ parsePsdAsync: mocks.parseAsync }));
vi.mock("@/lib/e2e-perf-probe", () => ({
  startE2EPerfProbe: mocks.start,
  cancelE2EPerfProbe: mocks.cancel,
}));
vi.mock("../../notificationStore", () => ({
  useNotificationStore: { getState: () => ({ addNotification: mocks.notify }) },
}));
vi.mock("../reset", () => ({ applyLoadedProject: mocks.apply }));
vi.mock("../seeThroughImport", () => ({
  applySeeThroughImportContext: (project: ProjectData) => ({ project }),
}));

import { t } from "@/lib/i18n";
import { loadPsd, loadPsdFromBuffer, loadPsdFromBufferAsync } from "../psd";

describe("PSD import error boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parse.mockReset();
    mocks.parseAsync.mockReset();
  });
  it("redacts arbitrary decoder errors in all import entry points without applying a project", async () => {
    const buffer = new ArrayBuffer(8);
    const inspect = vi.fn(() => {
      throw new Error("inspection must not happen");
    });
    const accessorError = new Error();
    Object.defineProperty(accessorError, "message", { get: inspect });
    for (const thrown of [
      new Error("C:/synthetic-secret/token-canary.psd"),
      "token-canary",
      accessorError,
      { toString: inspect },
    ]) {
      vi.mocked(window.electronAPI.openPsdFile).mockResolvedValue({
        buffer,
        fileName: "safe.psd",
      });
      mocks.parse.mockImplementationOnce(() => {
        throw thrown;
      });
      mocks.parseAsync.mockRejectedValueOnce(thrown).mockRejectedValueOnce(thrown);
      expect(loadPsdFromBuffer(buffer, "safe.psd")).toBe(false);
      expect(await loadPsdFromBufferAsync(buffer, "safe.psd")).toBe(false);
      expect(await loadPsd()).toBe(false);
    }
    expect(mocks.notify).toHaveBeenCalledTimes(12);
    for (const args of mocks.notify.mock.calls)
      expect(args).toEqual(["error", t("notify.psdLoadFailed")]);
    expect(inspect).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("redacts file dialog rejection and keeps cancellation quiet", async () => {
    vi.mocked(window.electronAPI.openPsdFile).mockRejectedValueOnce(
      new Error("C:/synthetic-secret/token-canary.psd"),
    );
    expect(await loadPsd()).toBe(false);
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(
      "error",
      t("notify.psdLoadFailed"),
    );
    mocks.notify.mockClear();
    mocks.parseAsync.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
    expect(await loadPsdFromBufferAsync(new ArrayBuffer(8), "safe.psd")).toBe(false);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("keeps successful async texture commit before project application", async () => {
    const project = {
      name: "safe",
      width: 1,
      height: 1,
      layers: [],
    } as unknown as ProjectData;
    const commit = vi.fn();
    mocks.parseAsync.mockResolvedValueOnce({ project, commitTextures: commit });
    expect(await loadPsdFromBufferAsync(new ArrayBuffer(8), "safe.psd")).toBe(true);
    expect(commit).toHaveBeenCalledOnce();
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith(project, null, "psd");
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.apply.mock.invocationCallOrder[0]!,
    );
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
