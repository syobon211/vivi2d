import { describe, expect, it } from "vitest";
import {
  parseViviActionTrigger,
  parseViviActionTriggers,
} from "../actions/action-bindings";
import { ViviActionRegistry } from "../actions/action-registry";
import {
  createPropTransformAction,
  createPropVisibilityAction,
} from "../props/prop-actions";

describe("viewer action boundary helpers", () => {
  it("parses each trigger source with source-specific match validation", () => {
    expect(
      parseViviActionTrigger({
        id: "keyboard",
        actionId: "action",
        source: "keyboard",
        match: { key: "K", ctrlKey: true },
        enabled: true,
      }).source,
    ).toBe("keyboard");
    expect(
      parseViviActionTrigger({
        id: "midi",
        actionId: "action",
        source: "midi",
        match: { cc: 127, channel: 15 },
        enabled: true,
      }).source,
    ).toBe("midi");
    expect(
      parseViviActionTrigger({
        id: "gamepad",
        actionId: "action",
        source: "gamepad",
        match: { type: "button", index: 64 },
        enabled: true,
      }).source,
    ).toBe("gamepad");
    for (const source of ["viewerApi", "script", "ui"] as const) {
      expect(
        parseViviActionTrigger({
          id: source,
          actionId: "action",
          source,
          match: {},
          enabled: true,
        }).source,
      ).toBe(source);
    }
  });

  it("rejects trigger matches that exceed public input bounds", () => {
    expect(() =>
      parseViviActionTrigger({
        id: "midi",
        actionId: "action",
        source: "midi",
        match: { cc: 128 },
        enabled: true,
      }),
    ).toThrow();
    expect(() =>
      parseViviActionTrigger({
        id: "gamepad",
        actionId: "action",
        source: "gamepad",
        match: { type: "axis", index: 65 },
        enabled: true,
      }),
    ).toThrow();
    expect(() =>
      parseViviActionTrigger({
        id: "api",
        actionId: "action",
        source: "viewerApi",
        match: { requestType: "viewer.action.run" },
        enabled: true,
      }),
    ).toThrow();
  });

  it("keeps action trigger imports bounded", () => {
    const trigger = {
      id: "ui",
      actionId: "action",
      source: "ui",
      match: {},
      enabled: true,
    };

    expect(parseViviActionTriggers([trigger])).toHaveLength(1);
    expect(() =>
      parseViviActionTriggers(
        Array.from({ length: 513 }, (_, index) => ({
          ...trigger,
          id: `ui-${index}`,
        })),
      ),
    ).toThrow();
  });

  it("registers, updates, replaces, and removes validated actions", () => {
    const registry = new ViviActionRegistry();
    const registered = registry.register({
      id: "effect",
      name: "Effect",
      kind: "effectPreset",
      enabled: true,
      payload: { effectId: "stars" },
    });

    expect(registered.kind).toBe("effectPreset");
    expect(registry.setEnabled("effect", false)?.enabled).toBe(false);
    expect(registry.setEnabled("missing", true)).toBeNull();
    expect(
      registry.replaceAll([
        {
          id: "visibility",
          name: "Visibility",
          kind: "propVisibility",
          enabled: true,
          payload: { propId: "hat", visible: false },
        },
      ]),
    ).toHaveLength(1);
    expect(registry.get("effect")).toBeNull();
    expect(registry.unregister("visibility")).toBe(true);
    expect(registry.unregister("visibility")).toBe(false);
  });

  it("rejects invalid actions before they enter the registry", () => {
    const registry = new ViviActionRegistry();

    expect(() =>
      registry.register({
        id: "bad",
        name: "Bad",
        kind: "propTransform",
        enabled: true,
        payload: { propId: "hat", transform: { scaleX: 0 } },
      }),
    ).toThrow();
    expect(registry.list()).toHaveLength(0);
  });

  it("creates safe built-in prop actions", () => {
    expect(createPropVisibilityAction("hat", true)).toMatchObject({
      id: "prop-visible-hat-on",
      name: "Show prop",
      kind: "propVisibility",
      payload: { propId: "hat", visible: true },
      queuePolicy: "drop",
      source: "builtIn",
    });
    expect(createPropVisibilityAction("hat", false)).toMatchObject({
      id: "prop-visible-hat-off",
      name: "Hide prop",
      payload: { propId: "hat", visible: false },
    });
    expect(createPropTransformAction("hat", { x: 1, opacity: 0.5 })).toMatchObject({
      id: "prop-transform-hat",
      kind: "propTransform",
      payload: { propId: "hat", transform: { x: 1, opacity: 0.5 } },
      queuePolicy: "replace",
      source: "builtIn",
    });
  });
});
