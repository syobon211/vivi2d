import type { LayerRiggingHint, LayerSemanticRole } from "@vivi2d/core/types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MaskBuffer {
  id: string;
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
}

export interface ProviderProposalAudit {
  providerId: string;
  capabilityId: string;
  proposalId: string;
  confidence?: number;
  convertedAt?: string;
}

export interface ManualLayerMask {
  id: string;
  name: string;
  semanticRole: LayerSemanticRole;
  customLabel?: string;
  maskBufferId: string;
  color: string;
  locked: boolean;
  visible: boolean;
  provenance: "user" | "source";
  convertedFromProviderProposal?: ProviderProposalAudit & { convertedAt: string };
  riggingHint: LayerRiggingHint;
  edgeFeatherPx: number;
}

export interface ProviderMaskProposal {
  id: string;
  providerId: string;
  capabilityId: string;
  proposalId: string;
  semanticCandidates: readonly LayerSemanticRole[];
  confidence?: number;
  maskBufferId: string;
  requestToken: string;
  immutable: true;
}

export type UnderpaintBuffer = UnderpaintBufferBase &
  (
    | { generatorProvenance: "local"; providerAudit?: never }
    | { generatorProvenance: "providerProposal"; providerAudit: ProviderProposalAudit }
  );

export interface UnderpaintBufferBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  provenance: "generatedHidden";
  sourceMaskId?: string;
  occludedByMaskId?: string;
  generation: number;
  reviewState: "preview" | "accepted" | "rejected";
}

export interface ManualSplitQualityCheck {
  id:
    | "minMasks"
    | "coverage"
    | "overlap"
    | "protectedProvider"
    | "sourceFingerprintMismatch"
    | "missingRequiredTemplateSemantic"
    | "highAlphaPixelsLost"
    | "applyWouldExceedTextureBudget"
    | "tinyIslands"
    | "jaggedEdge"
    | "thinFragments"
    | "autoSetupReadinessGap";
  severity: "blocker" | "warning" | "info";
  threshold?: number;
  affectedBounds?: Rect[];
  repairAction?: "removeIslands" | "fillHoles" | "assignOverlap" | "refreshDraft";
}

export interface ManualLayerSplitDraftBaseState {
  projectId: string;
  baseProjectRevision: string;
  baseTextureStoreRevision: string;
  sourceLayerId: string;
  sourceLayerRevision: string;
  sourceTextureId: string;
  sourceFingerprint: string;
  sourceLayerPath: readonly string[];
  managedRigBackReferenceRevisions: Record<string, string>;
}

export interface ManualLayerSplitDraft {
  projectId: string;
  baseState: ManualLayerSplitDraftBaseState;
  sourceLayerId: string;
  sourceFingerprint: string;
  generation: number;
  width: number;
  height: number;
  masks: ManualLayerMask[];
  providerProposals: ProviderMaskProposal[];
  underpaintBufferIds: string[];
  activeMaskId: string;
  undoStackIds: string[];
  redoStackIds: string[];
  qualityChecks: ManualSplitQualityCheck[];
}
