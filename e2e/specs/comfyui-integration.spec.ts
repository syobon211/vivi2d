import { createServer } from "node:http";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

const MOCK_COMPAT_PATHS = [
  "/system_stats",
  "/object_info/ViviSeeThroughDecompose",
  "/object_info/ViviSeeThroughExportPSD",
] as const;

type MockCompatServer = {
  baseUrl: string;
  close: () => Promise<void>;
  requests: string[];
};

async function startMockCompatServer(): Promise<MockCompatServer> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push(`${requestUrl.pathname}${requestUrl.search}`);

    let body: unknown;
    if (
      request.method === "GET" &&
      requestUrl.pathname === "/system_stats" &&
      requestUrl.search === ""
    ) {
      body = { system: { os: "e2e-mock" }, devices: [] };
    } else if (
      request.method === "GET" &&
      requestUrl.pathname === "/object_info/ViviSeeThroughDecompose" &&
      requestUrl.search === ""
    ) {
      body = {
        ViviSeeThroughDecompose: {
          input: {
            required: {
              schema_version: ["STRING", { default: "1.0.0" }],
              capability: ["STRING", { default: "vivi2d.seethrough.v1" }],
              plugin_version: ["STRING", { default: "0.1.0" }],
            },
          },
        },
      };
    } else if (
      request.method === "GET" &&
      requestUrl.pathname === "/object_info/ViviSeeThroughExportPSD" &&
      requestUrl.search === ""
    ) {
      body = { ViviSeeThroughExportPSD: { input: { required: {} } } };
    } else {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end('{"error":"unexpected mock request"}');
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("ComfyUI E2E mock did not bind a TCP port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function openIntegrationsMenu(window: Page) {
  const trigger = window.locator(".menu-dropdown-trigger").nth(3);
  const panel = window.locator(".menu-dropdown-panel");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(panel).toBeVisible();
}

async function openGenerateModelDialog(window: Page) {
  await openIntegrationsMenu(window);
  await window.locator(".menu-dropdown-panel .menu-dropdown-item").first().click();
}

async function openComfyUISettingsDialog(window: Page) {
  await openIntegrationsMenu(window);
  await window.locator(".menu-dropdown-panel .menu-dropdown-item").nth(1).click();
}

test("integrations menu trigger is visible", async ({ window }) => {
  await expect(window.locator(".menu-dropdown-trigger").nth(3)).toBeVisible();
});

test("integrations menu shows only implemented ComfyUI integrations", async ({
  window,
}) => {
  await openIntegrationsMenu(window);

  await expect(
    window.locator(".menu-dropdown-section", { hasText: "ComfyUI" }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-section", { hasText: "OBS Studio" }),
  ).toHaveCount(0);
  await expect(
    window.locator(".menu-dropdown-section", { hasText: "VTube Studio" }),
  ).toHaveCount(0);
  await expect(
    window.locator(".menu-dropdown-panel .menu-dropdown-item").first(),
  ).toBeVisible();

  await window.keyboard.press("Escape");
});

test("AI generate dialog opens from the integrations menu", async ({ window }) => {
  await openGenerateModelDialog(window);

  await expect(window.locator(".modal-title")).toBeVisible();
  await expect(window.locator(".ai-gen-tab")).toHaveCount(2);
  await expect(window.locator(".ai-gen-notice").first()).toBeVisible();

  await window.locator(".modal-actions .prop-btn").last().click();
  await expect(window.locator(".modal-title")).not.toBeVisible();
});

test("ComfyUI settings dialog opens", async ({ window }) => {
  await openComfyUISettingsDialog(window);

  await expect(window.locator(".modal-title", { hasText: /ComfyUI/ })).toBeVisible();
  await expect(window.locator('input[value="http://127.0.0.1:8188"]')).toBeVisible();

  await window.locator(".prop-btn").last().click();
  await expect(window.locator(".modal-title")).not.toBeVisible();
});

test("ComfyUI settings test connection shows the Vivi2D compat report", async ({
  window,
}) => {
  const mock = await startMockCompatServer();
  try {
    await openComfyUISettingsDialog(window);

    await expect(window.locator(".modal-title", { hasText: /ComfyUI/ })).toBeVisible();

    await window.locator(".ai-gen-input").fill(mock.baseUrl);
    await window.locator(".prop-btn").first().click();

    await expect
      .poll(() =>
        window.evaluate(() => {
          const runtime = window.__vivi2d as any;
          const state = runtime.useComfyUIStore.getState();
          return {
            connected: state.connected,
            compatStatus: state.compatStatus,
            compatBaseUrl: state.compatBaseUrl,
            compatCapability: state.compatCapability,
            compatPluginVersion: state.compatPluginVersion,
            compatManifestSchema: state.compatManifestSchema,
            compatHasDecomposeNode: state.compatHasDecomposeNode,
            compatHasExportNode: state.compatHasExportNode,
          };
        }),
      )
      .toEqual({
        connected: true,
        compatStatus: "ready",
        compatBaseUrl: mock.baseUrl,
        compatCapability: "vivi2d.seethrough.v1",
        compatPluginVersion: "0.1.0",
        compatManifestSchema: "1.0.0",
        compatHasDecomposeNode: true,
        compatHasExportNode: true,
      });

    await expect(window.locator(".ai-gen-notice", { hasText: /1\.0\.0/ })).toBeVisible();
    await expect(window.locator(".ai-gen-notice", { hasText: /0\.1\.0/ })).toBeVisible();
    await expect(
      window.locator(".ai-gen-notice", { hasText: /vivi2d\.seethrough\.v1/ }),
    ).toBeVisible();
    await expect(
      window.locator(".ai-gen-notice", {
        hasText:
          /Compat.*(decompose|\u5206\u89e3)\s*(OK|\u3042\u308a).*(export|\u66f8\u304d\u51fa\u3057)\s*(OK|\u3042\u308a)/i,
      }),
    ).toBeVisible();

    expect([...mock.requests].sort()).toEqual([...MOCK_COMPAT_PATHS].sort());

    await window.locator(".prop-btn").last().click();
    await expect(window.locator(".modal-title")).not.toBeVisible();
  } finally {
    await mock.close();
  }
});

test("AI generate dialog exposes prompt mode controls", async ({ window }) => {
  await openGenerateModelDialog(window);

  await window.locator(".ai-gen-tab").nth(1).click();
  await expect(window.locator(".ai-gen-textarea").first()).toBeVisible();
  await expect(window.locator(".ai-gen-param").first()).toBeVisible();

  await window.locator(".prop-btn").last().click();
});

test("Blender (.glb) export is visible after loading a PSD", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await window.locator(".menu-dropdown-trigger").first().click();
  await expect(
    window.locator(".menu-dropdown-item", { hasText: /Blender.*\.glb/ }),
  ).toBeVisible();

  await window.keyboard.press("Escape");
});

test("Auto Setup is visible after loading a PSD", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  await window.locator(".menu-dropdown-trigger").first().click();
  await expect(
    window.locator(".menu-dropdown-item", {
      hasText: /Auto Setup|自動セットアップ/,
    }),
  ).toBeVisible();

  await window.keyboard.press("Escape");
});
