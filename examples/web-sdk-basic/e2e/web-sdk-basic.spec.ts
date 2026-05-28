import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const allowedOrigin = "http://127.0.0.1:5176";
const unsafeConsolePatterns = [
  /[A-Za-z]:\\Users\\/,
  /\/home\/[^/\s]+/,
  /api[_-]?key|access[_-]?token|bearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /profile"\s*:\s*"authoringProfile/i,
  /stack trace/i,
  /generated-avatar\.vivi\?/i,
];

test("web SDK basic sample exercises loading, lifecycle, inputs, and safe errors", async ({
  page,
}) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];

  await installUnhandledRejectionRecorder(page);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== allowedOrigin) {
      externalRequests.push(route.request().url());
    }
    await route.continue();
  });
  page.on("console", (message) => collectConsoleMessage(consoleMessages, message));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (url.origin !== allowedOrigin.replace("http:", "ws:")) {
      externalRequests.push(socket.url());
    }
  });

  await page.goto("/");
  await expect(page.getByText("Ready. Press Start")).toBeVisible();
  await expect(page.getByText("Vivi2D Web SDK Sample")).toBeVisible();

  await page.getByTestId("start-player").click();
  await expect(page.getByTestId("manual-update")).toBeDisabled();
  await page.getByTestId("stop-player").click();
  await expect(page.getByTestId("manual-update")).toBeEnabled();
  await page.getByTestId("manual-update").click();

  const slider = page.getByTestId("input-slider").first();
  if ((await slider.count()) > 0) {
    await slider.fill("0.5");
    await expect(page.getByText("Input value applied")).toBeVisible();
  }
  await page.getByTestId("apply-visible-inputs").click();
  await page.getByTestId("reset-inputs").click();

  await page.getByTestId("strict-inputs").check();
  await expect(page.getByText("Ready. Press Start")).toBeVisible();
  await expect(page.getByTestId("manual-update")).toBeEnabled();
  await page.getByTestId("unknown-input").click();
  await expect(page.getByTestId("error-output")).toContainText(
    "VIVI_WEB_UNKNOWN_INPUT",
  );
  await page.getByTestId("load-fixture").click();
  await expect(page.getByText("Ready. Press Start")).toBeVisible();

  await page.getByTestId("resize-small").click();
  await expect(page.locator("#vivi-canvas")).toHaveAttribute("width", "320");
  await page.getByTestId("resize-large").click();
  await expect(page.locator("#vivi-canvas")).toHaveAttribute("width", "640");

  await page.getByTestId("load-delayed").click();
  await page.getByTestId("cancel-load").click();
  await expect(page.locator("#status")).toHaveText("Load cancelled by the user.");
  await page.getByTestId("load-fixture").click();
  await expect(page.getByText("Ready. Press Start")).toBeVisible();

  await page.getByTestId("dispose-player").click();
  await expect(page.getByText("Player disposed")).toBeVisible();
  await page.getByTestId("reload-after-dispose").click();
  await expect(page.getByText("Ready. Press Start")).toBeVisible();

  await page.getByTestId("error-fetch").click();
  await expect(page.getByTestId("error-output")).toContainText(
    "VIVI_WEB_FETCH_FAILED",
  );
  await page.getByTestId("load-fixture").click();
  await expect(page.getByText("Ready. Press Start")).toBeVisible();

  const staleProbeStatus = await page.evaluate(async () => {
    return window.__viviWebSdkBasic?.runStaleLoadProbe();
  });
  expect(staleProbeStatus).toContain("Ready. Press Start");

  await assertNoUnhandledRejections(page);
  expect(pageErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
  for (const message of consoleMessages) {
    for (const pattern of unsafeConsolePatterns) {
      expect(message).not.toMatch(pattern);
    }
  }
});

async function installUnhandledRejectionRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const rejections: string[] = [];
    window.addEventListener("unhandledrejection", (event) => {
      rejections.push(String(event.reason));
    });
    Object.defineProperty(window, "__viviUnhandledRejections", {
      configurable: false,
      value: rejections,
    });
  });
}

async function assertNoUnhandledRejections(page: Page): Promise<void> {
  const rejections = await page.evaluate(() => {
    return (window as unknown as { __viviUnhandledRejections: string[] })
      .__viviUnhandledRejections;
  });
  expect(rejections).toEqual([]);
}

function collectConsoleMessage(messages: string[], message: ConsoleMessage): void {
  messages.push(`${message.type()}: ${message.text()}`);
}
