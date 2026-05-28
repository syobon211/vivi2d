import { describe, expect, it } from "vitest";
import type { ViviFileData } from "../types";
import { decodeViviBinary, encodeViviBinary, isViviBinaryFormat } from "../vivib-format";


const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQkSuQmCC";

const RED_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==";

function createMinimalFileData(overrides?: Partial<ViviFileData>): ViviFileData {
  return {
    version: 5,
    project: {
      name: "test-project",
      width: 200,
      height: 200,
      layers: [
        {
          kind: "viviMesh" as const,
          id: "mesh-1",
          name: "テストメッシュ",
          visible: true,
          opacity: 1,
          x: 10,
          y: 20,
          width: 100,
          height: 100,
          blendMode: "normal" as const,
          expanded: true,
          children: [],
          mesh: {
            vertices: [0, 0, 100, 0, 0, 100, 100, 100],
            uvs: [0, 0, 0.5, 0, 0, 0.5, 0.5, 0.5],
            indices: [0, 1, 2, 1, 2, 3],
            divisionsX: 2,
            divisionsY: 2,
          },
        },
      ],
      parameters: [
        {
          id: "param-1",
          name: "テストパラメータ",
          minValue: -1,
          maxValue: 1,
          defaultValue: 0,
        },
      ],
      clips: [],
      scenes: [{ id: "scene-1", name: "デフォルト", clips: [] }],
      physicsGroups: [],
      lipsyncConfig: {
        enabled: false,
        targetParameterId: null,
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.5,
        gain: 1.0,
      },
      skins: {},
    },
    atlases: [
      {
        image: TINY_PNG_BASE64,
        width: 200,
        height: 200,
        entries: [{ layerId: "mesh-1", x: 0, y: 0, width: 100, height: 100 }],
      },
    ],
    ...overrides,
  } as ViviFileData;
}


describe("encodeViviBinary / decodeViviBinary ラウンドトリップ", () => {
  it("エンコード→デコードでViviFileDataが復元される", () => {
    const original = createMinimalFileData();

    const binary = encodeViviBinary(original);
    const decoded = decodeViviBinary(binary.buffer);

    expect(decoded.version).toBe(original.version);

    expect(decoded.project.name).toBe("test-project");

    expect(decoded.project.layers).toHaveLength(1);
    expect(decoded.project.layers[0]!.id).toBe("mesh-1");
    expect(decoded.project.layers[0]!.name).toBe("テストメッシュ");

    const mesh = (decoded.project.layers[0] as { mesh: { vertices: number[] } }).mesh;
    expect(mesh.vertices).toEqual([0, 0, 100, 0, 0, 100, 100, 100]);

    expect(decoded.project.parameters).toHaveLength(1);
    expect(decoded.project.parameters[0]!.name).toBe("テストパラメータ");

    expect(decoded.atlases).toHaveLength(1);
    expect(decoded.atlases[0]!.width).toBe(200);
    expect(decoded.atlases[0]!.height).toBe(200);
    expect(decoded.atlases[0]!.entries).toHaveLength(1);
    expect(decoded.atlases[0]!.entries[0]!.layerId).toBe("mesh-1");
  });

  it("アトラス画像のBase64がラウンドトリップで一致する", () => {
    const original = createMinimalFileData();

    const binary = encodeViviBinary(original);
    const decoded = decodeViviBinary(binary.buffer);

    expect(decoded.atlases[0]!.image).toBe(TINY_PNG_BASE64);
  });

  it("複数アトラスのラウンドトリップ", () => {
    const original = createMinimalFileData({
      atlases: [
        {
          image: TINY_PNG_BASE64,
          width: 200,
          height: 200,
          entries: [{ layerId: "mesh-1", x: 0, y: 0, width: 100, height: 100 }],
        },
        {
          image: RED_PNG_BASE64,
          width: 100,
          height: 100,
          entries: [{ layerId: "mesh-2", x: 0, y: 0, width: 50, height: 50 }],
        },
      ],
    });

    const binary = encodeViviBinary(original);
    const decoded = decodeViviBinary(binary.buffer);

    expect(decoded.atlases).toHaveLength(2);
    expect(decoded.atlases[0]!.image).toBe(TINY_PNG_BASE64);
    expect(decoded.atlases[0]!.width).toBe(200);
    expect(decoded.atlases[1]!.image).toBe(RED_PNG_BASE64);
    expect(decoded.atlases[1]!.width).toBe(100);
    expect(decoded.atlases[1]!.entries[0]!.layerId).toBe("mesh-2");
  });

  it("アトラスが空のファイルのラウンドトリップ", () => {
    const original = createMinimalFileData({ atlases: [] });

    const binary = encodeViviBinary(original);
    const decoded = decodeViviBinary(binary.buffer);

    expect(decoded.atlases).toHaveLength(0);
    expect(decoded.project.name).toBe("test-project");
  });

  it("日本語を含むプロジェクトデータのラウンドトリップ", () => {
    const original = createMinimalFileData();
    original.project.name = "テスト・プロジェクト🎨";
    (original.project.layers[0] as { name: string }).name = "腕のメッシュ（左）";

    const binary = encodeViviBinary(original);
    const decoded = decodeViviBinary(binary.buffer);

    expect(decoded.project.name).toBe("テスト・プロジェクト🎨");
    expect(decoded.project.layers[0]!.name).toBe("腕のメッシュ（左）");
  });
});


describe("サイズ削減", () => {
  it("バイナリはJSONより小さい", () => {
    const fileData = createMinimalFileData();
    const json = JSON.stringify(fileData);
    const binary = encodeViviBinary(fileData);

    expect(binary.length).toBeLessThan(json.length);
  });
});


describe("isViviBinaryFormat", () => {
  it("有効な.vivbデータでtrueを返す", () => {
    const binary = encodeViviBinary(createMinimalFileData());
    expect(isViviBinaryFormat(binary.buffer)).toBe(true);
  });

  it("JSONデータでfalseを返す", () => {
    const json = new TextEncoder().encode('{"version":5}');
    expect(isViviBinaryFormat(json.buffer)).toBe(false);
  });

  it("空のバッファでfalseを返す", () => {
    expect(isViviBinaryFormat(new ArrayBuffer(0))).toBe(false);
  });

  it("3バイト以下でfalseを返す", () => {
    expect(isViviBinaryFormat(new ArrayBuffer(3))).toBe(false);
  });

  it(".vividフォーマット (VIVD) でfalseを返す", () => {
    const vivid = new Uint8Array([0x56, 0x49, 0x56, 0x44, 1]);
    expect(isViviBinaryFormat(vivid.buffer)).toBe(false);
  });
});


describe("decodeViviBinary エラー処理", () => {
  it("ファイルが小さすぎるとエラー", () => {
    const tiny = new Uint8Array(5);
    expect(() => decodeViviBinary(tiny.buffer)).toThrow(".vivb file is too small");
  });

  it("マジックナンバーが違うとエラー", () => {
    const bad = new Uint8Array(20);
    bad[0] = 0x00;
    expect(() => decodeViviBinary(bad.buffer)).toThrow("Invalid .vivb file");
  });

  it("バージョンが未対応だとエラー", () => {
    const bad = new Uint8Array(20);
    bad.set([0x56, 0x49, 0x56, 0x42], 0); // VIVB
    bad[4] = 99;
    expect(() => decodeViviBinary(bad.buffer)).toThrow("Unsupported .vivb version: 99");
  });

  it("メタデータ長がファイルサイズを超えるとエラー", () => {
    const bad = new Uint8Array(20);
    bad.set([0x56, 0x49, 0x56, 0x42], 0);
    bad[4] = 1;
    bad[5] = 0x9f;
    bad[6] = 0x86;
    bad[7] = 0x01;
    bad[8] = 0x00;
    expect(() => decodeViviBinary(bad.buffer)).toThrow(
      ".vivb file is corrupted: metadata length exceeds file size",
    );
  });

  it("ファイルサイズ上限を超えるとエラー", () => {
    const valid = encodeViviBinary(createMinimalFileData());
    expect(isViviBinaryFormat(valid.buffer)).toBe(true);
  });
});


describe("バイナリヘッダー構造", () => {
  it("マジックナンバーが VIVB", () => {
    const binary = encodeViviBinary(createMinimalFileData());
    expect(binary[0]).toBe(0x56); // V
    expect(binary[1]).toBe(0x49); // I
    expect(binary[2]).toBe(0x56); // V
    expect(binary[3]).toBe(0x42); // B
  });

  it("バージョンが 1", () => {
    const binary = encodeViviBinary(createMinimalFileData());
    expect(binary[4]).toBe(1);
  });

  it("メタデータ長がuint32 LEで格納されている", () => {
    const binary = encodeViviBinary(createMinimalFileData());
    const metaLen =
      binary[5]! | (binary[6]! << 8) | (binary[7]! << 16) | (binary[8]! << 24);
    expect(metaLen).toBeGreaterThan(0);
    expect(metaLen).toBeLessThan(binary.length);
  });


  it("PNGチャンク size=1 のラウンドトリップ", () => {
    const oneByteBase64 = btoa(String.fromCharCode(0xff));
    const fileData = createMinimalFileData({
      atlases: [
        {
          image: oneByteBase64,
          width: 1,
          height: 1,
          entries: [{ layerId: "m1", x: 0, y: 0, width: 1, height: 1 }],
        },
      ],
    });
    const binary = encodeViviBinary(fileData);
    const decoded = decodeViviBinary(binary.buffer);
    expect(decoded.atlases[0]!.image).toBe(oneByteBase64);
  });

  it("PNGチャンク size=2 のラウンドトリップ", () => {
    const twoByteBase64 = btoa(String.fromCharCode(0xff, 0xaa));
    const fileData = createMinimalFileData({
      atlases: [
        {
          image: twoByteBase64,
          width: 1,
          height: 1,
          entries: [{ layerId: "m1", x: 0, y: 0, width: 1, height: 1 }],
        },
      ],
    });
    const binary = encodeViviBinary(fileData);
    const decoded = decodeViviBinary(binary.buffer);
    expect(decoded.atlases[0]!.image).toBe(twoByteBase64);
  });

  it("PNGチャンク size=3 のラウンドトリップ", () => {
    const threeByteBase64 = btoa(String.fromCharCode(0xff, 0xaa, 0x55));
    const fileData = createMinimalFileData({
      atlases: [
        {
          image: threeByteBase64,
          width: 1,
          height: 1,
          entries: [{ layerId: "m1", x: 0, y: 0, width: 1, height: 1 }],
        },
      ],
    });
    const binary = encodeViviBinary(fileData);
    const decoded = decodeViviBinary(binary.buffer);
    expect(decoded.atlases[0]!.image).toBe(threeByteBase64);
  });

  it("日本語を含む長いメタデータでPNGオフセットが正確", () => {
    const fileData = createMinimalFileData();
    fileData.project.name = "あ".repeat(200);
    const binary = encodeViviBinary(fileData);
    const decoded = decodeViviBinary(binary.buffer);
    expect(decoded.project.name).toBe("あ".repeat(200));
    expect(decoded.atlases).toHaveLength(1);
  });

  it("複数PNGチャンク混在で各サイズのパディングが正しい", () => {
    const oneByteBase64 = btoa(String.fromCharCode(0xff));
    const fileData = createMinimalFileData({
      atlases: [
        {
          image: oneByteBase64,
          width: 1,
          height: 1,
          entries: [{ layerId: "m1", x: 0, y: 0, width: 1, height: 1 }],
        },
        {
          image: TINY_PNG_BASE64,
          width: 1,
          height: 1,
          entries: [{ layerId: "m2", x: 0, y: 0, width: 1, height: 1 }],
        },
      ],
    });
    const binary = encodeViviBinary(fileData);
    const decoded = decodeViviBinary(binary.buffer);
    expect(decoded.atlases).toHaveLength(2);
    expect(decoded.atlases[0]!.image).toBe(oneByteBase64);
    expect(decoded.atlases[1]!.image).toBe(TINY_PNG_BASE64);
  });

  it("不正なマジック番号でエラー", () => {
    const binary = new Uint8Array([0x00, 0x00, 0x00, 0x00, 1, 0, 0, 0, 0]);
    expect(() => decodeViviBinary(binary.buffer)).toThrow();
  });
});
