export interface E2EProjectManifestEntry {
  readonly name: string;
  readonly testMatch?: readonly string[];
  readonly testIgnore?: readonly string[];
}

export const VISUAL_MATCH: readonly string[];
export const PERF_MATCH: readonly string[];
export const WORKFLOW_AUTO_SETUP_MATCH: readonly string[];
export const SMOKE_MATCH: readonly string[];
export const FULL_A11Y_MATCH: readonly string[];
export const FULL_RIG_MATCH: readonly string[];
export const FULL_EDITOR_MATCH: readonly string[];
export const FULL_IO_MATCH: readonly string[];
export const FULL_ANIMATION_MATCH: readonly string[];
export const FULL_DIALOGS_MATCH: readonly string[];
export const FULL_INTEGRATIONS_MATCH: readonly string[];
export const FULL_SPLIT_MATCH: readonly string[];
export const FULL_COMMON_IGNORE: readonly string[];
export const E2E_PROJECT_MANIFEST: readonly E2EProjectManifestEntry[];
