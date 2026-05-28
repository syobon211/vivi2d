import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { ErrorBoundary } from "../ErrorBoundary";

function ThrowingChild({ message }: { message: string }): React.ReactNode {
  throw new Error(message);
}

function GoodChild() {
  return <div>healthy child</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("ja");
  });

  afterEach(() => {
    useI18nStore.getState().setLocale("ja");
  });

  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText("healthy child")).toBeInTheDocument();
  });

  it("shows the Japanese fallback UI when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild message="日本語エラー" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("予期しないエラーが発生しました")).toBeInTheDocument();
    expect(
      screen.getByText("アプリケーションでエラーが発生しました。"),
    ).toBeInTheDocument();
    expect(screen.getByText("日本語エラー")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeInTheDocument();

    spy.mockRestore();
  });

  it("hides the normal child output after an error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild message="boom" />
      </ErrorBoundary>,
    );

    expect(screen.queryByText("healthy child")).not.toBeInTheDocument();

    spy.mockRestore();
  });

  it("supports English locale overrides", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    useI18nStore.getState().setLocale("en");

    render(
      <ErrorBoundary>
        <ThrowingChild message="i18n error" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("An unexpected error occurred")).toBeInTheDocument();
    expect(screen.getByText("The application encountered an error.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText("Error ID:")).toBeInTheDocument();
    expect(screen.queryByText("予期しないエラーが発生しました")).not.toBeInTheDocument();

    spy.mockRestore();
  });

  it("shows an error ID when an error is captured", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild message="error id check" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("エラー ID:")).toBeInTheDocument();
    const codes = document.querySelectorAll("code");
    const hasId = Array.from(codes).some((item) =>
      /^[0-9a-f-]{8,}$/.test(item.textContent ?? ""),
    );
    expect(hasId).toBe(true);

    spy.mockRestore();
  });

  it("passes the error, errorId, and component info to onError", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingChild message="callback error" />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const call = onError.mock.calls[0]!;
    expect(call[0]).toBeInstanceOf(Error);
    expect((call[0] as Error).message).toBe("callback error");
    expect(typeof call[1]).toBe("string");
    expect((call[1] as string).length).toBeGreaterThan(4);
    expect(call[2]).toBeDefined();

    spy.mockRestore();
  });

  it("falls back to a generated err-* ID when crypto.randomUUID is unavailable", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const originalRandomUUID = globalThis.crypto?.randomUUID;

    if (globalThis.crypto) {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: undefined,
        configurable: true,
        writable: true,
      });
    }

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingChild message="fallback id" />
      </ErrorBoundary>,
    );

    expect(onError.mock.calls[0]?.[1]).toMatch(/^err-/);

    if (globalThis.crypto) {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: originalRandomUUID,
        configurable: true,
        writable: true,
      });
    }

    spy.mockRestore();
  });

  it("recovers when Try again is clicked and the child stops throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;

    function ControlledChild() {
      if (shouldThrow) {
        throw new Error("recoverable");
      }
      return <div data-testid="recovered">recovered</div>;
    }

    render(
      <ErrorBoundary>
        <ControlledChild />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));

    expect(screen.getByTestId("recovered")).toBeInTheDocument();
    expect(screen.queryByText("予期しないエラーが発生しました")).not.toBeInTheDocument();

    spy.mockRestore();
  });

  it("exposes an assertive alert region", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild message="alert test" />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveAttribute("aria-labelledby", "vivi2d-error-title");
    expect(document.getElementById("vivi2d-error-title")).not.toBeNull();

    spy.mockRestore();
  });

  it("uses CSS variables in the fallback UI styles", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild message="css vars" />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    const styleText = [
      alert.getAttribute("style") ?? "",
      ...Array.from(alert.querySelectorAll("*")).map(
        (el) => el.getAttribute("style") ?? "",
      ),
    ].join(" | ");
    expect(styleText).toMatch(/var\(--/);

    spy.mockRestore();
  });
});
