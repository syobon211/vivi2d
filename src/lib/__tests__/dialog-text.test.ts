import { describe, expect, it } from "vitest";
import { formatDialogText } from "@/lib/dialog-text";

describe("formatDialogText", () => {
  it("breaks Japanese sentences on full stops", () => {
    expect(formatDialogText("一文目です。二文目です。三文目です。", "ja")).toBe(
      "一文目です。\n二文目です。\n三文目です。",
    );
  });

  it("leaves English text unchanged", () => {
    expect(formatDialogText("Sentence one. Sentence two.", "en")).toBe(
      "Sentence one. Sentence two.",
    );
  });
});
