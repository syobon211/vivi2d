import { describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WebSocket } = require("ws");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const schema = require("../../electron/viewer-api-schema.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverModule = require("../../electron/viewer-api-server.cjs");

const {
  makeResponse,
  parseViewerApiMessage,
  requiredScopesForMessage,
  VIVI_VIEWER_API_NAME,
  VIVI_VIEWER_API_VERSION,
} = schema;
const {
  MAX_AUTH_ATTEMPTS_PER_MINUTE,
  MAX_GRANTS,
  MAX_PAIRING_CHALLENGES_PER_WINDOW,
  MAX_WRITE_REQUESTS_PER_SECOND,
  VIEWER_API_HTTP_HEADERS_TIMEOUT_MS,
  VIEWER_API_HTTP_REQUEST_TIMEOUT_MS,
  createViewerApiServer,
  isLoopbackHostHeader,
  normalizeOrigin,
} = serverModule;

function envelope(type: string, data: Record<string, unknown> = {}) {
  return {
    api: VIVI_VIEWER_API_NAME,
    version: VIVI_VIEWER_API_VERSION,
    id: `id-${Math.random()}`,
    type,
    data,
  };
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function makePngBase64(width = 1, height = 1, extraChunks: string[] = []): string {
  const chunkBytes = extraChunks.length * 12;
  const bytes = new Uint8Array(33 + chunkBytes);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  let offset = 33;
  for (const chunk of extraChunks) {
    view.setUint32(offset, 0, false);
    bytes.set(
      [...chunk].map((char) => char.charCodeAt(0)),
      offset + 4,
    );
    offset += 12;
  }
  return base64(bytes);
}

function makeJpegBase64(width = 1, height = 1): string {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  bytes[7] = (height >> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (width >> 8) & 0xff;
  bytes[10] = width & 0xff;
  return base64(bytes);
}

function makeWebpBase64({
  width = 1,
  height = 1,
  flags = 0,
  extraChunk,
}: {
  width?: number;
  height?: number;
  flags?: number;
  extraChunk?: string;
} = {}): string {
  const extraBytes = extraChunk ? 8 : 0;
  const bytes = new Uint8Array(30 + extraBytes);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  view.setUint32(16, 10, true);
  bytes[20] = flags;
  const storedWidth = width - 1;
  const storedHeight = height - 1;
  bytes[24] = storedWidth & 0xff;
  bytes[25] = (storedWidth >> 8) & 0xff;
  bytes[26] = (storedWidth >> 16) & 0xff;
  bytes[27] = storedHeight & 0xff;
  bytes[28] = (storedHeight >> 8) & 0xff;
  bytes[29] = (storedHeight >> 16) & 0xff;
  if (extraChunk) {
    bytes.set(
      [...extraChunk].map((char) => char.charCodeAt(0)),
      30,
    );
    view.setUint32(34, 0, true);
  }
  return base64(bytes);
}

function waitForOpen(ws: typeof WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function waitForMessage(ws: typeof WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once("message", (raw: Buffer) => {
      resolve(JSON.parse(raw.toString("utf8")));
    });
  });
}

function errorCode(message: Record<string, unknown>): string | undefined {
  const error = message.error as Record<string, unknown> | undefined;
  return typeof error?.code === "string" ? error.code : undefined;
}

function expectErrorCode(message: Record<string, unknown>, code: string): void {
  expect(message.error).toMatchObject({
    code,
    message: expect.any(String),
    retryable: expect.any(Boolean),
  });
}

async function openClient(
  server: Record<string, any>,
  options: Record<string, unknown> = {},
) {
  const port = server.server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
    perMessageDeflate: false,
    ...options,
  });
  await waitForOpen(ws);
  return ws;
}

async function approveTestGrant(server: Record<string, any>, scopes: string[]) {
  server.openPairingWindow(10_000);
  const ws = await openClient(server);
  ws.send(
    JSON.stringify(
      envelope("viewer.auth.challenge", {
        appName: "test client",
        scopes,
      }),
    ),
  );
  const challengeResponse = await waitForMessage(ws);
  const challenge = challengeResponse.data as Record<string, string>;
  const tokenMessagePromise = waitForMessage(ws);
  const approved = server.approveChallenge(challenge.challengeId, challenge.code);
  const tokenMessage = await tokenMessagePromise;
  return { ws, approved, tokenMessage };
}

describe("viewer-api-schema.cjs", () => {
  it("parses the Vivi-owned preview envelope", () => {
    const parsed = parseViewerApiMessage(JSON.stringify(envelope("viewer.state.get")));

    expect(parsed.api).toBe("ViviViewerApi");
    expect(parsed.version).toBe(VIVI_VIEWER_API_VERSION);
  });

  it("accepts the previous experimental envelope during the preview transition", () => {
    const parsed = parseViewerApiMessage(
      JSON.stringify({
        ...envelope("viewer.state.get"),
        version: "0.experimental",
      }),
    );

    expect(parsed.version).toBe("0.experimental");
  });

  it("accepts bounded static prop load requests", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            name: "Badge",
            visible: false,
            groupId: "badges",
            transform: { x: 10, y: 20, opacity: 0.75 },
            anchor: { kind: "screen" },
            source: {
              kind: "inlineBase64",
              mimeType: "image/png",
              bytes: makePngBase64(),
            },
          }),
        ),
      ),
    ).not.toThrow();

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/jpeg",
              bytes: makeJpegBase64(),
            },
          }),
        ),
      ),
    ).not.toThrow();

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/webp",
              bytes: makeWebpBase64(),
            },
          }),
        ),
      ),
    ).not.toThrow();
  });

  it("accepts path-free file-picker asset handles for prop loading", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            name: "Shared Badge",
            source: {
              kind: "filePickerAsset",
              assetId: "vpa_fixtureHandle",
              mimeType: "image/png",
              bytes: 33,
            },
          }),
        ),
      ),
    ).not.toThrow();

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "filePickerAsset",
              assetId: "vpa_gif",
              mimeType: "image/gif",
              bytes: 33,
            },
          }),
        ),
      ),
    ).toThrow("unsupported file-picker prop MIME type");
  });

  it("rejects unsupported prop sources and oversized inline props", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: { kind: "localPath", path: "C:/secret.png" },
          }),
        ),
      ),
    ).toThrow("unsupported prop source kind");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/png",
              bytes: "A".repeat(800 * 1024),
            },
          }),
        ),
      ),
    ).toThrow("message exceeds byte limit");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/png",
              bytes: "not base64!",
            },
          }),
        ),
      ),
    ).toThrow("inline prop bytes must be base64");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/png",
              bytes: "AAAA",
            },
          }),
        ),
      ),
    ).toThrow("inline prop image header could not be inspected");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/png",
              bytes: "",
            },
          }),
        ),
      ),
    ).toThrow("data.source.bytes must be a non-empty string");
  });

  it("rejects animated or oversized public prop image headers", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/png",
              bytes: makePngBase64(1, 1, ["acTL"]),
            },
          }),
        ),
      ),
    ).toThrow("animated PNG props are not supported");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/webp",
              bytes: makeWebpBase64({ flags: 0x02 }),
            },
          }),
        ),
      ),
    ).toThrow("animated WebP props are not supported");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/webp",
              bytes: makeWebpBase64({ extraChunk: "ANIM" }),
            },
          }),
        ),
      ),
    ).toThrow("animated WebP props are not supported");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/png",
              bytes: makePngBase64(4097, 1),
            },
          }),
        ),
      ),
    ).toThrow("inline prop image dimensions exceed limit");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/png",
              bytes: makePngBase64(4096, 4096),
            },
          }),
        ),
      ),
    ).toThrow("inline prop decoded pixel buffer exceeds limit");
  });

  it("accepts bounded prop update and group-cycle requests", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.update", {
            propId: "hat",
            visible: true,
            groupId: "faces",
            transform: { x: 10, scaleX: 1.2, opacity: 0.5 },
            anchor: { kind: "modelRoot" },
          }),
        ),
      ),
    ).not.toThrow();

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.group.cycle", {
            groupId: "faces",
            direction: "previous",
          }),
        ),
      ),
    ).not.toThrow();

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.update", {
            propId: "hat",
            transform: { scaleX: 0 },
          }),
        ),
      ),
    ).toThrow("data.transform.scaleX out of range");
  });

  it("validates calibration payloads at the API boundary", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(envelope("viewer.calibration.set", { profileId: "balanced" })),
      ),
    ).toThrow("calibration.set requires profile or profiles");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.calibration.set", {
            profileId: "balanced",
            profile: {
              version: 1,
              id: "bad",
              name: "Bad",
              channels: {
                "face.mouthOpen": {
                  enabled: true,
                  inputMin: 1,
                  inputMax: 1,
                  outputMin: 0,
                  outputMax: 1,
                  neutral: 0,
                  deadzone: 0,
                  smoothing: 0,
                  invert: false,
                  curve: "linear",
                },
              },
            },
          }),
        ),
      ),
    ).toThrow("input range must be increasing");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.calibration.set", {
            profile: {
              version: 1,
              id: "bad-range",
              name: "Bad Range",
              channels: {
                "face.mouthOpen": {
                  enabled: true,
                  inputMin: -101,
                  inputMax: 1,
                  outputMin: 0,
                  outputMax: 1,
                  neutral: 0,
                  deadzone: 0,
                  smoothing: 0,
                  invert: false,
                  curve: "linear",
                },
              },
            },
          }),
        ),
      ),
    ).toThrow("inputMin out of range");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.calibration.set", {
            profile: {
              version: 1,
              id: "one",
              name: "One",
              channels: {},
            },
            profiles: [],
          }),
        ),
      ),
    ).toThrow("profile and profiles are mutually exclusive");

    expect(() =>
      parseViewerApiMessage(
        `{"api":"${VIVI_VIEWER_API_NAME}","version":"${VIVI_VIEWER_API_VERSION}","id":"bad","type":"viewer.calibration.set","data":{"profiles":[{"version":1,"id":"bad","name":"Bad","channels":{"__proto__":{"enabled":true,"inputMin":0,"inputMax":1,"outputMin":0,"outputMax":1,"neutral":0,"deadzone":0,"smoothing":0,"invert":false,"curve":"linear"}}}]}}`,
      ),
    ).toThrow("channelId is reserved");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.calibration.profile.apply", {
            profileId: "balanced",
            profiles: [],
          }),
        ),
      ),
    ).toThrow("data.profiles is not allowed");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.calibration.profile.apply", {
            profileId: "__proto__",
          }),
        ),
      ),
    ).toThrow("data.profileId is reserved");
  });

  it("rejects out-of-range transforms and unknown data fields", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(envelope("viewer.model.transform", { scale: -1 })),
      ),
    ).toThrow("data.scale out of range");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.signals.set", {
            values: { ParamX: 1 },
            unexpected: true,
          }),
        ),
      ),
    ).toThrow("data.unexpected is not allowed");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(envelope("viewer.state.get", { unexpected: true })),
      ),
    ).toThrow("data.unexpected is not allowed");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.prop.load", {
            source: {
              kind: "inlineBase64",
              mimeType: "image/png",
              bytes: "AAAA",
              absolutePath: "C:/Users/User/secret.png",
            },
          }),
        ),
      ),
    ).toThrow("data.source.absolutePath is not allowed");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.calibration.set", {
            profile: {
              version: 1,
              id: "bad-output",
              name: "Bad Output",
              channels: {
                "face.mouthOpen": {
                  enabled: true,
                  inputMin: 0,
                  inputMax: 1,
                  outputMin: 1,
                  outputMax: 1,
                  neutral: 0,
                  deadzone: 0,
                  smoothing: 0,
                  invert: false,
                  curve: "linear",
                },
              },
            },
          }),
        ),
      ),
    ).toThrow("output range must be increasing");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.calibration.set", {
            profile: {
              version: 1,
              id: "unknown-channel-key",
              name: "Unknown Channel Key",
              channels: {
                "face.mouthOpen": {
                  enabled: true,
                  inputMin: 0,
                  inputMax: 1,
                  outputMin: 0,
                  outputMax: 1,
                  neutral: 0,
                  deadzone: 0,
                  smoothing: 0,
                  invert: false,
                  curve: "linear",
                  rawDelta: 1,
                },
              },
            },
          }),
        ),
      ),
    ).toThrow("rawDelta is not allowed");
  });

  it("validates event subscription requests", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.events.subscribe", {
            mode: "replace",
            events: [{ name: "viewer.action.completed" }],
          }),
        ),
      ),
    ).not.toThrow();

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.events.subscribe", {
            events: [{ name: "viewer.unknown" }],
          }),
        ),
      ),
    ).toThrow("unknown event name");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.events.subscribe", {
            events: [
              {
                name: "viewer.signals.changed",
                filter: { minIntervalMs: 1 },
              },
            ],
          }),
        ),
      ),
    ).toThrow("event.filter.minIntervalMs");
  });

  it("maps messages to narrow scopes", () => {
    expect(requiredScopesForMessage(envelope("viewer.signals.set"))).toEqual([
      "write:signals",
    ]);
    expect(
      requiredScopesForMessage(
        envelope("viewer.expression.apply", {
          presetId: "smile",
        }),
      ),
    ).toEqual(["write:signals"]);
    expect(
      requiredScopesForMessage(
        envelope("viewer.model.transform", {
          x: 1,
        }),
      ),
    ).toEqual(["run:actions:safe"]);
    expect(
      requiredScopesForMessage(
        envelope("viewer.action.run", {
          actionId: "pulse",
          actionKind: "signalPulse",
        }),
      ),
    ).toEqual(["write:signals"]);
    expect(
      requiredScopesForMessage(
        envelope("viewer.action.run", {
          actionId: "calibrate",
          actionKind: "calibrationProfileApply",
        }),
      ),
    ).toEqual(["write:calibration"]);
    expect(
      requiredScopesForMessage(
        envelope("viewer.action.run", {
          actionId: "move-prop",
          actionKind: "propTransform",
        }),
      ),
    ).toEqual(["write:props"]);
  });

  it("keeps event subscription messages schema-bound", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.events.subscribe", {
            events: [{ name: "viewer.signals.changed" }],
          }),
        ),
      ),
    ).not.toThrow();

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.events.subscribe", {
            events: ["viewer.signals.changed"],
          }),
        ),
      ),
    ).toThrow("event must be an object");
  });

  it("rejects removed standalone scene preset actions", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.action.run", {
            actionId: "scene",
            actionKind: "scenePreset",
          }),
        ),
      ),
    ).toThrow("unsupported action kind");
  });

  it("creates Vivi-owned responses", () => {
    expect(makeResponse("1", "viewer.state.result", true, { ok: 1 })).toMatchObject({
      api: "ViviViewerApi",
      version: VIVI_VIEWER_API_VERSION,
      id: "1",
      ok: true,
    });
    expect(
      makeResponse(
        "2",
        "viewer.error",
        false,
        {},
        { code: "invalid_request", details: { field: "data.token", value: "secret" } },
      ),
    ).toMatchObject({
      error: {
        code: "invalid_request",
        message: "invalid request",
        retryable: false,
        details: { field: "data.token" },
      },
    });
    expect(
      JSON.stringify(
        makeResponse("3", "viewer.error", false, {}, new Error("C:/secret")),
      ),
    ).not.toContain("C:/secret");
    expect(
      makeResponse(
        "4",
        "viewer.prop.load.result",
        false,
        {},
        {
          code: "asset_unavailable",
          details: { reason: "wrong_origin" },
        },
      ),
    ).toMatchObject({
      error: {
        code: "asset_unavailable",
        details: { reason: "unauthorized" },
      },
    });
    expect(
      makeResponse(
        "5",
        "viewer.prop.load.result",
        false,
        {},
        {
          code: "asset_unavailable",
          details: { reason: "expired" },
        },
      ),
    ).toMatchObject({
      error: {
        code: "asset_unavailable",
        details: { reason: "expired" },
      },
    });
  });
});

describe("viewer-api-server.cjs", () => {
  it("configures explicit HTTP timeouts for slow upgrade attempts", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });

    await server.start({ port: 0 });

    expect(server.server.headersTimeout).toBe(VIEWER_API_HTTP_HEADERS_TIMEOUT_MS);
    expect(server.server.requestTimeout).toBe(VIEWER_API_HTTP_REQUEST_TIMEOUT_MS);
    expect(server.server.timeout).toBe(0);

    await server.stop();
  });

  it("accepts loopback literal hosts only", () => {
    expect(isLoopbackHostHeader("127.0.0.1:37145")).toBe(true);
    expect(isLoopbackHostHeader("[::1]:37145")).toBe(false);
    expect(isLoopbackHostHeader("[::1]:37145", { allowIpv6Loopback: true })).toBe(true);
    expect(isLoopbackHostHeader("::1", { allowIpv6Loopback: true })).toBe(false);
    expect(isLoopbackHostHeader("localhost:37145")).toBe(false);
    expect(isLoopbackHostHeader("evil.test:37145")).toBe(false);
  });

  it("normalizes browser origins", () => {
    expect(normalizeOrigin("http://example.test/path")).toBe("http://example.test");
    expect(normalizeOrigin("file:///tmp/a.html")).toBeNull();
  });

  it("requires a user-opened pairing window before issuing challenges", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const port = server.server.address().port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      perMessageDeflate: false,
    });
    await waitForOpen(ws);

    ws.send(
      JSON.stringify(
        envelope("viewer.auth.challenge", {
          appName: "test client",
          scopes: ["read:state"],
        }),
      ),
    );
    const response = await waitForMessage(ws);

    expect(response.ok).toBe(false);
    expectErrorCode(response, "pairing_required");
    ws.close();
    await server.stop();
  });

  it("can approve a challenge and authenticate the issued token", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    server.openPairingWindow(10_000);
    const port = server.server.address().port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      perMessageDeflate: false,
    });
    await waitForOpen(ws);

    ws.send(
      JSON.stringify(
        envelope("viewer.auth.challenge", {
          appName: "test client",
          scopes: ["read:state"],
        }),
      ),
    );
    const challengeResponse = await waitForMessage(ws);
    expect(challengeResponse.ok).toBe(true);
    const challenge = challengeResponse.data as Record<string, string>;

    const tokenMessagePromise = waitForMessage(ws);
    server.approveChallenge(challenge.challengeId, challenge.code);
    const tokenMessage = await tokenMessagePromise;
    const authToken = (tokenMessage.data as Record<string, string>).token;

    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    const authResponse = await waitForMessage(ws);

    expect(authResponse.ok).toBe(true);
    expect(authResponse.data).toMatchObject({
      grantId: expect.any(String),
      fingerprint: expect.any(String),
      scopes: ["read:state"],
      tokenPersistence: "session",
    });
    ws.close();
    await server.stop();
  });

  it("allows pre-auth clients to read only a minimal capabilities banner", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const ws = await openClient(server);

    ws.send(JSON.stringify(envelope("viewer.api.capabilities.get")));
    const response = await waitForMessage(ws);

    expect(response.ok).toBe(true);
    expect(response.data).toMatchObject({
      capabilities: {
        api: "ViviViewerApi",
        version: VIVI_VIEWER_API_VERSION,
        authMethods: ["pairing-token"],
      },
    });
    const capabilities = (response.data as { capabilities: Record<string, unknown> })
      .capabilities;
    expect(capabilities).not.toHaveProperty("requestTypes");
    ws.close();
    await server.stop();
  });

  it("keeps flat capabilities for experimental clients during the preview transition", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const ws = await openClient(server);

    ws.send(
      JSON.stringify({
        ...envelope("viewer.api.capabilities.get"),
        version: "0.experimental",
      }),
    );
    const response = await waitForMessage(ws);

    expect(response.version).toBe("0.experimental");
    expect(response.data).toMatchObject({
      capabilities: {
        version: "0.experimental",
      },
    });
    expect((response.data as any).capabilities).not.toHaveProperty("requestTypes");
    const authenticated = server.getCapabilities({
      authenticated: true,
      version: "0.experimental",
    });
    expect(authenticated.requestTypes).toEqual(
      expect.arrayContaining(["viewer.state.get", "viewer.events.subscribe"]),
    );
    expect(authenticated).not.toHaveProperty("core");
    ws.close();
    await server.stop();
  });

  it("rejects version switches on an already-negotiated socket", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const ws = await openClient(server);

    ws.send(JSON.stringify(envelope("viewer.api.capabilities.get")));
    await waitForMessage(ws);
    ws.send(
      JSON.stringify({
        ...envelope("viewer.api.capabilities.get"),
        version: "0.experimental",
      }),
    );
    const rejected = await waitForMessage(ws);

    expect(rejected).toMatchObject({
      version: VIVI_VIEWER_API_VERSION,
      type: "viewer.error",
      ok: false,
    });
    expectErrorCode(rejected, "invalid_request");
    ws.close();
    await server.stop();
  });

  it("uses request result failures for preview schema-known bad payloads", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const ws = await openClient(server);

    ws.send(JSON.stringify(envelope("viewer.prop.load")));
    const response = await waitForMessage(ws);

    expect(response).toMatchObject({
      type: "viewer.prop.load.result",
      ok: false,
    });
    expectErrorCode(response, "invalid_request");
    ws.close();
    await server.stop();
  });

  it("omits oversized request ids from malformed preview errors", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const ws = await openClient(server);

    ws.send(
      JSON.stringify({
        ...envelope("viewer.state.get"),
        id: "x".repeat(129),
      }),
    );
    const response = await waitForMessage(ws);

    expect(response).not.toHaveProperty("id");
    expect(response.type).toBe("viewer.error");
    expectErrorCode(response, "invalid_request");
    ws.close();
    await server.stop();
  });

  it("returns payload_too_large for syntactically valid oversized preview requests", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const ws = await openClient(server);

    ws.send(
      JSON.stringify({
        ...envelope("viewer.prop.load"),
        data: {
          name: "x".repeat(50 * 1024),
          source: { kind: "inlineBase64", mimeType: "image/png", bytes: "AAAA" },
        },
      }),
    );
    const response = await waitForMessage(ws);

    expect(response).toMatchObject({
      type: "viewer.prop.load.result",
      ok: false,
      error: { code: "payload_too_large" },
    });
    ws.close();
    await server.stop();
  });

  it("advertises only implemented renderer-backed request handlers", () => {
    const server = createViewerApiServer({
      handlers: {
        "viewer.props.list": vi.fn(),
        "viewer.prop.update": vi.fn(),
        "viewer.prop.remove": vi.fn(),
        "viewer.prop.group.cycle": vi.fn(),
      },
    });

    const capabilities = server.getCapabilities({ authenticated: true });

    expect(
      capabilities.core.requestTypes.map((request: { name: string }) => request.name),
    ).toEqual(
      expect.arrayContaining([
        "viewer.state.get",
        "viewer.props.list",
        "viewer.prop.update",
        "viewer.prop.remove",
        "viewer.prop.group.cycle",
      ]),
    );
    expect(
      capabilities.core.requestTypes.map((request: { name: string }) => request.name),
    ).not.toContain("viewer.prop.load");
    expect(
      capabilities.extensions.requestTypes.map(
        (request: { name: string }) => request.name,
      ),
    ).not.toContain("viewer.calibration.set");

    const loadCapableServer = createViewerApiServer({
      handlers: {
        "viewer.prop.load": vi.fn(),
      },
    });
    expect(
      loadCapableServer
        .getCapabilities({ authenticated: true })
        .core.requestTypes.map((request: { name: string }) => request.name),
    ).toContain("viewer.prop.load");
  });

  it("advertises auth-required no-scope requests without empty scope alternatives", () => {
    const server = createViewerApiServer();
    const capabilities = server.getCapabilities({ authenticated: true });
    const requestTypes = [
      ...capabilities.core.requestTypes,
      ...capabilities.extensions.requestTypes,
    ] as Array<{
      name: string;
      authRequired?: boolean;
      requiredScopes?: string[][];
    }>;
    const authFreeRequests = new Set([
      "viewer.api.capabilities.get",
      "viewer.auth.challenge",
      "viewer.auth.authenticate",
    ]);

    for (const request of requestTypes) {
      const hasEmptyAlternative = request.requiredScopes?.some(
        (alternative) => alternative.length === 0,
      );
      if (authFreeRequests.has(request.name)) {
        expect(hasEmptyAlternative).toBe(true);
      } else {
        expect(hasEmptyAlternative).not.toBe(true);
      }
    }
    expect(
      requestTypes.find((request) => request.name === "viewer.events.list"),
    ).toMatchObject({ authRequired: true });
    expect(
      requestTypes.find((request) => request.name === "viewer.events.unsubscribe"),
    ).toMatchObject({ authRequired: true });
  });

  it("rate-limits repeated pre-auth capabilities requests", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const ws = await openClient(server);
    const responses: Record<string, unknown>[] = [];
    const receivedRateLimit = new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 1_000);
      ws.on("message", (raw: Buffer) => {
        const response = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
        responses.push(response);
        if (errorCode(response) === "rate_limited") {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    for (let i = 0; i < 130; i += 1) {
      ws.send(JSON.stringify(envelope("viewer.api.capabilities.get")));
    }

    await receivedRateLimit;
    expect(responses.some((response) => errorCode(response) === "rate_limited")).toBe(
      true,
    );
    ws.close();
    await server.stop();
  });

  it("delivers scoped event subscriptions without polling", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const { ws, tokenMessage } = await approveTestGrant(server, ["read:actions"]);
    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    expect((await waitForMessage(ws)).data).toMatchObject({
      grantId: expect.any(String),
    });

    ws.send(
      JSON.stringify(
        envelope("viewer.events.subscribe", {
          events: [{ name: "viewer.action.completed" }],
        }),
      ),
    );
    const subscribed = await waitForMessage(ws);
    expect(subscribed.ok).toBe(true);

    const eventPromise = waitForMessage(ws);
    expect(
      server.publishEvent({
        name: "viewer.action.completed",
        data: { actionId: "wave", kind: "effectPreset", status: "completed" },
      }),
    ).toBe(1);
    const event = await eventPromise;
    expect(event).toMatchObject({
      type: "viewer.action.completed",
      ok: true,
      data: { actionId: "wave", status: "completed" },
    });

    ws.close();
    await server.stop();
  });

  it("rejects mixed event subscriptions when any event lacks scope", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const { ws, tokenMessage } = await approveTestGrant(server, ["read:actions"]);
    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    await waitForMessage(ws);

    ws.send(
      JSON.stringify(
        envelope("viewer.events.subscribe", {
          events: [
            { name: "viewer.action.completed" },
            { name: "viewer.signals.changed" },
          ],
        }),
      ),
    );
    const denied = await waitForMessage(ws);
    expect(denied.ok).toBe(false);
    expectErrorCode(denied, "scope_denied");
    expect(denied.error).toMatchObject({
      details: { requiredScopes: ["read:signals"] },
    });
    expect(
      server.publishEvent({
        name: "viewer.action.completed",
        data: { actionId: "wave" },
      }),
    ).toBe(0);

    ws.close();
    await server.stop();
  });

  it("sends dropped control events for oversized event payloads", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const { ws, tokenMessage } = await approveTestGrant(server, ["read:signals"]);
    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    await waitForMessage(ws);
    ws.send(
      JSON.stringify(
        envelope("viewer.events.subscribe", {
          events: [{ name: "viewer.signals.changed" }],
        }),
      ),
    );
    await waitForMessage(ws);

    const eventPromise = waitForMessage(ws);
    server.publishEvent({
      name: "viewer.signals.changed",
      data: { signalIds: ["x"], padding: "x".repeat(20 * 1024) },
    });
    const dropped = await eventPromise;
    expect(dropped).toMatchObject({
      type: "viewer.events.dropped",
      data: { category: "payload_too_large" },
    });

    ws.close();
    await server.stop();
  });

  it("keeps the latest event and reports queue overflow drops", () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    const fakeWs = { readyState: 1, send: vi.fn() };
    const clientState: {
      controlEventQueue: Array<{ serialized: string; bytes: number }>;
      eventQueue: Array<{ serialized: string; bytes: number; droppedCount?: number }>;
      eventQueueBytes: number;
      eventFlushScheduled: boolean;
    } = {
      controlEventQueue: [],
      eventQueue: [],
      eventQueueBytes: 0,
      eventFlushScheduled: true,
    };

    for (let i = 0; i < 128; i += 1) {
      server.enqueueEvent(fakeWs, clientState, {
        name: "viewer.action.completed",
        timestamp: Date.now(),
        data: { actionId: `action-${i}` },
      });
    }
    server.enqueueEvent(fakeWs, clientState, {
      name: "viewer.action.completed",
      timestamp: Date.now(),
      data: { actionId: "action-latest" },
    });

    const controlQueued = clientState.controlEventQueue.map((event) =>
      JSON.parse(event.serialized),
    );
    const queued = clientState.eventQueue.map((event) => JSON.parse(event.serialized));
    expect(controlQueued).toEqual([
      expect.objectContaining({
        type: "viewer.events.dropped",
        data: expect.objectContaining({ category: "queue_overflow" }),
      }),
    ]);
    expect(queued).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "viewer.action.completed",
          data: expect.objectContaining({ actionId: "action-latest" }),
        }),
      ]),
    );
  });

  it("throttles minInterval event subscriptions", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const { ws, tokenMessage } = await approveTestGrant(server, [
      "read:state",
      "read:signals",
      "read:actions",
    ]);
    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    await waitForMessage(ws);
    ws.send(
      JSON.stringify(
        envelope("viewer.events.subscribe", {
          events: [
            { name: "viewer.action.completed" },
            {
              name: "viewer.signals.changed",
              filter: { minIntervalMs: 1000 },
            },
          ],
        }),
      ),
    );
    await waitForMessage(ws);

    const signalMessages: Record<string, unknown>[] = [];
    ws.on("message", (raw: Buffer) => {
      const message = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
      if (message.type === "viewer.signals.changed") signalMessages.push(message);
    });
    const now = Date.now();
    server.publishEvent({
      name: "viewer.signals.changed",
      timestamp: now,
      data: { signalIds: ["vivi.signal.headYaw"] },
    });
    server.publishEvent({
      name: "viewer.signals.changed",
      timestamp: now + 10,
      data: { signalIds: ["vivi.signal.headYaw"] },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(signalMessages).toHaveLength(1);

    ws.close();
    await server.stop();
  });

  it("requires the external pairing code without exposing it in renderer status", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    server.openPairingWindow(10_000);
    const ws = await openClient(server);

    ws.send(
      JSON.stringify(
        envelope("viewer.auth.challenge", {
          appName: "test client",
          scopes: ["read:state"],
        }),
      ),
    );
    const challengeResponse = await waitForMessage(ws);
    const challenge = challengeResponse.data as Record<string, string>;
    const pendingChallenge = server.getStatus().pendingChallenges[0] as Record<
      string,
      unknown
    >;
    expect(pendingChallenge).not.toHaveProperty("code");
    for (let i = 0; i < 4; i += 1) {
      expect(server.approveChallenge(challenge.challengeId, "000000")).toBeNull();
      expect(server.pendingChallenges.size).toBe(1);
    }
    const tokenMessagePromise = waitForMessage(ws);
    expect(server.approveChallenge(challenge.challengeId, "000000")).toBeNull();
    expectErrorCode(await tokenMessagePromise, "pairing_closed");
    expect(server.pendingChallenges.size).toBe(0);
    ws.close();
    await server.stop();
  });

  it("revokes active sessions immediately", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const { ws, approved, tokenMessage } = await approveTestGrant(server, ["read:state"]);
    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    await waitForMessage(ws);

    const revokedEventPromise = waitForMessage(ws);
    const closePromise = new Promise((resolve) => ws.once("close", resolve));
    expect(server.revokeGrant(approved.id)).toBe(true);
    const revokedEvent = await revokedEventPromise;
    expect(revokedEvent).toMatchObject({
      type: "viewer.api.grant.revoked",
      data: { fingerprint: expect.any(String), reason: "revoked" },
    });
    await closePromise;

    await server.stop();
  });

  it("continues revoking healthy clients if one notification send fails", () => {
    const warn = vi.fn();
    const server = createViewerApiServer({
      logger: { warn },
      allowSessionGrants: true,
    });
    const grant = {
      id: "grant-1",
      token: "token-1",
      appName: "Fixture app",
      scopes: ["read:state"],
      origins: [],
      originBinding: "no-origin",
      createdAt: 123,
      lastUsedAt: null,
    };
    server.grants.set(grant.id, grant);
    const badClient = {
      __viewerGrantId: grant.id,
      __viewerApiClientState: { negotiatedVersion: "0.preview" },
      send: vi.fn(() => {
        throw new Error("send failed");
      }),
      close: vi.fn(),
    };
    const goodClient = {
      __viewerGrantId: grant.id,
      __viewerApiClientState: { negotiatedVersion: "0.preview" },
      send: vi.fn((_payload: string, callback: () => void) => callback()),
      close: vi.fn(),
    };
    server.wsServer = { clients: [badClient, goodClient] };

    expect(server.revokeGrant(grant.id)).toBe(true);

    expect(badClient.close).toHaveBeenCalled();
    expect(goodClient.send).toHaveBeenCalledWith(
      expect.stringContaining("viewer.api.grant.revoked"),
      expect.any(Function),
    );
    expect(goodClient.close).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[viewer-api] failed to send grant revocation",
      expect.any(Error),
    );
  });

  it("expires grants for re-pairing and rejects the old token", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const { ws, approved, tokenMessage } = await approveTestGrant(server, ["read:state"]);
    const oldToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: oldToken })));
    expect((await waitForMessage(ws)).data).toMatchObject({
      grantId: expect.any(String),
    });
    const revokedEventPromise = waitForMessage(ws);
    const closePromise = new Promise((resolve) => ws.once("close", resolve));
    const rotated = server.rotateGrant(approved.id);
    expect(rotated).toEqual({ id: approved.id, rePairRequired: true });
    expect(rotated).not.toHaveProperty("token");
    expect(await revokedEventPromise).toMatchObject({
      type: "viewer.api.grant.revoked",
    });
    await closePromise;
    expect(server.getStatus().grants).toEqual([]);

    const oldWs = await openClient(server);
    oldWs.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: oldToken })));
    const oldAuth = await waitForMessage(oldWs);
    expect(oldAuth.data).toMatchObject({ authenticated: false });

    oldWs.close();
    await server.stop();
  });

  it("aborts an in-flight request and clears write limits when a grant is re-paired", async () => {
    let started: (() => void) | null = null;
    let capturedSignal: AbortSignal | undefined;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
      handlers: {
        "viewer.signals.set": async (
          _message: unknown,
          _grant: unknown,
          context: { signal?: AbortSignal },
        ) => {
          capturedSignal = context.signal;
          started?.();
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { accepted: true };
        },
      },
    });
    await server.start({ port: 0 });
    const { ws, approved, tokenMessage } = await approveTestGrant(server, [
      "write:signals",
    ]);
    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    await waitForMessage(ws);

    ws.send(JSON.stringify(envelope("viewer.signals.set", { values: { ParamX: 1 } })));
    await startedPromise;
    const closePromise = new Promise((resolve) => ws.once("close", resolve));

    server.rotateGrant(approved.id);

    await closePromise;
    expect(capturedSignal?.aborted).toBe(true);
    expect(server.grantWriteTimestamps.has(approved.id)).toBe(false);
    await server.stop();
  });

  it("enforces grant, auth, write, and pairing limits", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    for (let i = 0; i < MAX_GRANTS; i += 1) {
      server.grants.set(`grant-${i}`, {
        id: `grant-${i}`,
        token: `token-${i}`,
        appName: "test",
        scopes: ["read:state", "write:signals"],
        origins: [],
        createdAt: Date.now(),
        lastUsedAt: null,
      });
    }
    await server.start({ port: 0 });
    server.openPairingWindow(10_000);
    const ws = await openClient(server);

    ws.send(
      JSON.stringify(
        envelope("viewer.auth.challenge", {
          appName: "test client",
          scopes: ["read:state"],
        }),
      ),
    );
    const challengeResponse = await waitForMessage(ws);
    const challenge = challengeResponse.data as Record<string, string>;
    const tokenMessagePromise = waitForMessage(ws);
    expect(server.approveChallenge(challenge.challengeId, challenge.code)).toBeNull();
    expectErrorCode(await tokenMessagePromise, "rate_limited");
    expect(server.pendingChallenges.size).toBe(0);

    for (let i = 0; i < MAX_AUTH_ATTEMPTS_PER_MINUTE; i += 1) {
      ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: "bad" })));
      await waitForMessage(ws);
    }
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: "bad" })));
    expectErrorCode(await waitForMessage(ws), "rate_limited");

    const state = { writeTimestamps: [] };
    const peerState = { writeTimestamps: [] };
    for (let i = 0; i < MAX_WRITE_REQUESTS_PER_SECOND; i += 1) {
      expect(server.consumeWriteBudget(state, peerState)).toBe(true);
    }
    expect(server.consumeWriteBudget(state, peerState)).toBe(false);

    const pairingState = { pairingChallengeTimestamps: [], writeTimestamps: [] };
    const pairingPeerState = { pairingChallengeTimestamps: [] };
    const sentPairingMessages: Array<Record<string, unknown>> = [];
    const fakeWs = {
      send(raw: string) {
        sentPairingMessages.push(JSON.parse(raw));
      },
    };
    for (let i = 0; i < MAX_PAIRING_CHALLENGES_PER_WINDOW; i += 1) {
      server.handleChallenge(
        fakeWs,
        envelope("viewer.auth.challenge", {
          appName: "pair",
          scopes: ["read:state"],
        }),
        null,
        pairingState,
        pairingPeerState,
      );
    }
    server.handleChallenge(
      fakeWs,
      envelope("viewer.auth.challenge", {
        appName: "pair",
        scopes: ["read:state"],
      }),
      null,
      pairingState,
      pairingPeerState,
    );
    expectErrorCode(sentPairingMessages.at(-1) ?? {}, "rate_limited");

    ws.close();
    await server.stop();
  });

  it("refuses to approve grants when secure storage is unavailable", async () => {
    const server = createViewerApiServer({ port: 0, logger: { warn: vi.fn() } });
    await server.start({ port: 0 });
    server.openPairingWindow(10_000);
    const port = server.server.address().port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      perMessageDeflate: false,
    });
    await waitForOpen(ws);

    ws.send(
      JSON.stringify(
        envelope("viewer.auth.challenge", {
          appName: "test client",
          scopes: ["read:state"],
        }),
      ),
    );
    const challengeResponse = await waitForMessage(ws);
    const challenge = challengeResponse.data as Record<string, string>;
    const tokenMessagePromise = waitForMessage(ws);
    const approved = server.approveChallenge(challenge.challengeId, challenge.code);
    const tokenMessage = await tokenMessagePromise;

    expect(approved).toBeNull();
    expect(tokenMessage.ok).toBe(false);
    expectErrorCode(tokenMessage, "host_capability_unavailable");
    expect(server.pendingChallenges.size).toBe(0);
    ws.close();
    await server.stop();
  });

  it("rolls back in-memory grants when persistence fails", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      persistentGrantsAvailable: true,
      grantStore: {
        load: () => [],
        save: () => {
          throw new Error("disk locked");
        },
      },
    });
    await server.start({ port: 0 });
    server.openPairingWindow(10_000);
    const ws = await openClient(server);

    ws.send(
      JSON.stringify(
        envelope("viewer.auth.challenge", {
          appName: "test client",
          scopes: ["read:state"],
        }),
      ),
    );
    const challengeResponse = await waitForMessage(ws);
    const challenge = challengeResponse.data as Record<string, string>;
    const tokenMessagePromise = waitForMessage(ws);
    const approved = server.approveChallenge(challenge.challengeId, challenge.code);
    const tokenMessage = await tokenMessagePromise;

    expect(approved).toBeNull();
    expectErrorCode(tokenMessage, "internal_error");
    expect(server.grants.size).toBe(0);
    ws.close();
    await server.stop();
  });

  it("expires pending challenges with the pairing window", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    server.openPairingWindow(10_000);
    const ws = await openClient(server);

    ws.send(
      JSON.stringify(
        envelope("viewer.auth.challenge", {
          appName: "test client",
          scopes: ["read:state"],
        }),
      ),
    );
    const challengeResponse = await waitForMessage(ws);
    const challenge = challengeResponse.data as Record<string, string>;
    const tokenMessagePromise = waitForMessage(ws);
    server.closePairingWindow();

    expect(server.approveChallenge(challenge.challengeId, challenge.code)).toBeNull();
    expectErrorCode(await tokenMessagePromise, "pairing_closed");
    expect(server.pendingChallenges.size).toBe(0);
    ws.close();
    await server.stop();
  });

  it("keeps parsed request ids on handler errors", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
      handlers: {
        "viewer.state.get": () => {
          throw new Error("boom");
        },
      },
    });
    await server.start({ port: 0 });
    const { ws, tokenMessage } = await approveTestGrant(server, ["read:state"]);
    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    await waitForMessage(ws);

    ws.send(
      JSON.stringify({
        ...envelope("viewer.state.get"),
        id: "state-error-id",
      }),
    );
    const response = await waitForMessage(ws);

    expect(response).toMatchObject({
      id: "state-error-id",
      ok: false,
    });
    expectErrorCode(response, "invalid_request");
    ws.close();
    await server.stop();
  });

  it("does not charge write rate limit before authentication", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const { ws, tokenMessage } = await approveTestGrant(server, ["write:signals"]);
    for (let i = 0; i < MAX_WRITE_REQUESTS_PER_SECOND + 1; i += 1) {
      ws.send(JSON.stringify(envelope("viewer.signals.set", { values: { ParamX: i } })));
      expectErrorCode(await waitForMessage(ws), "unauthenticated");
    }

    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    await waitForMessage(ws);
    ws.send(JSON.stringify(envelope("viewer.signals.set", { values: { ParamX: 1 } })));
    expect(errorCode(await waitForMessage(ws))).not.toBe("rate_limited");
    ws.close();
    await server.stop();
  });

  it("does not charge write rate limit before known-disabled rejection", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const { ws, tokenMessage } = await approveTestGrant(server, ["read:state"]);
    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    await waitForMessage(ws);

    ws.send(JSON.stringify(envelope("viewer.signals.set", { values: { ParamX: 1 } })));
    expectErrorCode(await waitForMessage(ws), "unsupported");
    expect(server.globalWriteTimestamps).toHaveLength(0);
    ws.close();
    await server.stop();
  });

  it("keeps an authenticated session after failed re-authentication", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const { ws, tokenMessage } = await approveTestGrant(server, ["read:state"]);
    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    expect((await waitForMessage(ws)).data).toMatchObject({
      grantId: expect.any(String),
    });

    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: "bad" })));
    expectErrorCode(await waitForMessage(ws), "invalid_request");
    ws.send(JSON.stringify(envelope("viewer.state.get")));
    expect((await waitForMessage(ws)).ok).toBe(true);
    ws.close();
    await server.stop();
  });

  it("rejects invalid browser origins before upgrade", () => {
    const server = createViewerApiServer({ allowSessionGrants: true });
    expect(
      server.acceptUpgrade({
        headers: { host: "127.0.0.1:37145", origin: "file:///tmp/host.html" },
      }),
    ).toBe(false);
    expect(
      server.acceptUpgrade({
        headers: {
          host: "127.0.0.1:37145",
          origin: "http://evil.test",
          "sec-fetch-site": "cross-site",
        },
      }),
    ).toBe(false);
  });

  it("allows fresh browser origins only when the pairing window allowlists them", () => {
    const server = createViewerApiServer({ allowSessionGrants: true });
    server.openPairingWindow(10_000, { origins: ["http://pair.test"] });

    expect(
      server.acceptUpgrade({
        headers: { host: "127.0.0.1:37145", origin: "http://pair.test" },
      }),
    ).toBe(true);
    expect(
      server.acceptUpgrade({
        headers: { host: "127.0.0.1:37145", origin: "http://evil.test" },
      }),
    ).toBe(false);
  });

  it("binds browser origins to the authenticated grant", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    server.grants.set("grant-a", {
      id: "grant-a",
      token: "token-a",
      appName: "A",
      scopes: ["read:state"],
      origins: ["http://a.test"],
      createdAt: Date.now(),
      lastUsedAt: null,
    });
    server.grants.set("grant-b", {
      id: "grant-b",
      token: "token-b",
      appName: "B",
      scopes: ["read:state"],
      origins: ["http://b.test"],
      createdAt: Date.now(),
      lastUsedAt: null,
    });
    await server.start({ port: 0 });
    const ws = await openClient(server, { headers: { Origin: "http://a.test" } });

    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: "token-b" })));
    expect((await waitForMessage(ws)).data).toMatchObject({ authenticated: false });

    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: "token-a" })));
    expect((await waitForMessage(ws)).data).toMatchObject({
      grantId: "grant-a",
    });
    ws.close();
    await server.stop();
  });

  it("does not let origin-bound grants authenticate without an origin", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    server.grants.set("grant-a", {
      id: "grant-a",
      token: "token-a",
      appName: "A",
      scopes: ["read:state"],
      origins: ["http://a.test"],
      createdAt: Date.now(),
      lastUsedAt: null,
    });
    await server.start({ port: 0 });
    const ws = await openClient(server);

    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: "token-a" })));
    expect((await waitForMessage(ws)).data).toMatchObject({ authenticated: false });
    ws.close();
    await server.stop();
  });

  it("returns only the current grant in public state", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    const { ws, tokenMessage } = await approveTestGrant(server, ["read:state"]);
    const authToken = (tokenMessage.data as Record<string, string>).token;
    ws.send(JSON.stringify(envelope("viewer.auth.authenticate", { token: authToken })));
    await waitForMessage(ws);

    ws.send(JSON.stringify(envelope("viewer.state.get")));
    const response = await waitForMessage(ws);

    expect(response.data).toHaveProperty("grant");
    expect(response.data).not.toHaveProperty("grants");
    ws.close();
    await server.stop();
  });

  it("rejects upgrades when the local API is at the connection cap", () => {
    const server = createViewerApiServer({ allowSessionGrants: true });
    server.wsServer = { clients: { size: 64 } };

    expect(
      server.acceptUpgrade({
        headers: { host: "127.0.0.1:37145" },
      }),
    ).toBe(false);
  });

  it("clears pending pairing state on stop", async () => {
    const server = createViewerApiServer({
      port: 0,
      logger: { warn: vi.fn() },
      allowSessionGrants: true,
    });
    await server.start({ port: 0 });
    server.openPairingWindow(10_000);
    const ws = await openClient(server);
    ws.send(
      JSON.stringify(
        envelope("viewer.auth.challenge", {
          appName: "test client",
          scopes: ["read:state"],
        }),
      ),
    );
    await waitForMessage(ws);
    expect(server.pendingChallenges.size).toBe(1);

    await server.stop();

    expect(server.pendingChallenges.size).toBe(0);
    expect(server.pairingWindowUntil).toBe(0);
  });
});
