import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import { withStandardMiddleware } from "../_middleware";


interface CounterState {
  count: number;
  increment: () => void;
  reset: () => void;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("withStandardMiddleware (P9-1)", () => {
  it("immer 経由で draft mutation が動作する", () => {
    const useStore = create<CounterState>()(
      withStandardMiddleware<CounterState>(
        (set) => ({
          count: 0,
          increment: () =>
            set((s) => {
              s.count += 1;
            }),
          reset: () =>
            set((s) => {
              s.count = 0;
            }),
        }),
        { name: "TestImmerStore" },
      ),
    );

    expect(useStore.getState().count).toBe(0);
    useStore.getState().increment();
    useStore.getState().increment();
    expect(useStore.getState().count).toBe(2);
    useStore.getState().reset();
    expect(useStore.getState().count).toBe(0);
  });

  it("persist が localStorage に state を書き込む", () => {
    const useStore = create<CounterState>()(
      withStandardMiddleware<CounterState>(
        (set) => ({
          count: 0,
          increment: () =>
            set((s) => {
              s.count += 1;
            }),
          reset: () =>
            set((s) => {
              s.count = 0;
            }),
        }),
        { name: "TestPersistStore" },
      ),
    );

    useStore.getState().increment();
    useStore.getState().increment();
    useStore.getState().increment();

    const raw = localStorage.getItem("TestPersistStore");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.count).toBe(3);
  });

  it("partialize で persist する範囲を絞れる", () => {
    interface DualState {
      a: number;
      b: number;
      bumpA: () => void;
      bumpB: () => void;
    }
    const useStore = create<DualState>()(
      withStandardMiddleware<DualState>(
        (set) => ({
          a: 0,
          b: 0,
          bumpA: () =>
            set((s) => {
              s.a += 1;
            }),
          bumpB: () =>
            set((s) => {
              s.b += 1;
            }),
        }),
        {
          name: "TestPartializeStore",
          partialize: (s) => ({ a: s.a }),
        },
      ),
    );

    useStore.getState().bumpA();
    useStore.getState().bumpB();

    const raw = localStorage.getItem("TestPartializeStore");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state).toEqual({ a: 1 });
    expect(parsed.state.b).toBeUndefined();
  });

  it("subscribeWithSelector で selector 駆動の購読が動く", () => {
    const useStore = create<CounterState>()(
      withStandardMiddleware<CounterState>(
        (set) => ({
          count: 0,
          increment: () =>
            set((s) => {
              s.count += 1;
            }),
          reset: () =>
            set((s) => {
              s.count = 0;
            }),
        }),
        { name: "TestSubscribeStore" },
      ),
    );

    const observed: number[] = [];
    const unsub = useStore.subscribe(
      (s) => s.count,
      (count) => {
        observed.push(count);
      },
    );

    useStore.getState().increment();
    useStore.getState().increment();
    useStore.getState().reset();

    expect(observed).toEqual([1, 2, 0]);
    unsub();
  });

  it("persistEnabled=false で localStorage に書き込まない", () => {
    const useStore = create<CounterState>()(
      withStandardMiddleware<CounterState>(
        (set) => ({
          count: 0,
          increment: () =>
            set((s) => {
              s.count += 1;
            }),
          reset: () =>
            set((s) => {
              s.count = 0;
            }),
        }),
        { name: "TestNoPersistStore", persistEnabled: false },
      ),
    );

    useStore.getState().increment();
    expect(localStorage.getItem("TestNoPersistStore")).toBeNull();
    expect(useStore.getState().count).toBe(1);
  });

  it("devtoolsEnabled=false でも store は正常生成される", () => {
    const useStore = create<CounterState>()(
      withStandardMiddleware<CounterState>(
        (set) => ({
          count: 0,
          increment: () =>
            set((s) => {
              s.count += 1;
            }),
          reset: () =>
            set((s) => {
              s.count = 0;
            }),
        }),
        { name: "TestNoDevtoolsStore", devtoolsEnabled: false },
      ),
    );

    expect(useStore.getState().count).toBe(0);
    useStore.getState().increment();
    expect(useStore.getState().count).toBe(1);
  });
});
