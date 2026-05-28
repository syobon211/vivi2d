import { describe, expect, it } from "vitest";
import { createIKController } from "@/test/fixtures";
import {
  buildColliderSvgOverlays,
  buildIkSvgOverlays,
  numberToCssHex,
} from "../selection-overlay-svg";

describe("selection-overlay-svg", () => {
  it("formats Pixi numeric colors as CSS hex strings", () => {
    expect(numberToCssHex(0xffaa00)).toBe("#ffaa00");
    expect(numberToCssHex(0x44aaff)).toBe("#44aaff");
  });

  it("builds rectangle and circle collider overlays with selected handles", () => {
    const overlays = buildColliderSvgOverlays(
      [
        {
          id: "rect-1",
          name: "Rect",
          enabled: true,
          shape: { type: "rectangle", x: 10, y: 20, width: 100, height: 50 },
        },
        {
          id: "circle-1",
          name: "Circle",
          enabled: false,
          shape: { type: "circle", x: 200, y: 100, radius: 25 },
        },
      ],
      "rect-1",
      2,
      5,
      7,
    );

    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toMatchObject({
      kind: "rect",
      id: "rect-1",
      x: 25,
      y: 47,
      width: 200,
      height: 100,
      stroke: "#ffaa00",
    });
    expect(overlays[0]?.handles).toHaveLength(4);
    expect(overlays[1]).toMatchObject({
      kind: "circle",
      id: "circle-1",
      cx: 405,
      cy: 207,
      radius: 50,
      opacity: 0.3,
    });
  });

  it("builds IK overlays from runtime targets and optional pole targets", () => {
    const controller = createIKController({
      id: "ik-1",
      targetX: 10,
      targetY: 20,
      poleTargetX: 30,
      poleTargetY: 40,
    });
    const overlays = buildIkSvgOverlays(
      [controller],
      new Map([["ik-1", { x: 100, y: 120 }]]),
      1.5,
      10,
      20,
    );

    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({
      id: "ik-1",
      targetX: 160,
      targetY: 200,
      targetRadius: 8,
      targetFill: "#ff6644",
    });
    expect(overlays[0]?.poleTarget).toMatchObject({
      x: 55,
      y: 80,
      radius: 5,
      fill: "#44aaff",
    });
  });
});
