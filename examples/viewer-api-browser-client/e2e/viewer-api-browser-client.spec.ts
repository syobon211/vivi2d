import { expect, test } from "@playwright/test";
import { type WebSocket, WebSocketServer } from "ws";
import { viewerApiBrowserSamplePort } from "../playwright.config";

const SAMPLE_TOKEN = "sample-session-token";
const APP_ORIGIN = `http://127.0.0.1:${viewerApiBrowserSamplePort}`;

test("browser sample pairs, reads state, and clears the session token safely", async ({
  page,
}) => {
  const server = await startMockViewerApiServer();
  const unsafeConsoleMessages: string[] = [];
  const pageErrors: string[] = [];
  const unexpectedRequests: string[] = [];
  const unexpectedSockets: string[] = [];

  await page.addInitScript(() => {
    const rejections: string[] = [];
    window.addEventListener("unhandledrejection", (event) => {
      rejections.push(String(event.reason));
    });
    Object.defineProperty(window, "__viviUnhandledRejections", {
      value: rejections,
    });
  });

  page.on("console", (message) => {
    const text = message.text();
    if (containsUnsafeDiagnostic(text)) unsafeConsoleMessages.push(text);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("websocket", (socket) => {
    const url = socket.url();
    if (!isAllowedSocketUrl(url, server.endpoint)) unexpectedSockets.push(url);
  });
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!isAllowedHttpUrl(url)) unexpectedRequests.push(url);
    return route.continue();
  });

  try {
    await page.goto("/");
    await expect(page.getByTestId("viewer-api-status")).toHaveText("Idle.");
    await expect(page.getByTestId("viewer-api-pair")).toBeDisabled();
    await expect(page.getByTestId("viewer-api-state")).toBeDisabled();

    await page.getByTestId("viewer-api-endpoint").fill(server.endpoint);
    await page.getByTestId("viewer-api-connect").click();
    await expect(page.getByTestId("viewer-api-status")).toHaveText(
      "Connected. Pair this browser Origin from Vivi2D.",
    );
    await expect(page.getByTestId("viewer-api-pair")).toBeEnabled();

    await page.getByTestId("viewer-api-pair").click();
    await expect(page.getByTestId("viewer-api-status")).toHaveText(
      "Paired and authenticated.",
    );
    await expect(page.getByTestId("viewer-api-state")).toBeEnabled();
    await expect(page.getByTestId("viewer-api-log")).toContainText("123456");
    await expect(page.getByTestId("viewer-api-log")).toContainText(APP_ORIGIN);
    await expect(page.getByTestId("viewer-api-log")).not.toContainText(SAMPLE_TOKEN);

    await page.getByTestId("viewer-api-state").click();
    await expect(page.getByTestId("viewer-api-log")).toContainText(
      "viewer.state.get response",
    );
    await expect(page.getByTestId("viewer-api-log")).toContainText("modelLoaded");

    await page.getByTestId("viewer-api-clear-token").click();
    await expect(page.getByTestId("viewer-api-status")).toHaveText(
      "Session token cleared.",
    );
    await expect(page.getByTestId("viewer-api-state")).toBeDisabled();

    const sessionStorageValues = await page.evaluate(() =>
      Object.values(sessionStorage),
    );
    expect(sessionStorageValues.join("\n")).not.toContain(SAMPLE_TOKEN);

    const unhandledRejections = await page.evaluate(
      () => (window as unknown as { __viviUnhandledRejections: string[] })
        .__viviUnhandledRejections,
    );
    expect(unhandledRejections).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(unsafeConsoleMessages).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
    expect(unexpectedSockets).toEqual([]);
    expect(server.receivedTypes).toEqual([
      "viewer.api.capabilities.get",
      "viewer.auth.challenge",
      "viewer.auth.authenticate",
      "viewer.api.capabilities.get",
      "viewer.state.get",
    ]);
  } finally {
    await server.close();
  }
});

function isAllowedHttpUrl(url: string) {
  return url.startsWith(`${APP_ORIGIN}/`);
}

function isAllowedSocketUrl(url: string, viewerApiEndpoint: string) {
  return (
    url.replace(/\/$/, "") === viewerApiEndpoint ||
    url.startsWith(`ws://127.0.0.1:${viewerApiBrowserSamplePort}/`)
  );
}

function containsUnsafeDiagnostic(text: string) {
  return (
    text.includes(SAMPLE_TOKEN) ||
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(text) ||
    /[A-Za-z]:[\\/]+Users[\\/]+[^\\/]+[\\/]/.test(text)
  );
}

async function startMockViewerApiServer() {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const sockets = new Set<WebSocket>();
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock Viewer API server did not expose a TCP port.");
  }
  const endpoint = `ws://127.0.0.1:${address.port}`;
  const receivedTypes: string[] = [];

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as {
        id?: string;
        type?: string;
        data?: Record<string, unknown>;
      };
      if (!message.id || typeof message.type !== "string") return;
      receivedTypes.push(message.type);

      if (message.type === "viewer.api.capabilities.get") {
        socket.send(response(message.id, "viewer.api.capabilities.get.result", {
          capabilities: capabilities(message.data?.token === SAMPLE_TOKEN),
        }));
      } else if (message.type === "viewer.auth.challenge") {
        socket.send(response(message.id, "viewer.auth.challenge.result", {
          phase: "pending",
          challengeId: "sample-challenge",
          code: "123456",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }));
        socket.send(response(message.id, "viewer.auth.challenge.completed", {
          phase: "completed",
          token: SAMPLE_TOKEN,
          grantId: "sample-grant",
          fingerprint: "sample-fingerprint",
          scopes: ["read:state"],
          tokenPersistence: "session",
        }));
      } else if (message.type === "viewer.auth.authenticate") {
        socket.send(response(message.id, "viewer.auth.authenticate.result", {
          grantId: "sample-grant",
          fingerprint: "sample-fingerprint",
          scopes: ["read:state"],
          tokenPersistence: "session",
        }));
      } else if (message.type === "viewer.state.get") {
        socket.send(response(message.id, "viewer.state.get.result", {
          viewer: { modelLoaded: false },
          session: { apiEnabled: true },
        }));
      } else {
        socket.send(
          JSON.stringify({
            api: "ViviViewerApi",
            version: "0.preview",
            id: message.id,
            type: `${message.type}.result`,
            ok: false,
            error: {
              code: "unsupported",
              message: "Unsupported mock request.",
              retryable: false,
            },
          }),
        );
      }
    });
  });

  return {
    endpoint,
    receivedTypes,
    close: () => {
      for (const socket of sockets) socket.terminate();
      return new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function response(id: string, type: string, data: Record<string, unknown>) {
  return JSON.stringify({
    api: "ViviViewerApi",
    version: "0.preview",
    id,
    type,
    ok: true,
    data,
  });
}

function capabilities(authenticated: boolean) {
  return {
    api: "ViviViewerApi",
    version: "0.preview",
    stability: "preview",
    authMethods: ["pairing", "token"],
    pairingOpen: true,
    scopeMetadata: [{ scope: "read:state", surface: "core", risk: "low" }],
    core: {
      scopes: [{ scope: "read:state", surface: "core", risk: "low" }],
      requestTypes: [
        {
          name: "viewer.api.capabilities.get",
          surface: "core",
          authRequired: false,
        },
        {
          name: "viewer.auth.challenge",
          surface: "core",
          authRequired: false,
        },
        {
          name: "viewer.auth.authenticate",
          surface: "core",
          authRequired: false,
        },
        {
          name: "viewer.state.get",
          surface: "core",
          scopeMode: "static",
          requiredScopes: [["read:state"]],
        },
      ],
      eventTypes: [],
    },
    extensions: { requestTypes: [], eventTypes: [], scopes: [] },
    limits: {
      maxWebSocketTextFrameBytes: 65_536,
      maxRequestPayloadBytes: 49_152,
    },
    closeCodes: { grantRevoked: 4403 },
    availability: { authenticated },
  };
}
