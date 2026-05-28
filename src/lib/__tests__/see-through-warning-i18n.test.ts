import { describe, expect, it } from "vitest";
import { formatSeeThroughWorkflowWarning } from "@/lib/see-through-warning-i18n";
import type { I18nKey } from "@/lib/i18n";

const translations: Partial<Record<I18nKey, string>> = {
  "autoSetup.warning.faceHeadMissing": "face/head missing",
  "autoSetup.warning.mouthMissing": "mouth missing",
  "autoSetup.warning.bodyMissing": "body missing",
  "autoSetup.warning.eyeMissing": "eye missing",
  "autoSetup.warning.mouthControlsMultipleManagedParameters": "mouth params conflict",
  "autoSetup.warning.mouthControlsMultipleManagedBones": "mouth bones conflict",
  "autoSetup.warning.mouthControlsPreservedLipSyncTarget": "lip sync preserved",
  "autoSetup.warning.readyNameEmpty": "empty {layer}",
  "autoSetup.warning.readyNameCollision": "collision {layer}->{target}",
  "autoSetup.warning.readySingletonAmbiguous": "singleton {role} {count}",
  "autoSetup.warning.leftRightMultipleSide": "{family} {side} multiple",
  "autoSetup.warning.leftRightOnlyOneSide": "{family} one side",
  "autoSetup.warning.leftRightLowConfidence": "{layer} low {threshold}",
  "autoSetup.warning.leftRightSideConflict": "{layer} side conflict",
  "autoSetup.warning.leftRightUnsupportedRole": "{layer} unsupported {role}",
  "autoSetup.warning.leftRightDifferentFamily": "{layer} different {role}",
  "autoSetup.warning.leftRightProtectedRole": "{layer} protected {role}",
  "autoSetup.warning.eyeClippingNoIris": "{side} no iris",
  "autoSetup.warning.eyeClippingMultipleIris": "{side} iris {count}",
  "autoSetup.warning.eyeClippingNoWhite": "{side} no white",
  "autoSetup.warning.eyeClippingMultipleWhite": "{side} white {count}",
  "autoSetup.warning.eyeClippingAlreadyMasked": "{side} masked {layer}",
  "autoSetup.warning.eyeControlsNoIris": "{side} controls no iris",
  "autoSetup.warning.eyeControlsMultipleIris": "{side} controls iris {count}",
  "autoSetup.warning.eyeControlsNoWhite": "{side} controls no white",
  "autoSetup.warning.eyeControlsMultipleWhite": "{side} controls white {count}",
  "autoSetup.warning.eyeControlsNotClipped": "{side} controls clip {layer}/{mask}",
  "autoSetup.warning.eyeControlsMultipleManagedParameters": "{side} blink params",
  "autoSetup.warning.eyeControlsMultipleManagedBones": "{side} blink bones",
  "autoSetup.warning.eyeControlsParameterExists": "{side} param {parameter}",
  "autoSetup.warning.mouthControlsMultipleLayers": "mouth layers {count}",
  "autoSetup.warning.mouthControlsParameterExists": "mouth param {parameter}",
  "autoSetup.warning.side.left": "left",
  "autoSetup.warning.side.right": "right",
  "autoSetup.warning.family.eye": "eye",
  "autoSetup.warning.family.eyebrow": "brow",
  "autoSetup.warning.family.arm": "arm",
  "autoSetup.warning.family.hand": "hand",
  "autoSetup.warning.family.leg": "leg",
  "prop.semanticRole.face": "face",
  "prop.semanticRole.hair": "hair",
};

const t = (key: I18nKey) => translations[key] ?? key;

describe("formatSeeThroughWorkflowWarning", () => {
  it("localizes static see-through workflow warnings", () => {
    expect(formatSeeThroughWorkflowWarning(t, "Face/head layers are missing.")).toBe(
      "face/head missing",
    );
    expect(formatSeeThroughWorkflowWarning(t, "Mouth layers are missing.")).toBe(
      "mouth missing",
    );
    expect(formatSeeThroughWorkflowWarning(t, "Body layers are missing.")).toBe(
      "body missing",
    );
    expect(
      formatSeeThroughWorkflowWarning(t, "One or both eye layers are missing."),
    ).toBe("eye missing");
    expect(
      formatSeeThroughWorkflowWarning(
        t,
        "Skipped mouth controls because multiple managed mouth parameters were found.",
      ),
    ).toBe("mouth params conflict");
    expect(
      formatSeeThroughWorkflowWarning(
        t,
        "Skipped mouth controls because multiple managed mouth control bones were found.",
      ),
    ).toBe("mouth bones conflict");
    expect(
      formatSeeThroughWorkflowWarning(
        t,
        "Preserved existing lip-sync parameter target and did not rewire Mouth Open automatically.",
      ),
    ).toBe("lip sync preserved");
  });

  it.each([
    [
      'Skipped imported name cleanup for "Layer A" because the stripped name would be empty.',
      "empty Layer A",
    ],
    [
      'Skipped imported name cleanup for "Layer A" because "Layer B" would collide with another layer name.',
      "collision Layer A->Layer B",
    ],
    [
      "Skipped automatic assignment for face because 2 imported layers match that singleton role.",
      "singleton face 2",
    ],
    ["Eye Left still appears multiple times.", "eye left multiple"],
    ["Arm roles still cover only one side.", "arm one side"],
    ['Skipped left/right repair for "Eye L" because import confidence is below 0.75.', "Eye L low 0.75"],
    [
      'Skipped left/right repair for "Eye L" because import side metadata conflicts with the raw label.',
      "Eye L side conflict",
    ],
    [
      'Preserved "Layer A" because its current role hair is outside the supported left/right families.',
      "Layer A unsupported hair",
    ],
    [
      'Preserved "Layer A" because its current role hair belongs to a different semantic family.',
      "Layer A different hair",
    ],
    [
      'Preserved "Layer A" because its current hair role is protected from automatic left/right override.',
      "Layer A protected hair",
    ],
    ["Skipped left eye clipping because no imported iris layer was found.", "left no iris"],
    [
      "Skipped right eye clipping because 3 imported iris layers were found.",
      "right iris 3",
    ],
    [
      "Skipped left eye clipping because no imported eye-white layer was found.",
      "left no white",
    ],
    [
      "Skipped right eye clipping because 2 imported eye-white layers were found.",
      "right white 2",
    ],
    ["Skipped left eye clipping because Eye White already has clip masks.", "left masked Eye White"],
    [
      "Skipped left eye controls because no imported iris layer was found.",
      "left controls no iris",
    ],
    [
      "Skipped right eye controls because 2 imported iris layers were found.",
      "right controls iris 2",
    ],
    [
      "Skipped left eye controls because no imported eye-white layer was found.",
      "left controls no white",
    ],
    [
      "Skipped right eye controls because 4 imported eye-white layers were found.",
      "right controls white 4",
    ],
    [
      "Skipped left eye controls because Iris L is not clipped by Eye White L.",
      "left controls clip Iris L/Eye White L",
    ],
    [
      "Skipped right eye controls because multiple managed blink parameters were found.",
      "right blink params",
    ],
    [
      "Skipped left eye controls because multiple managed control bones were found.",
      "left blink bones",
    ],
    [
      "Skipped right eye controls because ParamBlinkR already exists as a user-owned parameter.",
      "right param ParamBlinkR",
    ],
    [
      "Skipped mouth controls because 2 imported mouth layers were found.",
      "mouth layers 2",
    ],
    [
      "Skipped mouth controls because ParamMouth already exists as a user-owned parameter.",
      "mouth param ParamMouth",
    ],
  ])("formats parameterized warning: %s", (warning, expected) => {
    expect(formatSeeThroughWorkflowWarning(t, warning)).toBe(expected);
  });

  it("returns unknown warnings unchanged and falls back to raw roles", () => {
    expect(formatSeeThroughWorkflowWarning(t, "Custom warning")).toBe("Custom warning");
    expect(
      formatSeeThroughWorkflowWarning(
        t,
        "Skipped automatic assignment for unknownRole because 3 imported layers match that singleton role.",
      ),
    ).toBe("singleton unknownRole 3");
  });
});
