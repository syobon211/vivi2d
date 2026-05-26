import { describe, expect, it } from "vitest";
import {
  getActionRequiredScope,
  VIVI_ACTION_KINDS,
  type ViviActionKind,
} from "../actions/action-types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const schema = require("../../electron/viewer-api-schema.cjs");

const {
  ACTION_KINDS,
  parseViewerApiMessage,
  requiredScopesForMessage,
  VIVI_VIEWER_API_NAME,
  VIVI_VIEWER_API_VERSION,
} = schema;

function envelope(type: string, data: Record<string, unknown> = {}) {
  return {
    api: VIVI_VIEWER_API_NAME,
    version: VIVI_VIEWER_API_VERSION,
    id: "sync-test",
    type,
    data,
  };
}

describe("viewer API schema sync", () => {
  it("accepts public TypeScript action kinds at the Electron API boundary", () => {
    for (const actionKind of VIVI_ACTION_KINDS) {
      if (["recordingControl", "scriptCommand", "bridgeCommand"].includes(actionKind)) {
        continue;
      }
      expect(() =>
        parseViewerApiMessage(
          JSON.stringify(
            envelope("viewer.action.run", {
              actionId: `action-${actionKind}`,
              actionKind,
            }),
          ),
        ),
      ).not.toThrow();
    }
  });

  it("does not expose Electron-only action kinds", () => {
    expect([...ACTION_KINDS].sort()).toEqual([...VIVI_ACTION_KINDS].sort());
  });

  it("keeps Electron API action scopes aligned with public TypeScript actions", () => {
    for (const actionKind of VIVI_ACTION_KINDS) {
      if (["recordingControl", "scriptCommand", "bridgeCommand"].includes(actionKind)) {
        expect(() =>
          parseViewerApiMessage(
            JSON.stringify(
              envelope("viewer.action.run", {
                actionId: `action-${actionKind}`,
                actionKind,
              }),
            ),
          ),
        ).toThrow("reserved action kind is unsupported");
        continue;
      }
      const message = envelope("viewer.action.run", {
        actionId: `action-${actionKind}`,
        actionKind,
      });

      expect(requiredScopesForMessage(message)).toEqual([
        getActionRequiredScope(actionKind as ViviActionKind),
      ]);
    }
  });

  it("keeps event streaming Vivi-owned and removed scene presets out of the protocol", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.events.subscribe", {
            events: [{ name: "viewer.action.completed" }],
          }),
        ),
      ),
    ).not.toThrow();

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(envelope("viewer.events.subscribe", { events: ["*"] })),
      ),
    ).toThrow("event must be an object");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.action.run", {
            actionId: "legacy-scene",
            actionKind: "scenePreset",
          }),
        ),
      ),
    ).toThrow("unsupported action kind");
  });

  it("keeps legacy bridge scopes out of auth challenges", () => {
    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.auth.challenge", {
            appName: "legacy bridge",
            scopes: ["bridge:obs"],
          }),
        ),
      ),
    ).toThrow("unsupported scope");

    expect(() =>
      parseViewerApiMessage(
        JSON.stringify(
          envelope("viewer.action.run", {
            actionId: "scene-bridge",
            actionKind: "bridgeCommand",
          }),
        ),
      ),
    ).toThrow("reserved action kind is unsupported");
  });
});
