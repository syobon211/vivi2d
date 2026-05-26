import {
  type RenderOptions,
  type RenderResult,
  render,
  waitFor,
} from "@testing-library/react";
import { type ReactElement, Suspense } from "react";


interface RenderWithSuspenseOptions extends Omit<RenderOptions, "wrapper"> {
  fallback?: ReactElement;
}

const DEFAULT_FALLBACK_TESTID = "suspense-fallback";

export function renderWithSuspense(
  ui: ReactElement,
  options: RenderWithSuspenseOptions = {},
): RenderResult {
  const { fallback, ...renderOptions } = options;
  return render(
    <Suspense fallback={fallback ?? <div data-testid={DEFAULT_FALLBACK_TESTID} />}>
      {ui}
    </Suspense>,
    renderOptions,
  );
}

export async function waitForSuspenseToResolve(
  fallbackTestId: string = DEFAULT_FALLBACK_TESTID,
): Promise<void> {
  await waitFor(() => {
    if (document.querySelector(`[data-testid="${fallbackTestId}"]`)) {
      throw new Error("Suspense fallback still present");
    }
  });
}
