import { expect, test, type Page } from "@playwright/test";
import { WebSocket } from "ws";
import {
  createViviViewerClient,
  type ViviViewerClient,
} from "@vivi2d/viewer-api-client/node";
import { openSideSheet, setViewerLocale, withViewer } from "../support/viewer-page";

function makePngBuffer(width = 1, height = 1): Buffer {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return Buffer.from(bytes);
}


test("Viewer API external client can pair, manage props, consume file-picker assets, and revoke", async () => {
    await withViewer(async ({ page }) => {
    await setViewerLocale(page, "en");
    await openSideSheet(page, "connect");

    await page.getByRole("button", { name: "Enable Local API" }).click();
    const status = await waitForViewerApiEnabled(page);
    const endpoint = readEndpoint(status);
    expect(endpoint).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);

    await page.getByRole("button", { name: "Pair new client" }).click();
    const sdk = createSdkClient(endpoint, {
      appName: "Vivi2D E2E Native Client",
      scopes: ["read:state", "read:props", "write:props"],
    });
    await sdk.client.connect();
    const code = await pairClientFromUi(page, sdk.client);
    expect(code).toMatch(/^[0-9]{6}$/);

    await sdk.client.events.subscribe({
      mode: "replace",
      events: [
        { name: "viewer.prop.added" },
        { name: "viewer.prop.updated" },
        { name: "viewer.prop.removed" },
      ],
    });

    const pngBase64 = makePngBuffer().toString("base64");
    const propAdded = waitForSdkEvent(sdk.client, "viewer.prop.added");
    const loaded = await sdk.client.request<Record<string, unknown>>("viewer.prop.load", {
      name: "Inline E2E Badge",
      source: {
        kind: "inlineBase64",
        mimeType: "image/png",
        bytes: pngBase64,
      },
      transform: { x: 8, y: 12, opacity: 0.75 },
    });
    const prop = readRecord(loaded, "prop");
    const propId = readString(prop, "id");
    await propAdded;

    const propUpdated = waitForSdkEvent(sdk.client, "viewer.prop.updated");
    await sdk.client.request("viewer.prop.update", {
      propId,
      transform: { x: 20, rotation: 15, opacity: 0.5 },
    });
    await propUpdated;

    const listed = await sdk.client.props.list();
    expect(JSON.stringify(listed)).not.toContain(pngBase64);

    const propRemoved = waitForSdkEvent(sdk.client, "viewer.prop.removed");
    await sdk.client.request("viewer.prop.remove", { propId });
    await propRemoved;

    await openSideSheet(page, "overlays");
    await page
      .locator('input[aria-label="Issue API asset handle"]')
      .setInputFiles({
        name: "shared-badge.png",
        mimeType: "image/png",
        buffer: makePngBuffer(),
      });
    const assetId = await page
      .locator('[data-testid="viewer-api-prop-asset-id"]')
      .first()
      .textContent();
    expect(assetId).toMatch(/^vpa_/);
    if (!assetId) throw new Error("Expected file-picker asset ID");

    const assetLoaded = await sdk.client.request<Record<string, unknown>>("viewer.prop.load", {
      name: "File Picker E2E Badge",
      source: {
        kind: "filePickerAsset",
        assetId,
        mimeType: "image/png",
        bytes: 33,
      },
    });
    expect(assetLoaded).toMatchObject({ prop: { id: expect.any(String) } });

    await expect(
      sdk.client.request("viewer.prop.load", {
      name: "Replay Attempt",
      source: {
        kind: "filePickerAsset",
        assetId,
        mimeType: "image/png",
        bytes: 33,
      },
      }),
    ).rejects.toMatchObject({ code: "asset_unavailable" });

    await openSideSheet(page, "connect");
    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      sdk.socket.once("close", (closeCode, reason) =>
        resolve({ code: closeCode, reason: reason.toString("utf8") }),
      );
    });
    await page
      .locator('[data-testid="viewer-api-grant-row"]', {
        hasText: "Vivi2D E2E Native Client",
      })
      .getByRole("button", { name: /^Revoke$/ })
      .click();
    await expect(page.locator('[data-testid="viewer-api-grant-row"]')).toHaveCount(0);
    const closed = await withTimeout(closePromise, 10_000, "grant revoke did not close client");
    expect(closed).toEqual({ code: 4403, reason: "grant_revoked" });

    sdk.client.disconnect();
  });
});

test("Viewer API browser-origin client is bound to its approved Origin", async () => {
  await withViewer(async ({ page }) => {
    await setViewerLocale(page, "en");
    await openSideSheet(page, "connect");

    await page.getByRole("button", { name: "Enable Local API" }).click();
    const status = await waitForViewerApiEnabled(page);
    const endpoint = readEndpoint(status);
    const origin = "http://browser-client.test";

    await page.evaluate((allowedOrigin) => {
      const apiWindow = window as Window & {
        viviAPI?: {
          viewerApi?: {
            openPairingWindow?: (payload: {
              durationMs?: number;
              origins?: string[];
            }) => Promise<unknown>;
          };
        };
      };
      return apiWindow.viviAPI?.viewerApi?.openPairingWindow?.({
        durationMs: 90_000,
        origins: [allowedOrigin],
      });
    }, origin);

    const sdk = createSdkClient(endpoint, {
      origin,
      appName: "Vivi2D E2E Browser Client",
      scopes: ["read:state"],
    });
    await sdk.client.connect();
    await pairClientFromUi(page, sdk.client);

    await expect(sdk.client.request("viewer.prop.load", {
      name: "Denied",
      source: {
        kind: "inlineBase64",
        mimeType: "image/png",
        bytes: makePngBuffer().toString("base64"),
      },
    })).rejects.toMatchObject({ code: "scope_denied" });

    await expect(
      createSdkClient(endpoint, { origin: "http://wrong.test" }).client.connect(),
    ).rejects.toThrow();

    sdk.client.disconnect();
  });
});

function createSdkClient(
  endpoint: string,
  options: {
    appName?: string;
    origin?: string;
    scopes?: string[];
  } = {},
) {
  let socket: WebSocket | null = null;
  const client = createViviViewerClient({
    endpoint,
    appName: options.appName ?? "Vivi2D E2E SDK Client",
    scopes: options.scopes ?? ["read:state"],
    webSocketFactory: (url) => {
      socket = new WebSocket(url, {
        origin: options.origin,
        perMessageDeflate: false,
      });
      return socket;
    },
  });
  return {
    client,
    get socket() {
      if (!socket) throw new Error("SDK WebSocket has not been created");
      return socket;
    },
  };
}

async function pairClientFromUi(page: Page, client: ViviViewerClient) {
  let resolveCode: (code: string) => void = () => {};
  const codePromise = new Promise<string>((resolve) => {
    resolveCode = resolve;
  });
  const pairPromise = client.pair({
    onChallenge(challenge) {
      resolveCode(challenge.code);
    },
  });
  const code = await codePromise;
  const pairingCard = page.locator('[data-testid="viewer-api-pairing-card"]');
  await expect(pairingCard).toBeVisible();
  await pairingCard.locator("input").fill(code);
  await pairingCard.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(code)).toHaveCount(0);
  await expect(pairPromise).resolves.toMatchObject({ grantId: expect.any(String) });
  return code;
}

function waitForSdkEvent(client: ViviViewerClient, type: string) {
  return withTimeout(
    new Promise<unknown>((resolve) => {
      const unsubscribe = client.onEvent((message) => {
        if (message.type === type) {
          unsubscribe();
          resolve(message);
        }
      });
    }),
    10_000,
    `Timed out waiting for Viewer API event ${type}`,
  );
}

async function waitForViewerApiEnabled(page: Page) {
  await page.waitForFunction(
    () => {
      const apiWindow = window as Window & {
        viviAPI?: {
          viewerApi?: {
            getStatus?: () => Promise<unknown>;
          };
        };
      };
      return apiWindow.viviAPI?.viewerApi?.getStatus?.().then((status) => {
        return Boolean((status as { enabled?: unknown } | undefined)?.enabled);
      });
    },
    undefined,
    { timeout: 10_000 },
  );
  return (await page.evaluate(() => {
    const apiWindow = window as Window & {
      viviAPI?: {
        viewerApi?: {
          getStatus?: () => Promise<unknown>;
        };
      };
    };
    return apiWindow.viviAPI?.viewerApi?.getStatus?.();
  })) as Record<string, unknown>;
}

function readEndpoint(status: Record<string, unknown>): string {
  if (typeof status.endpoint === "string") return status.endpoint;
  if (typeof status.port === "number") return `ws://127.0.0.1:${status.port}`;
  throw new Error("Viewer API status did not include an endpoint");
}

function readRecord(value: unknown, key?: string): Record<string, unknown> {
  const target = key ? (value as Record<string, unknown> | undefined)?.[key] : value;
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw new Error(`Expected record${key ? ` at ${key}` : ""}`);
  }
  return target as Record<string, unknown>;
}

function readString(value: unknown, key: string): string {
  const record = readRecord(value, undefined);
  const result = record[key];
  if (typeof result !== "string") throw new Error(`Expected string at ${key}`);
  return result;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
