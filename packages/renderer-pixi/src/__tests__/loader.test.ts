import { extractTextures as ownerExtractTextures } from "@vivi2d/loader";
import { expect, it } from "vitest";
import { extractTextures } from "../loader";

it("renderer adapter re-exports the loader implementation without wrapping it", () => {
  expect(extractTextures).toBe(ownerExtractTextures);
});
