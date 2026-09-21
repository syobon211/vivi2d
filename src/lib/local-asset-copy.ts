import type { VerifiedAtlasAssetV1 } from "@vivi2d/editor-host";

type CopyCommand =
  | { operation: "prepare"; sourceCellId: string; receiverCellId: string }
  | { operation: "commit" | "cancel"; copyId: string };
type PreviewCommand =
  | { operation: "preview"; cellId: string }
  | { operation: "cancelPreview" };
export type LocalAssetCopyCommand = CopyCommand | PreviewCommand;

/** Bounded selected-file snapshot. No filesystem path or native handle crosses IPC. */
export interface RuntimePreviewCapture {
  kind: "runtimePreviewV1";
  cellId: string;
  documentId: string;
  commitVersion: number;
  sourceBytes: Uint8Array;
  objects: Array<{ objectAddress: string; bytes: Uint8Array }>;
  atlasResolutions: Array<
    | { atlasId: string; status: "missing" }
    | { atlasId: string; status: "ready"; verified: VerifiedAtlasAssetV1 }
  >;
}

export interface PreparedAssetCopy {
  copyId: string;
  documentId: string;
  compatibility: "full" | "readOnly";
  canonicalSha256: string;
  atlasCount: number;
}
export interface CommittedAssetCopy extends PreparedAssetCopy {
  status: "committed";
  completedCount: number;
  outcomeMayHaveCommitted: false;
}
export type LocalAssetCopyResponse =
  | {
      ok: true;
      value: PreparedAssetCopy | CommittedAssetCopy | RuntimePreviewCapture | null;
    }
  | { ok: false; code: string; outcomeMayHaveCommitted: boolean };

export class AssetCopyError extends Error {
  constructor(
    readonly unavailable: boolean,
    readonly ambiguous: boolean,
  ) {
    super("LOCAL_ASSET_COPY_FAILED");
  }
}

export function localAssetCopy(
  command: CopyCommand,
): Promise<PreparedAssetCopy | CommittedAssetCopy | null>;
export function localAssetCopy(
  command: PreviewCommand,
): Promise<RuntimePreviewCapture | null>;
/** This channel never carries a file path, principal or store handle. Preview
 * returns owned physical bytes, which the real C2 consumer must still validate. */
export async function localAssetCopy(command: LocalAssetCopyCommand) {
  if (!window.electronAPI?.localAssetCopy) throw new AssetCopyError(true, false);
  let response: LocalAssetCopyResponse;
  try {
    response = await window.electronAPI.localAssetCopy(command);
  } catch {
    throw new AssetCopyError(false, command.operation === "commit");
  }
  if (!response.ok) {
    throw new AssetCopyError(
      response.code === "LOCAL_ASSET_UNAVAILABLE",
      response.outcomeMayHaveCommitted,
    );
  }
  return response.value;
}
