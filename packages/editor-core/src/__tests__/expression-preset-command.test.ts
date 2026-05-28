import { describe, expect, it } from "vitest";
import {
  createExpressionPreset,
  getExpressionPresetValues,
  getExpressionPresetValuesByHotkey,
  removeExpressionPreset,
  renameExpressionPreset,
  setExpressionPresetHotkey,
  updateExpressionPresetValues,
} from "../expression-preset-command";
import { createProject } from "./fixtures";

describe("expression preset commands", () => {
  it("creates presets with cloned finite values", () => {
    const project = createProject({ expressionPresets: undefined });
    const values = { "param-x": 0.5, "param-bad": Number.NaN };

    const id = createExpressionPreset(
      project,
      { name: "Smile", values },
      () => "preset-1",
    );
    values["param-x"] = 1;

    expect(id).toBe("preset-1");
    expect(project.expressionPresets).toEqual([
      { id, name: "Smile", values: { "param-x": 0.5 } },
    ]);
  });

  it("returns cloned values by id and hotkey", () => {
    const project = createProject();
    createExpressionPreset(
      project,
      { name: "Smile", values: { "param-x": 0.5 } },
      () => "preset-1",
    );
    setExpressionPresetHotkey(project, "preset-1", 1);

    const byId = getExpressionPresetValues(project, "preset-1");
    const byHotkey = getExpressionPresetValuesByHotkey(project, 1);
    byId!["param-x"] = 1;

    expect(byHotkey).toEqual({ "param-x": 0.5 });
    expect(project.expressionPresets?.[0]?.values).toEqual({ "param-x": 0.5 });
  });

  it("renames, updates values, and removes presets", () => {
    const project = createProject();
    createExpressionPreset(
      project,
      { name: "Smile", values: { "param-x": 0.5 } },
      () => "preset-1",
    );

    expect(renameExpressionPreset(project, "preset-1", "Blink")).toBe(true);
    expect(
      updateExpressionPresetValues(project, "preset-1", {
        "param-y": -0.25,
        "param-bad": Number.POSITIVE_INFINITY,
      }),
    ).toBe(true);
    expect(project.expressionPresets?.[0]).toMatchObject({
      name: "Blink",
      values: { "param-y": -0.25 },
    });
    expect(removeExpressionPreset(project, "missing")).toBe(false);
    expect(removeExpressionPreset(project, "preset-1")).toBe(true);
    expect(project.expressionPresets).toEqual([]);
  });

  it("keeps hotkeys unique and treats non-finite hotkeys as unset", () => {
    const project = createProject();
    createExpressionPreset(project, { name: "A", values: {} }, () => "a");
    createExpressionPreset(project, { name: "B", values: {} }, () => "b");

    expect(setExpressionPresetHotkey(project, "a", 1)).toBe(true);
    expect(setExpressionPresetHotkey(project, "b", 1)).toBe(true);
    expect(project.expressionPresets?.[0]?.hotkey).toBeUndefined();
    expect(project.expressionPresets?.[1]?.hotkey).toBe(1);
    expect(setExpressionPresetHotkey(project, "b", Number.NaN)).toBe(true);
    expect(project.expressionPresets?.[1]?.hotkey).toBeUndefined();
  });
});
