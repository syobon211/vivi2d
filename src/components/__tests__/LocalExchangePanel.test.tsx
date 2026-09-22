import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ResultView } from "@/lib/local-exchange-provider";
import { LocalExchangePanel } from "../LocalExchangePanel";

const mocks = vi.hoisted(() => ({ exchange: vi.fn(), approve: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/local-exchange-provider", () => ({
  exchange: mocks.exchange,
  runLocalJob: vi.fn(),
}));
vi.mock("@/lib/local-exchange-staging", () => ({
  approveExchangeProposal: mocks.approve,
  captureExchangeConsent: () => "captured-consent",
  openExchangeCandidate: vi.fn(),
}));
vi.mock("@/stores/editorStore", () => ({
  useEditorStore: { getState: () => ({ project: null }) },
}));
vi.mock("@/lib/texture-store", () => ({ getAllTextures: () => new Map() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.exchange.mockReset();
  mocks.approve.mockReset();
});

it("keeps job, artifacts, selection and approval bound to B when A's result arrives last", async () => {
  let finishA!: (result: ResultView) => void, finishB!: (result: ResultView) => void;
  const a = new Promise<ResultView>((resolve) => {
    finishA = resolve;
  });
  const b = new Promise<ResultView>((resolve) => {
    finishB = resolve;
  });
  const cells = ["job-A", "job-B"].map((cellId) => ({
    cellId,
    kind: "job",
    selection: null,
    state: { phase: "succeeded", attempt: 1, stateVersion: 2 },
  }));
  mocks.exchange.mockImplementation(async (command) => {
    if (command.action === "list") return { cells, frozenCellIds: [] };
    if (command.action === "result") return command.cellId === "job-A" ? a : b;
    throw new Error("Unexpected command");
  });
  mocks.approve.mockResolvedValue(undefined);
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  render(
    <LocalExchangePanel endpoint="http://127.0.0.1:8188" prompt="test" parameters={{}} />,
  );
  await screen.findByRole("option", { name: "job-B · succeeded" });
  const selector = screen.getByLabelText("localExchange.job");
  fireEvent.change(selector, { target: { value: "job-A" } });
  fireEvent.change(selector, { target: { value: "job-B" } });
  await act(async () => {
    finishB({ artifacts: [{ id: "shared", kind: "layerImage" }] } as ResultView);
  });
  const selected = await screen.findByLabelText("shared · layerImage");
  fireEvent.click(selected);
  await act(async () => {
    finishA({ artifacts: [{ id: "shared", kind: "manifest" }] } as ResultView);
  });
  expect(selector).toHaveValue("job-B");
  expect(screen.queryByLabelText("shared · manifest")).toBeNull();
  expect(screen.getByLabelText("shared · layerImage")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "localExchange.approve" }));
  await waitFor(() =>
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(
      "job-B",
      ["shared"],
      "captured-consent",
    ),
  );
});
