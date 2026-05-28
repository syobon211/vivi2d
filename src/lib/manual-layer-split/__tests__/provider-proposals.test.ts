import { afterEach, describe, expect, it, vi } from "vitest";
import {
  convertProviderProposalToUserMask,
  createOpaqueProviderRequestToken,
  createProviderMaskProposal,
  rejectProviderProposal,
} from "../provider-proposals";

describe("manual layer split provider proposals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates opaque provider proposal tokens without source identifiers", () => {
    const token = createOpaqueProviderRequestToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{24,}$/);
    expect(token).not.toMatch(/source|project|layer|sha256/i);
  });

  it("fails closed when secure random token generation is unavailable", () => {
    vi.stubGlobal("crypto", undefined);

    expect(() => createOpaqueProviderRequestToken()).toThrow(
      "Secure random token generation is unavailable.",
    );
  });

  it("converts immutable provider proposals into user-owned masks with audit metadata", () => {
    const proposal = createProviderMaskProposal({
      id: "proposal-ui",
      providerId: "provider",
      capabilityId: "vivi2d.provider.maskProposal.v1",
      proposalId: "proposal-1",
      semanticCandidates: ["hair", "accessory"],
      confidence: 0.7,
      maskBufferId: "mask-buffer",
      requestToken: "opaqueProposalToken_123456789",
    });
    const mask = convertProviderProposalToUserMask(proposal, {
      maskId: "mask-1",
      name: "Hair",
      semanticRole: "hair",
      color: "#75ff62",
      riggingHint: "localBones",
      convertedAt: "2026-05-17T00:00:00.000Z",
    });

    expect(mask).toMatchObject({
      provenance: "user",
      semanticRole: "hair",
      maskBufferId: "mask-buffer",
      convertedFromProviderProposal: {
        providerId: "provider",
        proposalId: "proposal-1",
        confidence: 0.7,
      },
    });
    expect(proposal.immutable).toBe(true);
  });

  it("rejects conversion to a semantic role not offered by the proposal", () => {
    const proposal = createProviderMaskProposal({
      id: "proposal-ui",
      providerId: "provider",
      capabilityId: "vivi2d.provider.maskProposal.v1",
      proposalId: "proposal-1",
      semanticCandidates: ["hair"],
      maskBufferId: "mask-buffer",
    });

    expect(() =>
      convertProviderProposalToUserMask(proposal, {
        maskId: "mask-1",
        name: "Face",
        semanticRole: "face",
        color: "#ffc857",
        riggingHint: "rigid",
        convertedAt: "2026-05-17T00:00:00.000Z",
      }),
    ).toThrow(/semantic/);
  });

  it("rejects provider proposals without mutating other draft proposals", () => {
    const first = createProviderMaskProposal({
      id: "first",
      providerId: "provider",
      capabilityId: "vivi2d.provider.maskProposal.v1",
      proposalId: "proposal-1",
      semanticCandidates: ["hair"],
      maskBufferId: "mask-1",
    });
    const second = createProviderMaskProposal({
      id: "second",
      providerId: "provider",
      capabilityId: "vivi2d.provider.maskProposal.v1",
      proposalId: "proposal-2",
      semanticCandidates: ["body"],
      maskBufferId: "mask-2",
    });

    expect(rejectProviderProposal([first, second], "first")).toEqual([second]);
  });
});
