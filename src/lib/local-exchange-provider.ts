import type {
  LocalJobState,
  LocalSyncState,
} from "@vivi2d/model/internal/local-exchange-state";
import { ComfyUIClient, createComfyUIProvider } from "@vivi2d/provider-comfyui";
import {
  isViviProviderError,
  type ViviProviderArtifact,
  type ViviProviderRequest,
} from "@vivi2d/provider-sdk";
import { invokeProvider } from "@vivi2d/provider-sdk/invocation";
import { ElectronComfyUITransport } from "./comfyui-electron-transport";

export interface ExchangeCellView {
  cellId: string;
  kind: "sync" | "job";
  scopeId: string;
  replicaId: string;
  commitVersion: number;
  documentId?: string;
  state: LocalJobState | LocalSyncState;
  selection?: {
    kind: "rejected" | "import-approved" | "project-approved";
    candidate: { documentId: string } | null;
  } | null;
}
export interface ResultView {
  artifacts: (Omit<ViviProviderArtifact, "data"> & {
    path: string;
    sha256: string;
    metadata: Record<string, unknown>;
  })[];
}
export interface ProposalView {
  manifest: ResultView;
  blobs: { id: string; bytes: Uint8Array }[];
}
export async function exchange<T>(command: Record<string, unknown>): Promise<T> {
  if (!window.electronAPI?.localExchange) throw new Error("LOCAL_EXCHANGE_UNAVAILABLE");
  const response = await window.electronAPI.localExchange(command);
  if (!response.ok) throw new Error(`LOCAL_EXCHANGE_${response.code}`);
  return response.value as T;
}

/** Start's version is captured by the caller once. Never refresh-and-retry it. */
export async function runLocalJob(
  cellId: string,
  expectedStateVersion: number,
  onClaim?: () => void,
): Promise<void> {
  const dispatch = await exchange<{
    attempt: number;
    endpoint: string;
    request: ViviProviderRequest;
  }>({ action: "start", cellId, expectedStateVersion });
  const controller = new AbortController();
  const stopListening = window.electronAPI.onLocalExchangeAbort((message) => {
    if (message.cellId === cellId && message.attempt === dispatch.attempt)
      controller.abort();
  });
  const fence = { cellId, attempt: dispatch.attempt };
  try {
    onClaim?.();
    // Closes the claim-to-listener window if cancellation won before subscription.
    if (!(await exchange<boolean>({ action: "progress", ...fence }))) controller.abort();
    const client = new ComfyUIClient({
      transport: new ElectronComfyUITransport(dispatch.endpoint),
      timeout: 120000,
    });
    const result = await invokeProvider(createComfyUIProvider(client), dispatch.request, {
      signal: controller.signal,
      onProgress: () => {
        void exchange<boolean>({ action: "progress", ...fence })
          .then((live) => {
            if (!live) controller.abort();
          })
          .catch(() => controller.abort());
      },
    });
    await exchange({ action: "complete", ...fence, result });
  } catch (error) {
    // Cancel/expiry and completion keep their already-committed winner.
    const reason =
      isViviProviderError(error) &&
      (error.code === "VIVI_PROVIDER_INVALID_REQUEST" ||
        error.code === "VIVI_PROVIDER_BAD_ARTIFACT")
        ? "permanent"
        : "retryable";
    await exchange({ action: "fail", ...fence, reason }).catch(() => {});
    throw new Error("LOCAL_EXCHANGE_ATTEMPT_FAILED");
  } finally {
    stopListening();
    // Cancellation alone cannot free the physical invocation slot.
    await exchange({ action: "settled", ...fence }).catch(() => {});
  }
}
