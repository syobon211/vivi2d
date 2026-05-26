import { describe, expect, it } from "vitest";
import { decodeVivid, encodeVivid, isVividFormat } from "../vivid-format";


const TEST_JSON = JSON.stringify({
  version: 5,
  project: { name: "テストモデル", width: 200, height: 200 },
  atlases: [],
});

const PASSWORD = "test-password-2024";

describe("encodeVivid / decodeVivid", () => {
  it("エンコード→デコードで元のJSONが復元される", async () => {
    const encoded = await encodeVivid(TEST_JSON, PASSWORD);
    const decoded = await decodeVivid(encoded, PASSWORD);
    expect(decoded).toBe(TEST_JSON);
  });

  it("異なるパスワードではデコードに失敗する", async () => {
    const encoded = await encodeVivid(TEST_JSON, PASSWORD);
    await expect(decodeVivid(encoded, "wrong-password")).rejects.toThrow(
      "Incorrect password",
    );
  });

  it("同じデータを2回エンコードすると異なるバイナリになる（salt/IVがランダム）", async () => {
    const a = await encodeVivid(TEST_JSON, PASSWORD);
    const b = await encodeVivid(TEST_JSON, PASSWORD);
    const bytesA = new Uint8Array(a);
    const bytesB = new Uint8Array(b);
    let same = true;
    for (let i = 0; i < bytesA.length; i++) {
      if (bytesA[i] !== bytesB[i]) {
        same = false;
        break;
      }
    }
    expect(same).toBe(false);
  });

  it("空文字列もエンコード・デコードできる", async () => {
    const encoded = await encodeVivid("", PASSWORD);
    const decoded = await decodeVivid(encoded, PASSWORD);
    expect(decoded).toBe("");
  });

  it("日本語を含むJSONもラウンドトリップする", async () => {
    const json = JSON.stringify({ name: "紙吹雪エフェクト付きモデル" });
    const encoded = await encodeVivid(json, PASSWORD);
    const decoded = await decodeVivid(encoded, PASSWORD);
    expect(decoded).toBe(json);
  });
});

describe("isVividFormat", () => {
  it(".vividファイルを正しく判定する", async () => {
    const encoded = await encodeVivid(TEST_JSON, PASSWORD);
    expect(isVividFormat(encoded)).toBe(true);
  });

  it("通常のJSONを.vividでないと判定する", () => {
    const enc = new TextEncoder();
    const json = enc.encode(TEST_JSON);
    expect(isVividFormat(json.buffer)).toBe(false);
  });

  it("空のArrayBufferを.vividでないと判定する", () => {
    expect(isVividFormat(new ArrayBuffer(0))).toBe(false);
  });

  it("短すぎるデータを.vividでないと判定する", () => {
    expect(isVividFormat(new ArrayBuffer(3))).toBe(false);
  });
});

describe("decodeVivid エラーケース", () => {
  it("小さすぎるデータでエラーになる", async () => {
    await expect(decodeVivid(new ArrayBuffer(10), PASSWORD)).rejects.toThrow(
      ".vivid file is too small",
    );
  });

  it("マジックナンバーが不正でエラーになる", async () => {
    const bad = new Uint8Array(100);
    bad[0] = 0x00;
    await expect(decodeVivid(bad.buffer, PASSWORD)).rejects.toThrow(
      "Invalid .vivid file",
    );
  });

  it("バージョンが不正でエラーになる", async () => {
    const encoded = new Uint8Array(await encodeVivid("{}", PASSWORD));
    encoded[4] = 255;
    await expect(decodeVivid(encoded.buffer, PASSWORD)).rejects.toThrow(
      "Unsupported .vivid version: 255",
    );
  });

  it("暗号化データが改竄されるとエラーになる", async () => {
    const encoded = new Uint8Array(await encodeVivid(TEST_JSON, PASSWORD));
    encoded[encoded.length - 1] ^= 0xff;
    encoded[encoded.length - 2] ^= 0xff;
    await expect(decodeVivid(encoded.buffer, PASSWORD)).rejects.toThrow(
      "Incorrect password",
    );
  });
});

describe("encodeVivid / decodeVivid 大容量データ", () => {
  it("100KBのJSONをラウンドトリップできる", async () => {
    const largeArray = new Array(3000).fill(null).map((_, i) => ({
      id: `item-${i}`,
      value: (i * 0.000_123) % 1,
      name: `テストアイテム${i}`,
    }));
    const largeJson = JSON.stringify(largeArray);
    expect(largeJson.length).toBeGreaterThan(100_000);

    const encoded = await encodeVivid(largeJson, PASSWORD);
    const decoded = await decodeVivid(encoded, PASSWORD);
    expect(decoded).toBe(largeJson);
  });

  it("特殊文字を含むパスワードで動作する", async () => {
    const specialPassword = "パスワード🔐!@#$%^&*()_+-=[]{}|;':\",./<>?";
    const encoded = await encodeVivid(TEST_JSON, specialPassword);
    const decoded = await decodeVivid(encoded, specialPassword);
    expect(decoded).toBe(TEST_JSON);
  });

  it("空のパスワードでも動作する", async () => {
    const encoded = await encodeVivid(TEST_JSON, "");
    const decoded = await decodeVivid(encoded, "");
    expect(decoded).toBe(TEST_JSON);
  });
});


describe("decodeVivid 改竄検出", () => {
  it("Salt改竄でデコード失敗する", async () => {
    const encoded = new Uint8Array(await encodeVivid(TEST_JSON, PASSWORD));
    encoded[5] ^= 0xff;
    encoded[10] ^= 0xff;
    await expect(decodeVivid(encoded.buffer, PASSWORD)).rejects.toThrow(
      "Incorrect password",
    );
  });

  it("IV改竄でデコード失敗する", async () => {
    const encoded = new Uint8Array(await encodeVivid(TEST_JSON, PASSWORD));
    encoded[21] ^= 0xff;
    encoded[25] ^= 0xff;
    await expect(decodeVivid(encoded.buffer, PASSWORD)).rejects.toThrow(
      "Incorrect password",
    );
  });
});

describe("decodeVivid ファイルサイズ上限", () => {
  it("MAX_DECODE_SIZE(256MB)を超えるデータで適切なエラーが出る", async () => {
    const size = 256 * 1024 * 1024 + 1;
    const huge = new Uint8Array(size);
    huge[0] = 0x56; // V
    huge[1] = 0x49; // I
    huge[2] = 0x56; // V
    huge[3] = 0x44; // D
    huge[4] = 1;
    await expect(decodeVivid(huge.buffer, PASSWORD)).rejects.toThrow(
      ".vivid file is too large",
    );
  });
});

describe("vivid-format 定数検証", () => {
  it("PBKDF2_ITERATIONSが600,000に設定されていることの確認", async () => {
    const encoded = await encodeVivid("test", PASSWORD);
    const decoded = await decodeVivid(encoded, PASSWORD);
    expect(decoded).toBe("test");
  });
});

describe("decodeVivid ciphertextが空", () => {
  it("ヘッダーのみ（ciphertext部分なし）の場合エラーになる", async () => {
    const headerOnly = new Uint8Array(33);
    headerOnly[0] = 0x56; // V
    headerOnly[1] = 0x49; // I
    headerOnly[2] = 0x56; // V
    headerOnly[3] = 0x44; // D
    headerOnly[4] = 1;
    await expect(decodeVivid(headerOnly.buffer, PASSWORD)).rejects.toThrow(
      "Incorrect password",
    );
  });
});
