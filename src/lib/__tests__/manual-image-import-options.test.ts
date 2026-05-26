import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
  manualImageImportModeSupportsGrouping,
  normalizeManualImageImportOptions,
} from "../manual-image-import-options";

describe("manual image import options", () => {
  it("exposes stable PNG import defaults", () => {
    expect(DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS).toEqual({
      centerOnCanvas: false,
      trimTransparentBounds: false,
      createGroupForImportedLayers: false,
      autoGenerateMesh: false,
    });
  });

  it("merges partial options onto the defaults", () => {
    expect(
      normalizeManualImageImportOptions({
        centerOnCanvas: true,
        autoGenerateMesh: true,
      }),
    ).toEqual({
      centerOnCanvas: true,
      trimTransparentBounds: false,
      createGroupForImportedLayers: false,
      autoGenerateMesh: true,
    });
  });

  it("only enables grouping for multi-image import modes", () => {
    expect(manualImageImportModeSupportsGrouping("openProject")).toBe(false);
    expect(manualImageImportModeSupportsGrouping("importLayer")).toBe(false);
    expect(manualImageImportModeSupportsGrouping("importLayers")).toBe(true);
    expect(manualImageImportModeSupportsGrouping("importFolder")).toBe(true);
  });
});
