import type { ProjectData } from "@vivi2d/core/types";

export interface PreparedProjectV11Display {
  commit(): void;
  rollback(): void;
  finalize(): void;
}

export interface ProjectV11DisplayInput {
  project: ProjectData | null;
  aliases: ReadonlyMap<string, HTMLCanvasElement>;
  parameterValues: Record<string, number>;
  v11: boolean;
  rebuild: boolean;
  newSession: boolean;
}

// One fixed Canvas owner, not a participant registry. Store-only/headless callers
// have no display to prepare. A mounted but unavailable Canvas rejects preparation.
let prepare: ((input: ProjectV11DisplayInput) => PreparedProjectV11Display) | null = null;

/** Ordinary UI adoption must not bypass preflight during lazy Canvas mounting. */
export function requireProjectV11Display(): void {
  if (prepare === null) throw new Error("V11_MASK_RENDERER_UNAVAILABLE");
}

export function installProjectV11Display(
  owner: (input: ProjectV11DisplayInput) => PreparedProjectV11Display,
): () => void {
  if (prepare !== null) throw new Error("PROJECT_DISPLAY_ALREADY_OWNED");
  prepare = owner;
  return () => {
    if (prepare === owner) prepare = null;
  };
}

export function prepareProjectV11Display(
  input: ProjectV11DisplayInput,
): PreparedProjectV11Display | null {
  return prepare?.(input) ?? null;
}
