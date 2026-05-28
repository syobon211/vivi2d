import type { LayerRiggingHint, LayerSemanticRole } from "@vivi2d/core/types";
import type { ManualLayerMask, ProviderMaskProposal } from "./types";

export interface CreateProviderMaskProposalOptions {
  id: string;
  providerId: string;
  capabilityId: string;
  proposalId: string;
  semanticCandidates: readonly LayerSemanticRole[];
  confidence?: number;
  maskBufferId: string;
  requestToken?: string;
}

export interface ConvertProviderProposalOptions {
  maskId: string;
  name: string;
  semanticRole: LayerSemanticRole;
  color: string;
  riggingHint: LayerRiggingHint;
  convertedAt: string;
  customLabel?: string;
  edgeFeatherPx?: number;
}

export function createOpaqueProviderRequestToken(): string {
  if (
    typeof crypto === "undefined" ||
    typeof crypto.getRandomValues !== "function"
  ) {
    throw new Error("Secure random token generation is unavailable.");
  }
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createProviderMaskProposal(
  options: CreateProviderMaskProposalOptions,
): ProviderMaskProposal {
  if (options.semanticCandidates.length === 0) {
    throw new Error("Provider proposal must include at least one semantic candidate.");
  }
  if (
    options.confidence !== undefined &&
    (!Number.isFinite(options.confidence) ||
      options.confidence < 0 ||
      options.confidence > 1)
  ) {
    throw new Error("Provider proposal confidence must be in [0, 1].");
  }
  return {
    id: options.id,
    providerId: options.providerId,
    capabilityId: options.capabilityId,
    proposalId: options.proposalId,
    semanticCandidates: [...options.semanticCandidates],
    confidence: options.confidence,
    maskBufferId: options.maskBufferId,
    requestToken: options.requestToken ?? createOpaqueProviderRequestToken(),
    immutable: true,
  };
}

export function convertProviderProposalToUserMask(
  proposal: ProviderMaskProposal,
  options: ConvertProviderProposalOptions,
): ManualLayerMask {
  if (!proposal.semanticCandidates.includes(options.semanticRole)) {
    throw new Error("Converted provider proposal semantic must be user-selected from candidates.");
  }
  return {
    id: options.maskId,
    name: options.name,
    semanticRole: options.semanticRole,
    customLabel: options.customLabel,
    maskBufferId: proposal.maskBufferId,
    color: options.color,
    locked: false,
    visible: true,
    provenance: "user",
    convertedFromProviderProposal: {
      providerId: proposal.providerId,
      capabilityId: proposal.capabilityId,
      proposalId: proposal.proposalId,
      confidence: proposal.confidence,
      convertedAt: options.convertedAt,
    },
    riggingHint: options.riggingHint,
    edgeFeatherPx: options.edgeFeatherPx ?? 0,
  };
}

export function rejectProviderProposal(
  proposals: readonly ProviderMaskProposal[],
  proposalId: string,
): ProviderMaskProposal[] {
  return proposals.filter((proposal) => proposal.id !== proposalId);
}
