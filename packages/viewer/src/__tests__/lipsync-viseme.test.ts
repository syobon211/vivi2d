import { describe, expect, it } from "vitest";
import type { Vowel } from "../tracking/lipsync-analyser";
import { vowelToMouthParams } from "../tracking/lipsync-analyser";


describe("vowelToMouthParams", () => {
  const FULL_VOLUME = 1.0;

  describe("母音ごとの形状", () => {
    it('"a" — 口を大きく開く（mouthOpen高, mouthForm中央）', () => {
      const { mouthOpen, mouthForm } = vowelToMouthParams("a", FULL_VOLUME);
      expect(mouthOpen).toBe(1.0);
      expect(mouthForm).toBe(0.5);
    });

    it('"i" — 口を横に引く（mouthOpen低, mouthForm高）', () => {
      const { mouthOpen, mouthForm } = vowelToMouthParams("i", FULL_VOLUME);
      expect(mouthOpen).toBeCloseTo(0.3, 5);
      expect(mouthForm).toBe(0.8);
    });

    it('"u" — 口をすぼめる（mouthOpen低, mouthForm低）', () => {
      const { mouthOpen, mouthForm } = vowelToMouthParams("u", FULL_VOLUME);
      expect(mouthOpen).toBeCloseTo(0.4, 5);
      expect(mouthForm).toBe(0.2);
    });

    it('"e" — 口を中開きで横引き（mouthOpen中, mouthForm高）', () => {
      const { mouthOpen, mouthForm } = vowelToMouthParams("e", FULL_VOLUME);
      expect(mouthOpen).toBeCloseTo(0.5, 5);
      expect(mouthForm).toBe(0.7);
    });

    it('"o" — 口を丸く開く（mouthOpen中, mouthForm低）', () => {
      const { mouthOpen, mouthForm } = vowelToMouthParams("o", FULL_VOLUME);
      expect(mouthOpen).toBeCloseTo(0.6, 5);
      expect(mouthForm).toBe(0.3);
    });

    it('"silent" — 口を閉じる（mouthOpen=0, mouthForm=0.5）', () => {
      const { mouthOpen, mouthForm } = vowelToMouthParams("silent", FULL_VOLUME);
      expect(mouthOpen).toBe(0);
      expect(mouthForm).toBe(0.5);
    });
  });

  describe("volume=0 でのスケーリング", () => {
    const allVowels: Vowel[] = ["a", "i", "u", "e", "o", "silent"];

    it("全母音でmouthOpen=0になる", () => {
      for (const vowel of allVowels) {
        const { mouthOpen } = vowelToMouthParams(vowel, 0);
        expect(mouthOpen).toBe(0);
      }
    });
  });

  describe("volume上限クランプ", () => {
    const allVowels: Vowel[] = ["a", "i", "u", "e", "o", "silent"];

    it("volume=1でmouthOpenが1を超えない", () => {
      for (const vowel of allVowels) {
        const { mouthOpen } = vowelToMouthParams(vowel, 1);
        expect(mouthOpen).toBeLessThanOrEqual(1);
        expect(mouthOpen).toBeGreaterThanOrEqual(0);
      }
    });

    it("volume>1でもゲイン補正後にクランプされmouthOpen<=1", () => {
      for (const vowel of allVowels) {
        const { mouthOpen } = vowelToMouthParams(vowel, 2);
        expect(mouthOpen).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("mouthFormの不変性", () => {
    it("volumeが変わってもmouthFormは同じ値を返す", () => {
      const vowels: Vowel[] = ["a", "i", "u", "e", "o"];
      for (const vowel of vowels) {
        const low = vowelToMouthParams(vowel, 0.2);
        const high = vowelToMouthParams(vowel, 0.8);
        expect(low.mouthForm).toBe(high.mouthForm);
      }
    });
  });

  describe("中間ボリュームの挙動", () => {
    it('volume=0.5 で "a" のmouthOpenは0.75になる', () => {
      const { mouthOpen } = vowelToMouthParams("a", 0.5);
      expect(mouthOpen).toBeCloseTo(0.75, 5);
    });

    it("volumeが大きいほどmouthOpenも大きい", () => {
      const low = vowelToMouthParams("a", 0.2);
      const mid = vowelToMouthParams("a", 0.4);
      const high = vowelToMouthParams("a", 0.6);
      expect(low.mouthOpen).toBeLessThan(mid.mouthOpen);
      expect(mid.mouthOpen).toBeLessThan(high.mouthOpen);
    });
  });
});
