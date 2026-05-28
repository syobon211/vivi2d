import type { I18nKey } from "./i18n";

type Translator = (key: I18nKey) => string;

function formatTemplate(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(params[key] ?? ""),
  );
}

function roleLabel(t: Translator, role: string) {
  const key = `prop.semanticRole.${role}` as I18nKey;
  const value = t(key);
  return value === key ? role : value;
}

function sideLabel(t: Translator, side: string) {
  return t(`autoSetup.warning.side.${side.toLowerCase()}` as I18nKey);
}

function familyLabel(t: Translator, family: string) {
  return t(`autoSetup.warning.family.${family.toLowerCase()}` as I18nKey);
}

export function formatSeeThroughWorkflowWarning(t: Translator, warning: string) {
  switch (warning) {
    case "Face/head layers are missing.":
      return t("autoSetup.warning.faceHeadMissing");
    case "Mouth layers are missing.":
      return t("autoSetup.warning.mouthMissing");
    case "Body layers are missing.":
      return t("autoSetup.warning.bodyMissing");
    case "One or both eye layers are missing.":
      return t("autoSetup.warning.eyeMissing");
    case "Skipped mouth controls because multiple managed mouth parameters were found.":
      return t("autoSetup.warning.mouthControlsMultipleManagedParameters");
    case "Skipped mouth controls because multiple managed mouth control bones were found.":
      return t("autoSetup.warning.mouthControlsMultipleManagedBones");
    case "Preserved existing lip-sync parameter target and did not rewire Mouth Open automatically.":
      return t("autoSetup.warning.mouthControlsPreservedLipSyncTarget");
  }

  let match = warning.match(
    /^Skipped imported name cleanup for "(.+)" because the stripped name would be empty\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.readyNameEmpty"), {
      layer: match[1] ?? "",
    });
  }

  match = warning.match(
    /^Skipped imported name cleanup for "(.+)" because "(.+)" would collide with another layer name\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.readyNameCollision"), {
      layer: match[1] ?? "",
      target: match[2] ?? "",
    });
  }

  match = warning.match(
    /^Skipped automatic assignment for ([a-zA-Z]+) because (\d+) imported layers match that singleton role\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.readySingletonAmbiguous"), {
      role: roleLabel(t, match[1] ?? ""),
      count: match[2] ?? "",
    });
  }

  match = warning.match(
    /^(Eye|Eyebrow|Arm|Hand|Leg) (Left|Right) still appears multiple times\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.leftRightMultipleSide"), {
      family: familyLabel(t, match[1] ?? ""),
      side: sideLabel(t, match[2] ?? ""),
    });
  }

  match = warning.match(/^(Eye|Eyebrow|Arm|Hand|Leg) roles still cover only one side\.$/);
  if (match) {
    return formatTemplate(t("autoSetup.warning.leftRightOnlyOneSide"), {
      family: familyLabel(t, match[1] ?? ""),
    });
  }

  match = warning.match(
    /^Skipped left\/right repair for "(.+)" because import confidence is below ([\d.]+)\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.leftRightLowConfidence"), {
      layer: match[1] ?? "",
      threshold: match[2] ?? "",
    });
  }

  match = warning.match(
    /^Skipped left\/right repair for "(.+)" because import side metadata conflicts with the raw label\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.leftRightSideConflict"), {
      layer: match[1] ?? "",
    });
  }

  match = warning.match(
    /^Preserved "(.+)" because its current role ([a-zA-Z]+) is outside the supported left\/right families\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.leftRightUnsupportedRole"), {
      layer: match[1] ?? "",
      role: roleLabel(t, match[2] ?? ""),
    });
  }

  match = warning.match(
    /^Preserved "(.+)" because its current role ([a-zA-Z]+) belongs to a different semantic family\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.leftRightDifferentFamily"), {
      layer: match[1] ?? "",
      role: roleLabel(t, match[2] ?? ""),
    });
  }

  match = warning.match(
    /^Preserved "(.+)" because its current ([a-zA-Z]+) role is protected from automatic left\/right override\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.leftRightProtectedRole"), {
      layer: match[1] ?? "",
      role: roleLabel(t, match[2] ?? ""),
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye clipping because no imported iris layer was found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeClippingNoIris"), {
      side: sideLabel(t, match[1] ?? ""),
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye clipping because (\d+) imported iris layers were found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeClippingMultipleIris"), {
      side: sideLabel(t, match[1] ?? ""),
      count: match[2] ?? "",
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye clipping because no imported eye-white layer was found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeClippingNoWhite"), {
      side: sideLabel(t, match[1] ?? ""),
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye clipping because (\d+) imported eye-white layers were found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeClippingMultipleWhite"), {
      side: sideLabel(t, match[1] ?? ""),
      count: match[2] ?? "",
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye clipping because (.+) already has clip masks\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeClippingAlreadyMasked"), {
      side: sideLabel(t, match[1] ?? ""),
      layer: match[2] ?? "",
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye controls because no imported iris layer was found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeControlsNoIris"), {
      side: sideLabel(t, match[1] ?? ""),
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye controls because (\d+) imported iris layers were found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeControlsMultipleIris"), {
      side: sideLabel(t, match[1] ?? ""),
      count: match[2] ?? "",
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye controls because no imported eye-white layer was found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeControlsNoWhite"), {
      side: sideLabel(t, match[1] ?? ""),
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye controls because (\d+) imported eye-white layers were found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeControlsMultipleWhite"), {
      side: sideLabel(t, match[1] ?? ""),
      count: match[2] ?? "",
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye controls because (.+) is not clipped by (.+)\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeControlsNotClipped"), {
      side: sideLabel(t, match[1] ?? ""),
      layer: match[2] ?? "",
      mask: match[3] ?? "",
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye controls because multiple managed blink parameters were found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeControlsMultipleManagedParameters"), {
      side: sideLabel(t, match[1] ?? ""),
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye controls because multiple managed control bones were found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeControlsMultipleManagedBones"), {
      side: sideLabel(t, match[1] ?? ""),
    });
  }

  match = warning.match(
    /^Skipped (left|right) eye controls because (.+) already exists as a user-owned parameter\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.eyeControlsParameterExists"), {
      side: sideLabel(t, match[1] ?? ""),
      parameter: match[2] ?? "",
    });
  }

  match = warning.match(
    /^Skipped mouth controls because (\d+) imported mouth layers were found\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.mouthControlsMultipleLayers"), {
      count: match[1] ?? "",
    });
  }

  match = warning.match(
    /^Skipped mouth controls because (.+) already exists as a user-owned parameter\.$/,
  );
  if (match) {
    return formatTemplate(t("autoSetup.warning.mouthControlsParameterExists"), {
      parameter: match[1] ?? "",
    });
  }

  return warning;
}
