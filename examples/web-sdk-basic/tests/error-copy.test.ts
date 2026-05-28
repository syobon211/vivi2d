import { describe, expect, it } from "vitest";
import { ViviWebError, type ViviWebErrorCode } from "@vivi2d/web";
import { formatViviWebError } from "../src/error-copy";
import {
  selectDisplayParameters,
  summarizePublicMetadata,
} from "../src/sdk-demo";

const allCodes: readonly ViviWebErrorCode[] = [
  "VIVI_WEB_INVALID_SOURCE",
  "VIVI_WEB_FETCH_FAILED",
  "VIVI_WEB_PARSE_FAILED",
  "VIVI_WEB_VALIDATION_FAILED",
  "VIVI_WEB_LIMIT_EXCEEDED",
  "VIVI_WEB_TEXTURE_FAILED",
  "VIVI_WEB_RENDERER_UNAVAILABLE",
  "VIVI_WEB_INVALID_INPUT",
  "VIVI_WEB_UNKNOWN_INPUT",
  "VIVI_WEB_DISPOSED",
  "VIVI_WEB_ABORTED",
  "VIVI_WEB_INTERNAL",
];

describe("web-sdk-basic sample helpers", () => {
  it("formats every public Web SDK error code with fixed copy", () => {
    for (const code of allCodes) {
      const copy = formatViviWebError(new ViviWebError(code, "raw message"));
      expect(copy.code).toBe(code);
      expect(copy.message).not.toContain("raw message");
      expect(typeof copy.retry).toBe("boolean");
    }
  });

  it("uses a fixed fallback for unknown thrown values", () => {
    const copy = formatViviWebError({ code: "FUTURE_CODE", message: "raw message" });
    expect(copy).toEqual({
      code: "VIVI_WEB_UNKNOWN",
      message: "Something went wrong while using the Vivi2D Web SDK.",
      retry: true,
    });
  });

  it("summarizes only allowlisted metadata fields", () => {
    const summary = summarizePublicMetadata({
      expressionPresetCount: 2,
      height: 128,
      name: "<sample>",
      parameterCount: 3,
      width: 64,
    });
    expect(summary).toEqual([
      ["Name", "<sample>"],
      ["Width", "64"],
      ["Height", "128"],
      ["Parameters", "3"],
      ["Expression presets", "2"],
    ]);
  });

  it("sorts display parameters deterministically and caps the visible list", () => {
    const parameters = Array.from({ length: 8 }, (_, index) => ({
      default: 0,
      id: `sample.input.${String.fromCharCode(104 - index)}`,
      max: 1,
      min: -1,
      name: `Input ${index}`,
    }));
    expect(selectDisplayParameters(parameters).map((parameter) => parameter.id)).toEqual([
      "sample.input.a",
      "sample.input.b",
      "sample.input.c",
      "sample.input.d",
      "sample.input.e",
      "sample.input.f",
    ]);
  });
});
