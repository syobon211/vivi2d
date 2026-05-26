import { screen } from "@testing-library/react";
import { lazy, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import {
  renderWithSuspense,
  waitForSuspenseToResolve,
} from "@/test/render-with-suspense";


function SyncGreeting() {
  return <div data-testid="greeting">こんにちは</div>;
}

const LazyGreeting = lazy(() =>
  Promise.resolve<{ default: () => ReactElement }>({
    default: function LazyGreetingComponent() {
      return <div data-testid="lazy-greeting">遅延こんにちは</div>;
    },
  }),
);

const SlowLazy = lazy(
  () =>
    new Promise<{ default: () => ReactElement }>((resolve) => {
      setTimeout(
        () =>
          resolve({
            default: () => <div data-testid="slow-resolved">解決済</div>,
          }),
        50,
      );
    }),
);

describe("renderWithSuspense", () => {
  it("同期 children を即時に描画する", () => {
    renderWithSuspense(<SyncGreeting />);
    expect(screen.getByTestId("greeting")).toHaveTextContent("こんにちは");
  });

  it("lazy children は Promise resolve 後に描画される", async () => {
    renderWithSuspense(<LazyGreeting />);
    await waitForSuspenseToResolve();
    expect(screen.getByTestId("lazy-greeting")).toHaveTextContent("遅延こんにちは");
  });

  it("カスタム fallback を渡せる", async () => {
    renderWithSuspense(<SlowLazy />, {
      fallback: <div data-testid="custom-fallback">読み込み中…</div>,
    });
    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
    await waitForSuspenseToResolve("custom-fallback");
    expect(screen.getByTestId("slow-resolved")).toBeInTheDocument();
  });
});
