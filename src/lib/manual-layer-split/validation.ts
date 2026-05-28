import { isProtectedLayerSemantic } from "@vivi2d/editor-core/layer-graph";
import { countMaskPixels } from "./mask-ops";
import type { ManualLayerMask, ManualSplitQualityCheck, MaskBuffer } from "./types";

export interface ValidateManualSplitOptions {
  requiredSemantics?: readonly string[];
  highAlphaLostPixels?: number;
  textureBudgetExceeded?: boolean;
}

export function validateManualLayerSplitDraft(
  masks: readonly ManualLayerMask[],
  buffers: ReadonlyMap<string, MaskBuffer>,
  options: ValidateManualSplitOptions = {},
): ManualSplitQualityCheck[] {
  const checks: ManualSplitQualityCheck[] = [];
  const nonEmptyMasks = masks.filter((mask) => {
    const buffer = buffers.get(mask.maskBufferId);
    return buffer ? countMaskPixels(buffer) > 0 : false;
  });

  if (nonEmptyMasks.length < 2) {
    checks.push({
      id: "minMasks",
      severity: "blocker",
      threshold: 2,
    });
  }

  for (const requiredSemantic of options.requiredSemantics ?? []) {
    const hasSemantic = nonEmptyMasks.some(
      (mask) => mask.semanticRole === requiredSemantic,
    );
    if (!hasSemantic) {
      checks.push({
        id: "missingRequiredTemplateSemantic",
        severity: "blocker",
      });
      break;
    }
  }

  const overlap = findFirstOverlap(nonEmptyMasks, buffers);
  if (overlap) {
    checks.push({
      id: "overlap",
      severity: "warning",
      affectedBounds: [overlap],
      repairAction: "assignOverlap",
    });
  }

  if ((options.highAlphaLostPixels ?? 0) > 0) {
    checks.push({
      id: "highAlphaPixelsLost",
      severity: "blocker",
      threshold: 0,
    });
  }

  if (options.textureBudgetExceeded) {
    checks.push({
      id: "applyWouldExceedTextureBudget",
      severity: "blocker",
    });
  }

  for (const mask of masks) {
    if (
      isProtectedLayerSemantic(mask.semanticRole) &&
      mask.convertedFromProviderProposal
    ) {
      // Converted provider masks are user-owned, but protected semantics still
      // deserve a visible review warning before auto setup.
      checks.push({
        id: "protectedProvider",
        severity: "warning",
      });
    }
  }

  return checks;
}

export function hasBlockingManualSplitChecks(
  checks: readonly ManualSplitQualityCheck[],
): boolean {
  return checks.some((check) => check.severity === "blocker");
}

function findFirstOverlap(
  masks: readonly ManualLayerMask[],
  buffers: ReadonlyMap<string, MaskBuffer>,
): { x: number; y: number; width: number; height: number } | null {
  for (let a = 0; a < masks.length; a += 1) {
    const first = buffers.get(masks[a]!.maskBufferId);
    if (!first) continue;
    for (let b = a + 1; b < masks.length; b += 1) {
      const second = buffers.get(masks[b]!.maskBufferId);
      if (!second || first.width !== second.width || first.height !== second.height) {
        continue;
      }
      for (let index = 0; index < first.alpha.length; index += 1) {
        if (first.alpha[index]! > 0 && second.alpha[index]! > 0) {
          const x = index % first.width;
          const y = Math.floor(index / first.width);
          return { x, y, width: 1, height: 1 };
        }
      }
    }
  }
  return null;
}
