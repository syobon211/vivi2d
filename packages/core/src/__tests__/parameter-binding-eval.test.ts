import { describe, expect, it } from "vitest";
import {
  evaluateBindingsAdditive,
  interpolateBindingPoints,
} from "../parameter-binding-eval";
import type { ParameterBinding, ParameterBindingPoint } from "../types";

describe("interpolateBindingPoints", () => {
  it("returns the default value for an empty point list", () => {
    expect(interpolateBindingPoints([], 0.5, 100)).toBe(100);
  });

  it("returns the target value when only one point exists", () => {
    const bindingPoints: ParameterBindingPoint[] = [{ paramValue: 0.5, targetValue: 42 }];

    expect(interpolateBindingPoints(bindingPoints, 0, 0)).toBe(42);
  });

  it("linearly interpolates between two points", () => {
    const bindingPoints: ParameterBindingPoint[] = [
      { paramValue: 0, targetValue: 0 },
      { paramValue: 1, targetValue: 100 },
    ];

    expect(interpolateBindingPoints(bindingPoints, 0.25, 0)).toBe(25);
    expect(interpolateBindingPoints(bindingPoints, 0.5, 0)).toBe(50);
    expect(interpolateBindingPoints(bindingPoints, 0.75, 0)).toBe(75);
  });

  it("linearly interpolates across the matching segment", () => {
    const bindingPoints: ParameterBindingPoint[] = [
      { paramValue: 0, targetValue: 0 },
      { paramValue: 0.5, targetValue: 100 },
      { paramValue: 1, targetValue: 50 },
    ];

    expect(interpolateBindingPoints(bindingPoints, 0.25, 0)).toBe(50);
    expect(interpolateBindingPoints(bindingPoints, 0.75, 0)).toBe(75);
  });

  it("clamps values below the first point", () => {
    const bindingPoints: ParameterBindingPoint[] = [
      { paramValue: 0.2, targetValue: 10 },
      { paramValue: 0.8, targetValue: 90 },
    ];

    expect(interpolateBindingPoints(bindingPoints, 0, 0)).toBe(10);
    expect(interpolateBindingPoints(bindingPoints, -100, 0)).toBe(10);
  });

  it("clamps values above the last point", () => {
    const bindingPoints: ParameterBindingPoint[] = [
      { paramValue: 0.2, targetValue: 10 },
      { paramValue: 0.8, targetValue: 90 },
    ];

    expect(interpolateBindingPoints(bindingPoints, 1, 0)).toBe(90);
    expect(interpolateBindingPoints(bindingPoints, 999, 0)).toBe(90);
  });

  it("returns exact values on binding points", () => {
    const bindingPoints: ParameterBindingPoint[] = [
      { paramValue: 0, targetValue: 10 },
      { paramValue: 0.5, targetValue: 50 },
      { paramValue: 1, targetValue: 90 },
    ];

    expect(interpolateBindingPoints(bindingPoints, 0, 0)).toBe(10);
    expect(interpolateBindingPoints(bindingPoints, 0.5, 0)).toBe(50);
    expect(interpolateBindingPoints(bindingPoints, 1, 0)).toBe(90);
  });

  it("handles negative parameter values", () => {
    const bindingPoints: ParameterBindingPoint[] = [
      { paramValue: -1, targetValue: -30 },
      { paramValue: 0, targetValue: 0 },
      { paramValue: 1, targetValue: 30 },
    ];

    expect(interpolateBindingPoints(bindingPoints, -0.5, 0)).toBe(-15);
    expect(interpolateBindingPoints(bindingPoints, 0.5, 0)).toBe(15);
    expect(interpolateBindingPoints(bindingPoints, -2, 0)).toBe(-30);
    expect(interpolateBindingPoints(bindingPoints, 2, 0)).toBe(30);
  });

  it("returns the single binding point value without interpolation", () => {
    const bindingPoints: ParameterBindingPoint[] = [{ paramValue: 0, targetValue: 12 }];

    expect(interpolateBindingPoints(bindingPoints, 0, 0)).toBe(12);
  });
});

describe("evaluateBindingsAdditive", () => {
  function makeBinding(
    parameterId: string,
    bindingPoints: ParameterBindingPoint[],
  ): ParameterBinding {
    return {
      id: `binding-${parameterId}`,
      parameterId,
      target: { type: "bone", boneId: "bone-1", property: "angle" },
      bindingPoints,
    };
  }

  it("evaluates one binding", () => {
    const bindings: ParameterBinding[] = [
      makeBinding("param-a", [
        { paramValue: 0, targetValue: 0 },
        { paramValue: 1, targetValue: 10 },
      ]),
    ];

    expect(evaluateBindingsAdditive(bindings, { "param-a": 0.5 }, 0)).toBe(5);
  });

  it("adds multiple binding deltas", () => {
    const bindings: ParameterBinding[] = [
      makeBinding("param-a", [
        { paramValue: 0, targetValue: 0 },
        { paramValue: 1, targetValue: 10 },
      ]),
      makeBinding("param-b", [
        { paramValue: 0, targetValue: 0 },
        { paramValue: 1, targetValue: 20 },
      ]),
    ];

    expect(evaluateBindingsAdditive(bindings, { "param-a": 0.5, "param-b": 1 }, 0)).toBe(
      25,
    );
  });

  it("uses zero when a parameter value is missing", () => {
    const bindings: ParameterBinding[] = [
      makeBinding("param-missing", [
        { paramValue: 0, targetValue: 100 },
        { paramValue: 1, targetValue: 200 },
      ]),
    ];

    expect(evaluateBindingsAdditive(bindings, {}, 50)).toBe(100);
  });

  it("returns the default value for an empty binding list", () => {
    expect(evaluateBindingsAdditive([], { "param-a": 0.5 }, 42)).toBe(42);
  });

  it("adds deltas relative to a non-zero default value", () => {
    const bindings: ParameterBinding[] = [
      makeBinding("param-a", [
        { paramValue: 0, targetValue: 50 },
        { paramValue: 1, targetValue: 80 },
      ]),
    ];

    expect(evaluateBindingsAdditive(bindings, { "param-a": 1 }, 50)).toBe(80);
  });

  it("adds three binding deltas", () => {
    const bindings: ParameterBinding[] = [
      makeBinding("param-x", [
        { paramValue: 0, targetValue: 0 },
        { paramValue: 1, targetValue: 10 },
      ]),
      makeBinding("param-y", [
        { paramValue: 0, targetValue: 0 },
        { paramValue: 1, targetValue: 20 },
      ]),
      makeBinding("param-z", [
        { paramValue: 0, targetValue: 0 },
        { paramValue: 1, targetValue: 30 },
      ]),
    ];

    expect(
      evaluateBindingsAdditive(bindings, { "param-x": 1, "param-y": 1, "param-z": 1 }, 0),
    ).toBe(60);
  });
});
