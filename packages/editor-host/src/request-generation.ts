/** Internal mutable issuer state; never returned by the host or exported at its root. */
export interface RequestGenerationState {
  latestIssuedGeneration: number;
  exhausted: boolean;
}

/** The host's sole issuance step. A failed next issuance makes exhaustion sticky. */
export function issueRequestGeneration(state: RequestGenerationState): number | null {
  if (state.exhausted || state.latestIssuedGeneration >= Number.MAX_SAFE_INTEGER) {
    state.exhausted = true;
    return null;
  }
  state.latestIssuedGeneration += 1;
  return state.latestIssuedGeneration;
}
