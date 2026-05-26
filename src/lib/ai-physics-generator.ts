import type { DetectedPart, PartCategory } from "./ai-part-detector";
import type { GeneratedLabelLocale } from "./ai-bone-generator";

export interface GeneratedPhysicsGroup {
  name: string;

  partCategory: PartCategory;

  layerIds: string[];

  stiffness: number;

  gravity: number;

  damping: number;
}

const SWAYING_CATEGORIES: ReadonlySet<PartCategory> = new Set([
  "hair",
  "hairFront",
  "hairBack",
  "hairSide",
  "tail",
  "ear",
  "accessory",
]);

const PHYSICS_PRESETS: Record<
  string,
  { stiffness: number; gravity: number; damping: number }
> = {
  hair: { stiffness: 0.3, gravity: 0.5, damping: 0.4 },
  hairFront: { stiffness: 0.4, gravity: 0.3, damping: 0.5 },
  hairBack: { stiffness: 0.2, gravity: 0.6, damping: 0.3 },
  hairSide: { stiffness: 0.25, gravity: 0.5, damping: 0.35 },
  tail: { stiffness: 0.15, gravity: 0.7, damping: 0.25 },
  ear: { stiffness: 0.5, gravity: 0.2, damping: 0.6 },
  accessory: { stiffness: 0.35, gravity: 0.4, damping: 0.45 },
};

const CATEGORY_LABELS: Record<
  GeneratedLabelLocale,
  Partial<Record<PartCategory, string>>
> = {
  en: {
    hair: "Hair Sway",
    hairFront: "Front Hair Sway",
    hairBack: "Back Hair Sway",
    hairSide: "Side Hair Sway",
    tail: "Tail Sway",
    ear: "Ear Sway",
    accessory: "Accessory Sway",
  },
  ja: {
    hair: "髪 揺れ",
    hairFront: "前髪 揺れ",
    hairBack: "後ろ髪 揺れ",
    hairSide: "横髪 揺れ",
    tail: "尻尾 揺れ",
    ear: "耳 揺れ",
    accessory: "アクセサリ 揺れ",
  },
};

export function detectSwayingParts(parts: DetectedPart[]): DetectedPart[] {
  return parts.filter((p) => SWAYING_CATEGORIES.has(p.category));
}

export function generatePhysicsGroups(
  parts: DetectedPart[],
  options?: { locale?: GeneratedLabelLocale },
): GeneratedPhysicsGroup[] {
  const swaying = detectSwayingParts(parts);
  if (swaying.length === 0) return [];

  const grouped = new Map<PartCategory, DetectedPart[]>();
  for (const part of swaying) {
    const list = grouped.get(part.category) ?? [];
    list.push(part);
    grouped.set(part.category, list);
  }

  const results: GeneratedPhysicsGroup[] = [];
  const categoryLabels = CATEGORY_LABELS[options?.locale ?? "en"];

  for (const [category, categoryParts] of grouped) {
    const preset = PHYSICS_PRESETS[category] ?? {
      stiffness: 0.3,
      gravity: 0.5,
      damping: 0.4,
    };
    results.push({
      name: categoryLabels[category] ?? `${category} Sway`,
      partCategory: category,
      layerIds: categoryParts.map((p) => p.layerId),
      stiffness: preset.stiffness,
      gravity: preset.gravity,
      damping: preset.damping,
    });
  }

  return results;
}
