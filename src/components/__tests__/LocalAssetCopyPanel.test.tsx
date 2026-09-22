import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LocalAssetCopyResponse } from "@/lib/local-asset-copy";
import type { ExchangeCellView } from "@/lib/local-exchange-provider";
import { LocalAssetCopyPanel } from "../LocalAssetCopyPanel";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
const originalAPI = window.electronAPI;
const candidate = {
  copyId: "123e4567-e89b-42d3-a456-426614174000",
  documentId: "123e4567-e89b-42d3-a456-426614174001",
  compatibility: "full" as const,
  canonicalSha256: "d".repeat(64),
  atlasCount: 1,
};
const cells = ["a", "b"].map((letter) => ({
  cellId: letter.repeat(64),
  kind: "sync",
  replicaId: letter,
  documentId: candidate.documentId,
})) as ExchangeCellView[];
afterEach(() => {
  window.electronAPI = originalAPI;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function select() {
  fireEvent.click(screen.getByText("localAssetCopy.title"));
  fireEvent.change(screen.getByLabelText("localAssetCopy.source"), {
    target: { value: cells[0]!.cellId },
  });
  fireEvent.change(screen.getByLabelText("localAssetCopy.receiver"), {
    target: { value: cells[1]!.cellId },
  });
}

// Controlled IPC replies exercise UI ownership/consent only, not an accepted
// C2 consumer, Project codec, native operation or actual successful copy.
it("cancels a late prepared candidate after unmount and does not queue duplicate prepares", async () => {
  let finish!: (value: LocalAssetCopyResponse) => void;
  const invoke = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ ok: true, value: null });
  window.electronAPI = { ...originalAPI, localAssetCopy: invoke };
  const view = render(<LocalAssetCopyPanel cells={cells} />);
  select();
  const prepare = screen.getByRole("button", { name: "localAssetCopy.prepare" });
  fireEvent.click(prepare);
  fireEvent.click(prepare);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith({
    operation: "prepare",
    sourceCellId: cells[0]!.cellId,
    receiverCellId: cells[1]!.cellId,
  });
  view.unmount();
  await act(async () => finish({ ok: true, value: candidate }));
  expect(invoke).toHaveBeenLastCalledWith({
    operation: "cancel",
    copyId: candidate.copyId,
  });
});

it("requires explicit approval and never displays a raw delivery error or a false committed result", async () => {
  const invoke = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, value: candidate })
    .mockRejectedValueOnce(new Error("private-path-canary"))
    .mockResolvedValue({ ok: true, value: null });
  const consent = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  window.electronAPI = { ...originalAPI, localAssetCopy: invoke };
  vi.stubGlobal("confirm", consent);
  const view = render(<LocalAssetCopyPanel cells={cells} />);
  select();
  fireEvent.click(screen.getByRole("button", { name: "localAssetCopy.prepare" }));
  const commit = await screen.findByRole("button", { name: "localAssetCopy.commit" });
  await waitFor(() => expect(commit).not.toBeDisabled());
  fireEvent.click(commit);
  expect(invoke).toHaveBeenCalledTimes(1);
  fireEvent.click(commit);
  await screen.findByText("localAssetCopy.ambiguous");
  expect(invoke).toHaveBeenLastCalledWith({
    operation: "commit",
    copyId: candidate.copyId,
  });
  expect(screen.queryByText(/private-path-canary|localAssetCopy.committed/)).toBeNull();
  view.unmount();
});
