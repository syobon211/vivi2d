import { describe, expect, it } from "vitest";
import { ViviModel } from "../model";
import { parseViviFile } from "../project-parser";
import { decodeVivid, encodeVivid, isVividFormat } from "../vivid-format";


const TEST_PROJECT = {
  version: 5,
  project: {
    name: "統合テストモデル",
    width: 400,
    height: 300,
    layers: [],
    parameters: [
      {
        id: "p1",
        name: "テストパラメータ",
        minValue: 0,
        maxValue: 100,
        defaultValue: 50,
      },
    ],
    clips: [],
    scenes: [],
    physicsGroups: [],
    stateMachines: [],
    colliders: [],
    skins: {},
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0.02,
      smoothing: 0.7,
      gain: 2.0,
    },
    expressionPresets: [{ id: "preset-1", name: "笑顔", values: { p1: 80 }, hotkey: 1 }],
  },
  atlases: [],
};

describe("vivid-format → parseViviFile → ViviModel 統合", () => {
  const PASSWORD = "integration-test";

  it("encodeVivid → decodeVivid → parseViviFile → ViviModel.fromFileData の完全パイプライン", async () => {
    const json = JSON.stringify(TEST_PROJECT);

    const encoded = await encodeVivid(json, PASSWORD);
    expect(encoded.byteLength).toBeGreaterThan(0);
    expect(isVividFormat(encoded)).toBe(true);

    const decoded = await decodeVivid(encoded, PASSWORD);
    expect(decoded).toBe(json);

    const fileData = parseViviFile(decoded);
    expect(fileData.version).toBe(5);
    expect(fileData.project.name).toBe("統合テストモデル");

    const model = ViviModel.fromFileData(fileData);
    expect(model.width).toBe(400);
    expect(model.height).toBe(300);
    expect(model.project.parameters).toHaveLength(1);

    model.setParameter("p1", 75);
    expect(model.parameterValues.p1).toBe(75);

    model.applyExpressionPreset("preset-1");
    expect(model.parameterValues.p1).toBe(80);
  });

  it("通常のJSON → parseViviFile → ViviModel.fromJSON のパイプライン", () => {
    const json = JSON.stringify(TEST_PROJECT);
    const model = ViviModel.fromJSON(json);

    expect(model.project.name).toBe("統合テストモデル");
    expect(model.width).toBe(400);

    model.setParameter("p1", 0);
    expect(model.parameterValues.p1).toBe(0);

    model.setParameter("p1", 200);
    expect(model.parameterValues.p1).toBe(100);

    model.resetParameters();
    expect(model.parameterValues.p1).toBe(50); // defaultValue
  });
});
