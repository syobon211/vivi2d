import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { LayerNode } from "@vivi2d/core/types";
import {
  AUTO_SETUP_ROLE_DICTIONARY_VERSION,
  type PartCategory,
} from "@vivi2d/editor-core/auto-setup-role";
import { mapSeeThroughLabelToRole } from "@vivi2d/editor-core/see-through-role-map";

export { AUTO_SETUP_ROLE_DICTIONARY_VERSION, type PartCategory };

export interface DetectedPart {
  layerId: string;

  layerName: string;

  category: PartCategory;

  confidence: number;

  bounds: { x: number; y: number; width: number; height: number };
}

const PART_PATTERNS: Array<{
  pattern: RegExp;
  category: PartCategory;
  priority: number;
}> = [
  {
    pattern: /(?:左|left|[lL])[\s_.-]*(?:目|eye|瞳|iris)/i,
    category: "eyeLeft",
    priority: 10,
  },
  {
    pattern: /(?:右|right|[rR])[\s_.-]*(?:目|eye|瞳|iris)/i,
    category: "eyeRight",
    priority: 10,
  },
  {
    pattern: /(?:目|eye|瞳|iris)[\s_.-]*(?:左|left|[lL])/i,
    category: "eyeLeft",
    priority: 10,
  },
  {
    pattern: /(?:目|eye|瞳|iris)[\s_.-]*(?:右|right|[rR])/i,
    category: "eyeRight",
    priority: 10,
  },
  {
    pattern: /(?:左|left|[lL])[\s_.-]*(?:眉|eyebrow|brow)/i,
    category: "eyebrowLeft",
    priority: 9,
  },
  {
    pattern: /(?:右|right|[rR])[\s_.-]*(?:眉|eyebrow|brow)/i,
    category: "eyebrowRight",
    priority: 9,
  },
  {
    pattern: /(?:眉|eyebrow|brow)[\s_.-]*(?:左|left|[lL])/i,
    category: "eyebrowLeft",
    priority: 9,
  },
  {
    pattern: /(?:眉|eyebrow|brow)[\s_.-]*(?:右|right|[rR])/i,
    category: "eyebrowRight",
    priority: 9,
  },
  { pattern: /口|mouth|lip|唇/i, category: "mouth", priority: 8 },
  { pattern: /鼻|nose/i, category: "nose", priority: 7 },
  { pattern: /顔|face|フェイス/i, category: "face", priority: 6 },
  { pattern: /頭|head|ヘッド/i, category: "head", priority: 5 },
  { pattern: /前髪|front[\s_.-]*hair|bangs/i, category: "hairFront", priority: 8 },
  { pattern: /後(?:ろ)?髪|back[\s_.-]*hair|後頭/i, category: "hairBack", priority: 8 },
  { pattern: /横髪|side[\s_.-]*hair|サイド/i, category: "hairSide", priority: 8 },
  { pattern: /髪|hair|ヘアー?/i, category: "hair", priority: 4 },
  { pattern: /(?:左|left|[lL])[\s_.-]*(?:腕|arm)/i, category: "armLeft", priority: 7 },
  { pattern: /(?:右|right|[rR])[\s_.-]*(?:腕|arm)/i, category: "armRight", priority: 7 },
  { pattern: /(?:腕|arm)[\s_.-]*(?:左|left|[lL])/i, category: "armLeft", priority: 7 },
  { pattern: /(?:腕|arm)[\s_.-]*(?:右|right|[rR])/i, category: "armRight", priority: 7 },
  { pattern: /(?:左|left|[lL])[\s_.-]*(?:手|hand)/i, category: "handLeft", priority: 6 },
  {
    pattern: /(?:右|right|[rR])[\s_.-]*(?:手|hand)/i,
    category: "handRight",
    priority: 6,
  },
  { pattern: /(?:手|hand)[\s_.-]*(?:左|left|[lL])/i, category: "handLeft", priority: 6 },
  {
    pattern: /(?:手|hand)[\s_.-]*(?:右|right|[rR])/i,
    category: "handRight",
    priority: 6,
  },
  { pattern: /(?:左|left|[lL])[\s_.-]*(?:脚|足|leg)/i, category: "legLeft", priority: 6 },
  {
    pattern: /(?:右|right|[rR])[\s_.-]*(?:脚|足|leg)/i,
    category: "legRight",
    priority: 6,
  },
  { pattern: /(?:脚|足|leg)[\s_.-]*(?:左|left|[lL])/i, category: "legLeft", priority: 6 },
  {
    pattern: /(?:脚|足|leg)[\s_.-]*(?:右|right|[rR])/i,
    category: "legRight",
    priority: 6,
  },
  { pattern: /体|body|胴|torso|ボディ/i, category: "body", priority: 3 },
  { pattern: /尻尾|しっぽ|tail/i, category: "tail", priority: 5 },
  { pattern: /耳|ear/i, category: "ear", priority: 5 },
  {
    pattern: /アクセ|accessory|リボン|ribbon|帽子|hat|メガネ|glasses/i,
    category: "accessory",
    priority: 2,
  },
];

export function detectPartByName(name: string): {
  category: PartCategory;
  confidence: number;
} {
  if (name.startsWith("st:")) {
    const stLabel = name.slice(3);
    const category = mapSeeThroughLabelToRole(stLabel);
    if (category !== "unknown") return { category, confidence: 1.0 };
  }

  let bestMatch: { category: PartCategory; confidence: number } | null = null;

  for (const entry of PART_PATTERNS) {
    if (entry.pattern.test(name)) {
      const confidence = entry.priority / 10;
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { category: entry.category, confidence };
      }
    }
  }

  return bestMatch ?? { category: "unknown", confidence: 0 };
}

function detectPartFromLayer(layer: LayerNode): {
  category: PartCategory;
  confidence: number;
} {
  if (layer.semanticRole && layer.semanticRole !== "unknown") {
    return { category: layer.semanticRole, confidence: 1.0 };
  }
  return detectPartByName(layer.name);
}

export function detectParts(layers: LayerNode[]): DetectedPart[] {
  const allLayers = flattenLayers(layers);
  const results: DetectedPart[] = [];

  for (const layer of allLayers) {
    const { category, confidence } = detectPartFromLayer(layer);
    results.push({
      layerId: layer.id,
      layerName: layer.name,
      category,
      confidence,
      bounds: {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
      },
    });
  }

  return results;
}

export function filterDetectedParts(
  parts: DetectedPart[],
  minConfidence = 0.3,
): DetectedPart[] {
  return parts.filter((p) => p.confidence >= minConfidence);
}

export function refineByPosition(
  parts: DetectedPart[],
  canvasWidth: number,
  canvasHeight: number,
): DetectedPart[] {
  return parts.map((part) => {
    if (part.category !== "unknown") return part;

    const centerX = part.bounds.x + part.bounds.width / 2;
    const centerY = part.bounds.y + part.bounds.height / 2;
    const _relX = centerX / canvasWidth;
    const relY = centerY / canvasHeight;

    if (relY < 0.33) {
      return { ...part, category: "head" as PartCategory, confidence: 0.2 };
    }
    if (relY >= 0.33 && relY < 0.66) {
      return { ...part, category: "body" as PartCategory, confidence: 0.15 };
    }

    return part;
  });
}
