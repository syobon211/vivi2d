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
    it("単一のパラメータ値を設定する", () => {
      useParameterStore.getState().setParameterValue("param1", 0.5);
      expect(useParameterStore.getState().parameterValues).toEqual({
        param1: 0.5,
      });
    });

    it("複数のパラメータ値を順次設定し、既存値を保持する", () => {
      const { setParameterValue } = useParameterStore.getState();
      setParameterValue("param1", 1.0);
      setParameterValue("param2", 2.0);

      const values = useParameterStore.getState().parameterValues;
      expect(values).toEqual({ param1: 1.0, param2: 2.0 });
    });

    it("既存のパラメータ値を上書きする", () => {
      const { setParameterValue } = useParameterStore.getState();
      setParameterValue("param1", 1.0);
      setParameterValue("param1", 9.9);

      expect(useParameterStore.getState().parameterValues.param1).toBe(9.9);
    });

    it("0 を設定できる", () => {
      useParameterStore.getState().setParameterValue("param1", 0);
      expect(useParameterStore.getState().parameterValues.param1).toBe(0);
    });

    it("負の値を設定できる", () => {
      useParameterStore.getState().setParameterValue("param1", -100);
      expect(useParameterStore.getState().parameterValues.param1).toBe(-100);
    });

    it("小数値を設定できる", () => {
      useParameterStore.getState().setParameterValue("param1", 0.123456789);
      expect(useParameterStore.getState().parameterValues.param1).toBe(0.123456789);
    });

    it("非常に大きい値を設定できる", () => {
      useParameterStore.getState().setParameterValue("param1", Number.MAX_SAFE_INTEGER);
      expect(useParameterStore.getState().parameterValues.param1).toBe(
        Number.MAX_SAFE_INTEGER,
      );
    });
  });

  describe("setAllValues", () => {
    it("空オブジェクトを設定できる", () => {
      useParameterStore.getState().setParameterValue("param1", 1.0);
      useParameterStore.getState().setAllValues({});

      expect(useParameterStore.getState().parameterValues).toEqual({});
    });

    it("複数の値を一括設定する", () => {
      const values = { eyeX: 0.5, eyeY: -0.3, mouthOpen: 1.0 };
      useParameterStore.getState().setAllValues(values);

      expect(useParameterStore.getState().parameterValues).toEqual(values);
    });

    it("既存の値を完全に置き換える（元の値が残らない）", () => {
      const { setParameterValue, setAllValues } = useParameterStore.getState();

      setParameterValue("oldParam", 999);

      setAllValues({ newParam: 1.0 });

      const result = useParameterStore.getState().parameterValues;
      expect(result).toEqual({ newParam: 1.0 });
      expect(result).not.toHaveProperty("oldParam");
    });
  });

  describe("clear", () => {
    it("値がある状態からクリアする", () => {
      const { setParameterValue, clear } = useParameterStore.getState();
      setParameterValue("param1", 1.0);
      setParameterValue("param2", 2.0);

      clear();

      expect(useParameterStore.getState().parameterValues).toEqual({});
    });

    it("空状態からクリアしてもエラーにならない", () => {
      useParameterStore.getState().clear();
      expect(useParameterStore.getState().parameterValues).toEqual({});
    });
  });

  describe("状態の独立性", () => {
    it("setParameterValue が他のパラメータに影響しない", () => {
      const { setParameterValue } = useParameterStore.getState();
      setParameterValue("paramA", 10);
      setParameterValue("paramB", 20);

      setParameterValue("paramA", 99);

      const values = useParameterStore.getState().parameterValues;
      expect(values.paramA).toBe(99);
      expect(values.paramB).toBe(20);
    });

    it("スプレッド演算子により新しいオブジェクト参照が生成される", () => {
      useParameterStore.getState().setParameterValue("param1", 1.0);
      const ref1 = useParameterStore.getState().parameterValues;

      useParameterStore.getState().setParameterValue("param2", 2.0);
      const ref2 = useParameterStore.getState().parameterValues;

      expect(ref1).not.toBe(ref2);
      expect(ref1).toEqual({ param1: 1.0 });
      expect(ref2).toEqual({ param1: 1.0, param2: 2.0 });
    });
  });

  describe("ストアの分離性", () => {
    it("getState() で直接状態を取得できる", () => {
      useParameterStore.getState().setParameterValue("direct", 42);

      const state = useParameterStore.getState();
      expect(state.parameterValues.direct).toBe(42);
      expect(typeof state.setParameterValue).toBe("function");
      expect(typeof state.setAllValues).toBe("function");
      expect(typeof state.clear).toBe("function");
    });

    it("setState() で外部から状態を設定できる", () => {
      useParameterStore.setState({
        parameterValues: { external: 100 },
      });

      expect(useParameterStore.getState().parameterValues).toEqual({
        external: 100,
      });
    });
  });
});
