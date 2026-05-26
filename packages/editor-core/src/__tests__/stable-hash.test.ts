import { describe, expect, it } from "vitest";
import { createStableSha256Hex, createStableSha256V1 } from "../stable-hash";

describe("stable hash", () => {
  it("matches SHA-256 known answer tests", () => {
    expect(createStableSha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(createStableSha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(createStableSha256V1("abc")).toBe(
      "sha256:v1:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
