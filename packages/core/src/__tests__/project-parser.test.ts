import { describe, expect, it } from "vitest";
import { parseViviFile } from "../project-parser";


function createMinimalViviObject(version: number = 4) {
  return {
    version,
    project: {
      name: "テスト",
      width: 800,
      height: 600,
      layers: [],
      parameters: [],
      clips: [],
      scenes: [],
      physicsGroups: [],
      lipsyncConfig: {
        enabled: false,
        targetParameterId: null,
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2.0,
      },
      skins: {},
    },
    atlases: [],
  };
}

describe("parseViviFile", () => {

  describe("正常系", () => {
    it("有効なv4ファイルを正常にパースできる", () => {
      const obj = createMinimalViviObject(4);
      const result = parseViviFile(JSON.stringify(obj));
      expect(result.version).toBe(4);
      expect(result.project.layers).toEqual([]);
      expect(result.project.parameters).toEqual([]);
      expect(result.atlases).toEqual([]);
    });

    it("有効なv1ファイルを正常にパースできる", () => {
      const obj = createMinimalViviObject(1);
      const result = parseViviFile(JSON.stringify(obj));
      expect(result.version).toBe(1);
    });

    it("有効なv2ファイルを正常にパースできる", () => {
      const obj = createMinimalViviObject(2);
      const result = parseViviFile(JSON.stringify(obj));
      expect(result.version).toBe(2);
    });

    it("有効なv3ファイルを正常にパースできる", () => {
      const obj = createMinimalViviObject(3);
      const result = parseViviFile(JSON.stringify(obj));
      expect(result.version).toBe(3);
    });

    it("有効なv5ファイルを正常にパースできる", () => {
      const obj = createMinimalViviObject(5);
      const result = parseViviFile(JSON.stringify(obj));
      expect(result.version).toBe(5);
    });

    it("v5ファイルのcolliders/stateMachinesが保持される", () => {
      const obj = createMinimalViviObject(5);
      (obj.project as Record<string, unknown>).colliders = [
        {
          id: "c1",
          name: "頭",
          shape: { type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
          enabled: true,
        },
      ];
      (obj.project as Record<string, unknown>).stateMachines = [
        {
          id: "sm1",
          name: "表情",
          states: [{ id: "s1", name: "idle", loop: true }],
          transitions: [],
          initialStateId: "s1",
          enabled: true,
        },
      ];
      const result = parseViviFile(JSON.stringify(obj));
      expect(result.version).toBe(5);
      expect((result.project as any).colliders).toHaveLength(1);
      expect((result.project as any).stateMachines).toHaveLength(1);
    });

    it("空のプロジェクト（最小構成）を正常にパースできる", () => {
      const obj = {
        version: 4,
        project: {
          layers: [],
          parameters: [],
        },
        atlases: [],
      };
      const result = parseViviFile(JSON.stringify(obj));
      expect(result.version).toBe(4);
      expect(result.project.layers).toEqual([]);
      expect(result.project.parameters).toEqual([]);
    });
  });


  describe("JSONパースエラー", () => {
    it("不正なJSON文字列でエラーを投げる", () => {
      expect(() => parseViviFile("{invalid json")).toThrow(
        "Failed to parse .vivi file: invalid JSON",
      );
    });

    it("JSON配列（オブジェクトでない）でエラーを投げる", () => {
      expect(() => parseViviFile("[1, 2, 3]")).toThrow(
        "Failed to parse .vivi file: root value is not an object",
      );
    });

    it("nullでエラーを投げる", () => {
      expect(() => parseViviFile("null")).toThrow(
        "Failed to parse .vivi file: root value is not an object",
      );
    });
  });


  describe("versionバリデーション", () => {
    it("versionフィールドなしでエラーを投げる", () => {
      const obj = {
        project: { layers: [], parameters: [] },
        atlases: [],
      };
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Invalid .vivi file version: undefined",
      );
    });

    it("version=0でエラーを投げる", () => {
      const obj = {
        version: 0,
        project: { layers: [], parameters: [] },
        atlases: [],
      };
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Invalid .vivi file version: 0",
      );
    });

    it("version=6でエラーを投げる", () => {
      const obj = {
        version: 11,
        project: { layers: [], parameters: [] },
        atlases: [],
      };
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Invalid .vivi file version: 11",
      );
    });
  });


  describe("projectバリデーション", () => {
    it("projectフィールドなしでエラーを投げる", () => {
      const obj = {
        version: 4,
        atlases: [],
      };
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        ".vivi file is missing the project field",
      );
    });

    it("projectが配列でエラーを投げる", () => {
      const obj = {
        version: 4,
        project: [],
        atlases: [],
      };
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow();
    });
  });


  describe("atlasesバリデーション", () => {
    it("atlasesフィールドなしでエラーを投げる", () => {
      const obj = {
        version: 4,
        project: { layers: [], parameters: [] },
      };
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        ".vivi file is missing the atlases field",
      );
    });

    it("atlasesがオブジェクト（配列でない）でエラーを投げる", () => {
      const obj = {
        version: 4,
        project: { layers: [], parameters: [] },
        atlases: {},
      };
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        ".vivi file is missing the atlases field",
      );
    });
  });


  describe("project内部フィールドバリデーション", () => {
    it("layersフィールドなしでエラーを投げる", () => {
      const obj = {
        version: 4,
        project: { parameters: [] },
        atlases: [],
      };
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        ".vivi file is missing the layers field",
      );
    });

    it("parametersフィールドなしでエラーを投げる", () => {
      const obj = {
        version: 4,
        project: { layers: [] },
        atlases: [],
      };
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        ".vivi file is missing the parameters field",
      );
    });
  });


  describe("layers構造バリデーション", () => {
    it("レイヤーが kind を持たない場合にエラー", () => {
      const obj = createMinimalViviObject(5);
      obj.project.layers = [{ id: "x", name: "y" } as never];
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Failed to parse .vivi file: project.layers[0].kind is invalid",
      );
    });

    it("レイヤーの kind が未知の値ならエラー", () => {
      const obj = createMinimalViviObject(5);
      obj.project.layers = [{ id: "x", kind: "unknownKind" } as never];
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Failed to parse .vivi file: project.layers[0].kind is invalid",
      );
    });

    it("レイヤーの id が空文字ならエラー", () => {
      const obj = createMinimalViviObject(5);
      obj.project.layers = [{ id: "", kind: "viviMesh" } as never];
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Failed to parse .vivi file: project.layers[0].id is invalid",
      );
    });

    it("children が配列でなければエラー", () => {
      const obj = createMinimalViviObject(5);
      obj.project.layers = [{ id: "g", kind: "group", children: "not-array" } as never];
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Failed to parse .vivi file: project.layers[0].children is not an array",
      );
    });

    it("ネストされた子レイヤーの kind もチェックされる", () => {
      const obj = createMinimalViviObject(5);
      obj.project.layers = [
        {
          id: "g",
          kind: "group",
          children: [{ id: "x", kind: "badKind" }],
        } as never,
      ];
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Failed to parse .vivi file: project.layers[0].children[0].kind is invalid",
      );
    });
  });


  describe("atlases構造バリデーション", () => {
    it("atlases 要素がオブジェクトでなければエラー", () => {
      const obj = createMinimalViviObject(5);
      obj.atlases = [null as never];
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Failed to parse .vivi file: atlases[0] is not an object",
      );
    });

    it("atlases 要素の image が文字列でなければエラー", () => {
      const obj = createMinimalViviObject(5);
      obj.atlases = [{ image: 123, width: 128, height: 128, entries: [] } as never];
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Failed to parse .vivi file: atlases[0].image is not a string",
      );
    });

    it("atlases 要素の entries が配列でなければエラー", () => {
      const obj = createMinimalViviObject(5);
      obj.atlases = [
        { image: "data:png", width: 128, height: 128, entries: {} } as never,
      ];
      expect(() => parseViviFile(JSON.stringify(obj))).toThrow(
        "Failed to parse .vivi file: atlases[0].entries is not an array",
      );
    });
  });

  describe("Zod 正規化の返却", () => {
    it("skins の __proto__ キーが parseViviFile の結果から除去される", () => {
      const raw = `{"version":5,"project":{"name":"t","width":8,"height":8,"layers":[],"parameters":[],"clips":[],"scenes":[],"physicsGroups":[],"lipsyncConfig":{"enabled":false,"targetParameterId":null,"source":"microphone","threshold":0.02,"smoothing":0.7,"gain":2},"skins":{"__proto__":{"weights":[],"bindPoseInverse":{}}}},"atlases":[]}`;
      const result = parseViviFile(raw);
      expect(Object.keys(result.project.skins ?? {})).not.toContain("__proto__");
    });
  });
});
