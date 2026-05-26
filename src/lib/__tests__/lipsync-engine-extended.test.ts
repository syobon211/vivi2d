import { describe, expect, it } from "vitest";
import { detectViseme } from "../lipsync-engine";

// ============================================================
// detectViseme
// ============================================================

describe("detectViseme", () => {
  it("無音(total < threshold)で 'sil' を返す", () => {
    const result = detectViseme({ low: 0, mid: 0, high: 0 });
    expect(result.viseme).toBe("sil");
    expect(result.confidence).toBe(1);
  });

  it("total がちょうど threshold 未満で 'sil' を返す", () => {
    const result = detectViseme({ low: 0.01, mid: 0.01, high: 0.02 }, 0.05);
    expect(result.viseme).toBe("sil");
  });

  it("高域優位で 'ss' を返す（highRatio > 0.65）", () => {
    const result = detectViseme({ low: 0.1, mid: 0.1, high: 0.8 });
    expect(result.viseme).toBe("ss");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("高域優位で 'ff' を返す（0.5 < highRatio <= 0.65）", () => {
    const result = detectViseme({ low: 0.2, mid: 0.2, high: 0.6 });
    expect(result.viseme).toBe("ff");
  });

  it("低域優位で 'aa' を返す（lowRatio > 0.7）", () => {
    const result = detectViseme({ low: 0.8, mid: 0.1, high: 0.1 });
    expect(result.viseme).toBe("aa");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("低域優位で mid が一定以上なら 'oh' を返す", () => {
    const result = detectViseme({ low: 0.6, mid: 0.25, high: 0.15 });
    expect(result.viseme).toBe("oh");
  });

  it("低域優位で mid が低いと 'ou' を返す", () => {
    const result = detectViseme({ low: 0.55, mid: 0.15, high: 0.3 });
    expect(result.viseme).toBe("ou");
  });

  it("中域優位で bands.mid > 0.3 なら 'eh' を返す", () => {
    const result = detectViseme({ low: 0.2, mid: 0.5, high: 0.2 });
    expect(result.viseme).toBe("eh");
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it("中域優位で bands.mid <= 0.3 なら 'ih' を返す", () => {
    const result = detectViseme({ low: 0.15, mid: 0.25, high: 0.1 });
    expect(result.viseme).toBe("ih");
  });

  it("バランス良い分布では 'nn' or 破裂音系を返す", () => {
    const result = detectViseme({ low: 0.35, mid: 0.35, high: 0.3 });
    expect(["pp", "kk"]).toContain(result.viseme);
  });

  it("カスタム threshold を使える", () => {
    const result = detectViseme({ low: 0.1, mid: 0.1, high: 0.1 }, 0.5);
    expect(result.viseme).toBe("sil");
  });

  it("非常に大きな値でもクラッシュしない", () => {
    const result = detectViseme({ low: 100, mid: 50, high: 25 });
    expect(result.viseme).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("sil の confidence は常に 1", () => {
    const result = detectViseme({ low: 0, mid: 0, high: 0 });
    expect(result.viseme).toBe("sil");
    expect(result.confidence).toBe(1);
  });
});
