// @vitest-environment node
import { EventEmitter } from "node:events";
import { expect, it } from "vitest";
import { LocalAssetCopyFault } from "../local-asset-copy";

const { wrapHandler } = require("../security.cjs");
const { register } = require("../ipc/local-asset-copy.cjs");

it("rejects path-bearing and foreign-frame requests before the coordinator, redacts failures, and rotates sender ownership", async () => {
  type Event = { sender: unknown; senderFrame: { parent: unknown } };
  type Response = {
    ok: boolean;
    code?: string;
    value?: unknown;
    outcomeMayHaveCommitted?: boolean;
  };
  let handler!: (event: Event, command: unknown) => Promise<Response>;
  const contents = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false });
  const window = { webContents: contents, isDestroyed: () => false };
  const owners: object[] = [],
    lost: object[] = [];
  register({
    handle: wrapHandler(
      {
        handle: (_channel: string, value: typeof handler) => {
          handler = value;
        },
      },
      () => window,
    ),
    getMainWindow: () => window,
    Fault: LocalAssetCopyFault,
    coordinator: {
      // Controlled coordinator participant tests only IPC authority/error mapping,
      // not Project admission, native readiness, or real C2 capability support.
      prepare: async (owner: object) => {
        owners.push(owner);
        throw new LocalAssetCopyFault("LOCAL_ASSET_UNAVAILABLE");
      },
      commit: async () => {
        throw new Error("private-path-canary");
      },
      preview: async (owner: object) => {
        owners.push(owner);
        throw new Error("private-path-canary");
      },
      cancelPreview: (owner: object) => owners.push(owner),
      rendererLost: (owner: object) => lost.push(owner),
      close: async () => {},
    },
  });
  const event = { sender: contents, senderFrame: { parent: null } };
  const command = {
    operation: "prepare",
    sourceCellId: "a".repeat(64),
    receiverCellId: "b".repeat(64),
  };
  for (const bad of [
    { ...command, path: "private-path-canary" },
    { ...command, operation: "resolve" },
    Object.defineProperty({ ...command }, "sourceCellId", {
      get: () => {
        throw new Error("private-path-canary");
      },
    }),
  ]) {
    await expect(handler(event, bad)).rejects.toThrow("Invalid local Asset copy");
  }
  await expect(handler({ ...event, sender: { id: 2 } }, command)).rejects.toThrow(
    "sender",
  );
  await expect(
    handler({ ...event, senderFrame: { parent: {} } }, command),
  ).rejects.toThrow("child frames");
  expect(owners).toHaveLength(0);
  await expect(handler(event, command)).resolves.toEqual({
    ok: false,
    code: "LOCAL_ASSET_UNAVAILABLE",
    outcomeMayHaveCommitted: false,
  });
  contents.emit("did-start-navigation", {}, "about:blank", false, true);
  expect(lost).toEqual([owners[0]]);
  await handler(event, command);
  expect(owners[1]).not.toBe(owners[0]);
  for (const bad of [
    { operation: "preview", cellId: "a".repeat(64), capabilities: { ready: true } },
    { operation: "cancelPreview", cellId: "a".repeat(64) },
    Object.defineProperty({ operation: "preview" }, "cellId", {
      enumerable: true,
      get: () => {
        throw new Error("private-path-canary");
      },
    }),
  ]) {
    await expect(handler(event, bad)).rejects.toThrow("Invalid local Asset copy");
  }
  expect(owners).toHaveLength(2);
  await expect(
    handler(event, { operation: "preview", cellId: "a".repeat(64) }),
  ).resolves.toEqual({
    ok: false,
    code: "LOCAL_ASSET_INTERNAL",
    outcomeMayHaveCommitted: false,
  });
  await expect(handler(event, { operation: "cancelPreview" })).resolves.toEqual({
    ok: true,
    value: null,
  });
  expect(owners[3]).toBe(owners[2]);
  await expect(
    handler(event, {
      operation: "commit",
      copyId: "123e4567-e89b-42d3-a456-426614174000",
    }),
  ).resolves.toEqual({
    ok: false,
    code: "LOCAL_ASSET_INTERNAL",
    outcomeMayHaveCommitted: true,
  });
  contents.emit("destroyed");
  expect(contents.listenerCount("did-start-navigation")).toBe(0);
});
