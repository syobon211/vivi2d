import { beforeEach, describe, expect, it } from "vitest";
import { useParameterStore } from "@/stores/parameterStore";
import { resetParameterStore } from "@/test/store-reset";

describe("parameterStore", () => {
  beforeEach(() => resetParameterStore());

  describe("初期状態", () => {
    it("parameterValues が空オブジェクトである", () => {
      const state = useParameterStore.getState();
      expect(state.parameterValues).toEqual({});
    });
  });

  describe("setParameterValue", () => {
    it("数値をそのまま独立保存し上書き・一括置換・clearを検証する", () => {
      const { setParameterValue, setAllValues, clear } = useParameterStore.getState();
      setParameterValue("param1", 0.5);
      const previous = useParameterStore.getState().parameterValues;
      expect(previous).toEqual({ param1: 0.5 });
      setParameterValue("zero", 0);
      setParameterValue("negative", -100);
      setParameterValue("fraction", 0.123456789);
      setParameterValue("large", Number.MAX_SAFE_INTEGER);
      expect(useParameterStore.getState().parameterValues).toEqual({
        param1: 0.5, zero: 0, negative: -100,
        fraction: 0.123456789, large: Number.MAX_SAFE_INTEGER,
      });
      expect(useParameterStore.getState().parameterValues).not.toBe(previous);
      expect(previous).toEqual({ param1: 0.5 });
      setParameterValue("param1", 9.9);
      expect(useParameterStore.getState().parameterValues).toEqual({
        param1: 9.9, zero: 0, negative: -100,
        fraction: 0.123456789, large: Number.MAX_SAFE_INTEGER,
      });
      const values = { eyeX: 0.5, eyeY: -0.3, mouthOpen: 1 };
      setAllValues(values);
      expect(useParameterStore.getState().parameterValues).toEqual(values);
      expect(useParameterStore.getState().parameterValues).not.toHaveProperty("param1");
      setAllValues({});
      expect(useParameterStore.getState().parameterValues).toEqual({});
      setParameterValue("param1", 1);
      setParameterValue("param2", 2);
      clear();
      expect(useParameterStore.getState().parameterValues).toEqual({});
      clear();
      expect(useParameterStore.getState().parameterValues).toEqual({});
    });












  });




});
