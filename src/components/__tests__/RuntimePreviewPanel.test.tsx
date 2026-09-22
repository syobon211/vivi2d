import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  RuntimeEvaluationPreview,
  RuntimePreviewResult,
} from "@/lib/runtime-evaluation-preview";
import { RuntimePreviewPanel } from "../RuntimePreviewPanel";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/runtime-evaluation-preview", () => ({
  createRuntimeEvaluationPreview: mocks.create,
}));
afterEach(() => mocks.create.mockReset());

const activated: RuntimePreviewResult = {
  ok: true,
  status: "activated",
  parameters: [
    { id: "parameter", min: -1, max: 1, default: 0, current: 0, evaluated: 0 },
  ],
  presets: ["expression"],
  generations: { model: "9007199254740993", topology: "1", dynamic: "0" },
};
function runtime() {
  return {
    load: vi.fn(async () => activated),
    setParameter: vi.fn(() => ({ ok: true, status: "updated" }) as RuntimePreviewResult),
    applyPreset: vi.fn(() => ({ ok: true, status: "updated" }) as RuntimePreviewResult),
    close: vi.fn(),
  } satisfies RuntimeEvaluationPreview;
}

it("disposes a late factory after Close without starting selection or resurrecting the panel", async () => {
  let finish!: (value: RuntimeEvaluationPreview) => void;
  mocks.create.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<RuntimePreviewPanel cellId={"a".repeat(64)} />);
  fireEvent.click(screen.getByText("runtimePreview.title"));
  await act(async () => {
    fireEvent.click(screen.getByText("runtimePreview.open"));
  });
  fireEvent.click(screen.getByText("runtimePreview.close"));
  expect(screen.getByText("runtimePreview.open")).toBeDisabled();
  const late = runtime();
  await act(async () => {
    finish(late);
  });
  expect(late.close).toHaveBeenCalledOnce();
  expect(late.load).not.toHaveBeenCalled();
  expect(screen.queryByText("runtimePreview.ready")).toBeNull();
  expect(screen.getByText("runtimePreview.open")).toBeEnabled();
});

it("keeps incumbent controls on failed reload, calls only explicit runtime edits, and closes on cell replacement", async () => {
  const preview = runtime();
  mocks.create.mockResolvedValue(preview);
  const view = render(<RuntimePreviewPanel key="a" cellId={"a".repeat(64)} />);
  fireEvent.click(screen.getByText("runtimePreview.title"));
  await act(async () => {
    fireEvent.click(screen.getByText("runtimePreview.open"));
  });
  expect(screen.getByText(/9007199254740993\/1\/0/)).toBeVisible();
  expect(preview.setParameter).not.toHaveBeenCalled();
  preview.setParameter.mockReturnValueOnce({
    ok: false,
    code: "native",
    parameters: [
      { id: "parameter", min: -1, max: 1, default: 0, current: 0.5, evaluated: 0 },
    ],
  });
  fireEvent.change(screen.getByRole("slider"), { target: { value: "0.5" } });
  expect(preview.setParameter).toHaveBeenCalledWith("parameter", 0.5);
  expect(screen.getByRole("slider")).toHaveValue("0.5");
  expect(screen.getByText("runtimePreview.failed")).toBeInTheDocument();
  fireEvent.click(screen.getByText("runtimePreview.preset expression"));
  expect(preview.applyPreset).toHaveBeenCalledWith("expression");
  preview.load.mockResolvedValueOnce({ ok: false, code: "native" });
  await act(async () => {
    fireEvent.click(screen.getByText("runtimePreview.reload"));
  });
  expect(screen.getByRole("slider")).toBeInTheDocument();
  expect(screen.getByText("runtimePreview.failed")).toBeInTheDocument();
  view.rerender(<RuntimePreviewPanel key="b" cellId={"b".repeat(64)} />);
  expect(preview.close).toHaveBeenCalledOnce();
  expect(screen.queryByRole("slider")).toBeNull();
});

it("warns after committed cleanup or presentation failure without claiming Ready or discarding controls", async () => {
  const preview = runtime();
  preview.load.mockResolvedValueOnce({ ...activated, cleanupFailed: true });
  mocks.create.mockResolvedValue(preview);
  render(<RuntimePreviewPanel cellId={"a".repeat(64)} />);
  fireEvent.click(screen.getByText("runtimePreview.title"));
  await act(async () => {
    fireEvent.click(screen.getByText("runtimePreview.open"));
  });
  expect(screen.getByText("runtimePreview.warning")).toBeVisible();
  expect(screen.queryByText("runtimePreview.ready")).toBeNull();
  expect(screen.getByRole("slider")).toHaveValue("0");
  expect(screen.getByText(/9007199254740993\/1\/0/)).toBeVisible();
  expect(screen.getByText("runtimePreview.reload")).toBeEnabled();
  expect(preview.close).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByText("runtimePreview.reload"));
  });
  expect(screen.getByText("runtimePreview.ready")).toBeVisible();
  expect(screen.queryByText("runtimePreview.warning")).toBeNull();
});
