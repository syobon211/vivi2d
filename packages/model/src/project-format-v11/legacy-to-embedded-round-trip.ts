import { assertPublicRawViviFileProfile } from "../public-profile";
import { serializeProjectFormatV11Ordinary } from "./codec";
import {
  candidateBoundary,
  candidateFailure,
  checkCandidateProfile,
  type EmbeddedRoundTripPorts,
  type EmbeddedRoundTripResult,
  parseCandidateSemantics,
  readCandidateSource,
  requireCandidateDocumentId,
  validateEmbeddedRoundTripV11,
} from "./embedded-round-trip-profile";
import { ProjectFormatV11SemanticError } from "./errors";
import { encodeUtf8 } from "./portable-primitives";

export async function migrateLegacyToEmbeddedRoundTripV11(
  input: Uint8Array,
  newDocumentId: string,
  ports: EmbeddedRoundTripPorts,
): Promise<EmbeddedRoundTripResult> {
  return candidateBoundary(async () => {
    requireCandidateDocumentId(newDocumentId);
    const source = readCandidateSource(input);
    checkCandidateProfile(source.wire, true);
    // Raw schema and the narrow profile imply the legacy structural checks.
    // The public-profile string guard is not implied; retain its original flag.
    try {
      if (source.wire.profile === "publicProfileV1")
        assertPublicRawViviFileProfile(source.wire);
    } catch {
      candidateFailure("PROJECT_SEMANTIC_INVALID");
    }
    const parsed = await parseCandidateSemantics(source.canonical, ports);
    delete parsed.normalized.profile;
    parsed.normalized.documentId = newDocumentId;
    let converted: string;
    try {
      converted = await serializeProjectFormatV11Ordinary(parsed);
    } catch (error) {
      candidateFailure(
        error instanceof ProjectFormatV11SemanticError
          ? "PROJECT_SEMANTIC_INVALID"
          : "PROJECT_INTERNAL",
      );
    }
    return validateEmbeddedRoundTripV11(encodeUtf8(converted), ports);
  });
}

export async function forkEmbeddedRoundTripV11(
  input: Uint8Array,
  newDocumentId: string,
  ports: EmbeddedRoundTripPorts,
): Promise<EmbeddedRoundTripResult> {
  return candidateBoundary(async () => {
    requireCandidateDocumentId(newDocumentId);
    const validated = await validateEmbeddedRoundTripV11(input, ports);
    if (!validated.ok) return validated;
    if (newDocumentId === validated.documentId)
      candidateFailure("PROJECT_PROFILE_UNSUPPORTED");
    const source = readCandidateSource(validated.canonicalUtf8);
    const parsed = await parseCandidateSemantics(source.canonical, ports);
    parsed.normalized.documentId = newDocumentId;
    let converted: string;
    try {
      converted = await serializeProjectFormatV11Ordinary(parsed);
    } catch {
      candidateFailure("PROJECT_INTERNAL");
    }
    return validateEmbeddedRoundTripV11(encodeUtf8(converted), ports);
  });
}
