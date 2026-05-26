import type { I18nKey } from "@/lib/i18n";

const VALIDATION_CATEGORY_LABEL_KEYS = {
  emptyMesh: "validation.category.emptyMesh",
  meshIndexBounds: "validation.category.meshIndexBounds",
  orphanSkin: "validation.category.orphanSkin",
  unboundVertices: "validation.category.unboundVertices",
  unusedBone: "validation.category.unusedBone",
  weightNormalization: "validation.category.weightNormalization",
} as const satisfies Record<string, I18nKey>;

export function formatValidationCategory(
  t: (key: I18nKey) => string,
  category: string,
): string {
  const labelKey =
    VALIDATION_CATEGORY_LABEL_KEYS[
      category as keyof typeof VALIDATION_CATEGORY_LABEL_KEYS
    ];
  return labelKey ? t(labelKey) : category;
}
