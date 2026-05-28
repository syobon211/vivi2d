import { describe, expect, it } from "vitest";
import { createViviViewerClient } from "../browser.js";
import { ViviViewerApiClientError } from "../errors.js";
import {
  createMemoryTokenStore,
  type ViviViewerTokenStore,
} from "../token-store.js";
import {
  createMockWebSocketFactory,
  makeViewerApiResponse,
  readSentMessage,
} from "../testing.js";

const capabilities = {
  api: "ViviViewerApi",
  version: "0.preview",
  stability: "preview",
  pairingOpen: true,
  scopeMetadata: [
    { scope: "read:state", surface: "core", risk: "low" },
    { scope: "read:props", surface: "core", risk: "low" },
    { scope: "write:props", surface: "core", risk: "medium" },
  ],
  core: {
    requestTypes: [
      {
        name: "viewer.state.get",
        surface: "core",
        scopeMode: "static",
        requiredScopes: [["read:state"]],
      },
      {
        name: "viewer.props.list",
        surface: "core",
        scopeMode: "static",
        requiredScopes: [["read:props"]],
      },
    ],
    eventTypes: [],
    scopes: [],
  },
  extensions: {
    requestTypes: [],
    eventTypes: [],
    scopes: [],
  },
  limits: {
    maxWebSocketTextFrameBytes: 65536,
    maxRequestPayloadBytes: 49152,
  },
};

describe("createViviViewerClient", () => {
  it("connects, validates capabilities, pairs, authenticates, and reads state", async () => {
    const { factory, sockets } = createMockWebSocketFactory();
    const tokenStore = createMemoryTokenStore();
    const client = createViviViewerClient({
      endpoint: "ws://127.0.0.1:41730",
      webSocketFactory: factory,
      appName: "Test Client",
      scopes: ["read:state"],
      tokenStore,
    });

    const connected = client.connect();
    await waitForSentCount(sockets, 1);
    const socket = sockets[0]!;
    const capRequest = readSentMessage(socket, 0);
    socket.receive(
      makeViewerApiResponse(String(capRequest.id), "viewer.api.capabilities.get.result", true, {
        capabilities,
      }),
    );
    await connected;

    const paired = client.pair({
      onChallenge: (challenge) => {
        expect(challenge.code).toBe("123456");
      },
    });
    await waitForSentCount(sockets, 2);
    const challengeRequest = readSentMessage(socket, 1);
    socket.receive(
      makeViewerApiResponse(String(challengeRequest.id), "viewer.auth.challenge.result", true, {
        phase: "pending",
        challengeId: "challenge",
        code: "123456",
      }),
    );
    socket.receive(
      makeViewerApiResponse(
        String(challengeRequest.id),
        "viewer.auth.challenge.completed",
        true,
        {
          phase: "completed",
          token: "token",
          scopes: ["read:state"],
          grantId: "grant",
        },
      ),
    );
    await waitForSentCount(sockets, 3);
    const authRequest = readSentMessage(socket, 2);
    socket.receive(
      makeViewerApiResponse(String(authRequest.id), "viewer.auth.authenticate.result", true, {
        grantId: "grant",
        scopes: ["read:state"],
      }),
    );
    await waitForSentCount(sockets, 4);
    const authCapRequest = readSentMessage(socket, 3);
    socket.receive(
      makeViewerApiResponse(
        String(authCapRequest.id),
        "viewer.api.capabilities.get.result",
        true,
        { capabilities },
      ),
    );
    await expect(paired).resolves.toMatchObject({ grantId: "grant" });
    await expect(Promise.resolve(tokenStore.load(client.endpoint!))).resolves.toMatchObject({
      token: "token",
    });

    const state = client.state.get();
    await waitForSentCount(sockets, 5);
    const stateRequest = readSentMessage(socket, 4);
    socket.receive(
      makeViewerApiResponse(String(stateRequest.id), "viewer.state.get.result", true, {
        grant: { scopes: ["read:state"] },
      }),
    );
    await expect(state).resolves.toEqual({ grant: { scopes: ["read:state"] } });
  });

  it("denies insufficient scopes before sending a request", async () => {
    const { client, socket } = await connectedClient(createMemoryTokenStore());
    await authenticateWithScopes(client, socket, ["read:state"]);
    const before = socket.sent.length;

    await expect(client.props.list()).rejects.toMatchObject({
      code: "scope_denied",
    });
    expect(socket.sent).toHaveLength(before);
  });

  it("requires capability metadata before protected requests", async () => {
    const { factory } = createMockWebSocketFactory();
    const client = createViviViewerClient({
      endpoint: "ws://127.0.0.1:41730",
      webSocketFactory: factory,
    });

    await expect(client.state.get()).rejects.toMatchObject({
      code: "host_capability_unavailable",
    });
  });

  it("clears authenticated state on disconnect", async () => {
    const { client, socket } = await connectedClient(createMemoryTokenStore());
    await authenticateWithScopes(client, socket, ["read:state"]);
    expect(client.grant).toMatchObject({ token: "token" });
    client.disconnect();
    expect(client.grant).toBeNull();
  });
});

async function connectedClient(tokenStore: ViviViewerTokenStore) {
  const { factory, sockets } = createMockWebSocketFactory();
  const client = createViviViewerClient({
    endpoint: "ws://127.0.0.1:41730",
    webSocketFactory: factory,
    scopes: ["read:state"],
    tokenStore,
  });
  const connected = client.connect();
  await waitForSentCount(sockets, 1);
  const socket = sockets[0]!;
  const capRequest = readSentMessage(socket, 0);
  socket.receive(
    makeViewerApiResponse(String(capRequest.id), "viewer.api.capabilities.get.result", true, {
      capabilities,
    }),
  );
  await connected;
  return { client, socket };
}

async function authenticateWithScopes(
  client: ReturnType<typeof createViviViewerClient>,
  socket: { sent: string[]; receive(data: string): void },
  scopes: string[],
) {
  const authRequestCount = socket.sent.length + 1;
  const auth = client.authenticate("token");
  await waitForSentCount({ 0: socket, length: 1 }, authRequestCount);
  const authRequest = readSentMessage(socket, socket.sent.length - 1);
  socket.receive(
    makeViewerApiResponse(String(authRequest.id), "viewer.auth.authenticate.result", true, {
      grantId: "grant",
      scopes,
    }),
  );
  const capabilityRequestCount = socket.sent.length + 1;
  await waitForSentCount({ 0: socket, length: 1 }, capabilityRequestCount);
  const capRequest = readSentMessage(socket, socket.sent.length - 1);
  socket.receive(
    makeViewerApiResponse(String(capRequest.id), "viewer.api.capabilities.get.result", true, {
      capabilities,
    }),
  );
  await auth;
}

async function waitForSentCount(
  sockets: { 0?: { sent: string[] }; length: number },
  count: number,
) {
  await new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if ((sockets[0]?.sent.length ?? 0) >= count) {
        resolve();
        return;
      }
      if (Date.now() - started > 1000) {
        reject(new Error(`Timed out waiting for ${count} sent messages`));
        return;
      }
      setTimeout(tick, 0);
    };
    tick();
  });
}
