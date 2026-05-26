import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { PanelErrorBoundary } from "../PanelErrorBoundary";

function ThrowingChild({ message }: { message: string }): React.ReactNode {
  throw new Error(message);
}

function GoodChild() {
  return <div data-testid="good">正常</div>;
}

describe("PanelErrorBoundary", () => {
  afterEach(() => {
    useI18nStore.getState().setLocale("ja");
  });

  it("エラーがないときは子がそのまま描画される", () => {
    render(
      <PanelErrorBoundary panelName="TestPanel">
        <GoodChild />
      </PanelErrorBoundary>,
    );
    expect(screen.getByTestId("good")).toBeInTheDocument();
  });

  it("子が throw するとパネルスコープの alert が表示され、panelName が載る", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PanelErrorBoundary panelName="TestPanel">
        <ThrowingChild message="落ちた" />
      </PanelErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.getAttribute("data-panel-name")).toBe("TestPanel");
    expect(screen.getByText(/TestPanel/)).toBeInTheDocument();
    expect(screen.getByText("落ちた")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("再試行ボタンでエラー状態が解除される", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    function Controlled() {
      if (shouldThrow) throw new Error("再試行");
      return <div data-testid="recovered">OK</div>;
    }
    render(
      <PanelErrorBoundary panelName="TestPanel">
        <Controlled />
      </PanelErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(screen.getByTestId("recovered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("onError コールバックに error/errorId/info が渡される", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    render(
      <PanelErrorBoundary panelName="CB" onError={onError}>
        <ThrowingChild message="cb" />
      </PanelErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    const [err, id, info] = onError.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("cb");
    expect(typeof id).toBe("string");
    expect((id as string).length).toBeGreaterThan(4);
    expect(info).toBeDefined();
    spy.mockRestore();
  });

  it("英語ロケールで panelTitle が英訳される", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    useI18nStore.getState().setLocale("en");
    render(
      <PanelErrorBoundary panelName="EnPanel">
        <ThrowingChild message="en" />
      </PanelErrorBoundary>,
    );
    expect(screen.getByText(/Panel error:/)).toBeInTheDocument();
    expect(screen.getByText(/EnPanel/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it("エラーIDが表示される", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PanelErrorBoundary panelName="IdPanel">
        <ThrowingChild message="id" />
      </PanelErrorBoundary>,
    );
    const codes = document.querySelectorAll("code");
    const hasId = Array.from(codes).some((c) => (c.textContent ?? "").length > 4);
    expect(hasId).toBe(true);
    spy.mockRestore();
  });

  it("一方のパネルが落ちても他方は生きる（スコープ分離の確認）", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <div>
        <PanelErrorBoundary panelName="A">
          <ThrowingChild message="A fail" />
        </PanelErrorBoundary>
        <PanelErrorBoundary panelName="B">
          <GoodChild />
        </PanelErrorBoundary>
      </div>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("good")).toBeInTheDocument();
    spy.mockRestore();
  });
});
