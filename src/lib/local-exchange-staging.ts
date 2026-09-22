import { normalizeProviderArtifactPath } from "@vivi2d/provider-sdk";
import {
  parseViviSeeThroughManifest,
  type ViviCompatNativeImportBundle,
} from "@vivi2d/provider-comfyui";
import { useEditorStore } from "@/stores/editorStore";
import {
  adoptLegacyProjectFromV11,
  adoptProjectV11,
} from "@/stores/project-v11-transaction";
import { parseSeeThroughNativeImportBundleAsync } from "@/stores/projectIO/seeThroughNativeImport";
import { inferProjectSourceKind } from "./project-source-kind";
import {
  parseViviFile,
  prepareDeserializedProject,
  serializeProject,
} from "./project-serializer";
import { V11EditorCarrier } from "./project-v11-serializer";
import { requireProjectV11Display } from "./project-v11-renderer";
import { parsePsdAsync, type ParsedPsdResult } from "./workers/psd-parse-client";
import { exchange, type ProposalView } from "./local-exchange-provider";

const rendererSession = {};
export function captureExchangeConsent(consented: boolean) {
  if (!consented) throw new Error("LOCAL_EXCHANGE_CONSENT");
  const { project, projectVersion } = useEditorStore.getState();
  return { project, projectVersion, rendererSession };
}
export function assertExchangeConsent(
  captured: ReturnType<typeof captureExchangeConsent>,
): void {
  const current = useEditorStore.getState();
  if (
    captured.rendererSession !== rendererSession ||
    captured.project !== current.project ||
    captured.projectVersion !== current.projectVersion
  )
    throw new Error("LOCAL_EXCHANGE_EDITOR_CHANGED");
}

export async function stageExchangeProposal(
  proposal: ProposalView,
  selectedIds: readonly string[],
): Promise<Uint8Array> {
  if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length)
    throw new Error("LOCAL_EXCHANGE_SELECTION");
  const selected = selectedIds.map((id) => {
    const artifact = proposal.manifest.artifacts.find((entry) => entry.id === id);
    const bytes = proposal.blobs.find((entry) => entry.id === id)?.bytes;
    if (!artifact || !bytes) throw new Error("LOCAL_EXCHANGE_SELECTION");
    return { artifact, bytes: new Uint8Array(bytes).buffer };
  });
  let staged: ParsedPsdResult;
  if (selected.length === 1 && selected[0]!.artifact.kind === "psd") {
    staged = await parsePsdAsync(selected[0]!.bytes, "Local provider result.psd", {
      requireWorker: true,
    });
  } else {
    const manifests = selected.filter((entry) => entry.artifact.kind === "manifest");
    if (manifests.length !== 1) throw new Error("LOCAL_EXCHANGE_SELECTION");
    const manifest = parseViviSeeThroughManifest(manifests[0]!.bytes);
    const images = selected.filter((entry) => entry.artifact.kind !== "manifest");
    const labels: string[] = [];
    for (const entry of images) {
      if (
        entry.artifact.kind !== "layerImage" ||
        typeof entry.artifact.metadata.imagePath !== "string"
      )
        throw new Error("LOCAL_EXCHANGE_SELECTION");
      const label = normalizeProviderArtifactPath(entry.artifact.metadata.imagePath);
      if (labels.includes(label)) throw new Error("LOCAL_EXCHANGE_SELECTION");
      labels.push(label);
    }
    const referenced = [
      ...new Set(manifest.layers.map((layer) => layer.image_path)),
    ].sort();
    if (JSON.stringify([...labels].sort()) !== JSON.stringify(referenced))
      throw new Error("LOCAL_EXCHANGE_SELECTION");
    const bundle: ViviCompatNativeImportBundle = {
      manifest,
      manifestPath: String(manifests[0]!.artifact.metadata.manifestPath),
      layerAssets: images.map((entry, index) => ({
        image_path: labels[index]!,
        imageData: entry.bytes,
      })),
    };
    staged = await parseSeeThroughNativeImportBundleAsync(
      bundle,
      "Local provider result",
    );
  }
  if (!staged.getStagedTextures) throw new Error("LOCAL_EXCHANGE_STAGING_UNAVAILABLE");
  const textures = new Map<string, HTMLCanvasElement>();
  for (const item of staged.getStagedTextures()) {
    const canvas = document.createElement("canvas");
    canvas.width = item.imageData.width;
    canvas.height = item.imageData.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("LOCAL_EXCHANGE_STAGING_UNAVAILABLE");
    context.putImageData(item.imageData, 0, 0);
    textures.set(item.layerId, canvas);
  }
  // Actual ordinary serializer preserves Provider metadata. Do not strip to force v11.
  return new TextEncoder().encode(
    JSON.stringify(serializeProject(staged.project, textures)),
  );
}

export async function approveExchangeProposal(
  cellId: string,
  selectedIds: readonly string[],
  consent: ReturnType<typeof captureExchangeConsent>,
): Promise<void> {
  const proposal = await exchange<ProposalView>({
    action: "proposal",
    cellId,
    selectedIds: [...selectedIds],
  });
  const bytes = await stageExchangeProposal(proposal, selectedIds);
  assertExchangeConsent(consent);
  await exchange({
    action: "approve",
    cellId,
    decisionId: crypto.randomUUID(),
    selectedIds: [...selectedIds],
    kind: "import-approved",
    documentId: crypto.randomUUID(),
    bytes,
    target: null,
  });
  // Approval is durable even if a concurrent editor change prevents this volatile adoption.
  await openExchangeCandidate(cellId, consent);
}

export async function openExchangeCandidate(
  cellId: string,
  consent: ReturnType<typeof captureExchangeConsent>,
): Promise<void> {
  const retained = await exchange<{ selection: { kind: string }; bytes: Uint8Array }>({
    action: "candidate",
    cellId,
  });
  if (retained.selection.kind === "project-approved") {
    const loaded = await V11EditorCarrier.open(new Uint8Array(retained.bytes));
    assertExchangeConsent(consent);
    requireProjectV11Display();
    adoptProjectV11(
      loaded.project,
      {
        carrier: loaded.carrier,
        revision: loaded.revision,
        display: loaded.display,
        saved: {
          project: loaded.project,
          revision: loaded.revision,
          canonical: loaded.canonical,
        },
      },
      null,
    );
  } else {
    const parsed = parseViviFile(
      new TextDecoder("utf-8", { fatal: true }).decode(retained.bytes),
    );
    const prepared = await prepareDeserializedProject(parsed);
    assertExchangeConsent(consent);
    adoptLegacyProjectFromV11(
      prepared.project,
      prepared.textures,
      null,
      inferProjectSourceKind(prepared.project),
    );
  }
}
