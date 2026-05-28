import {
  ComfyUIClient,
  createComfyUIProvider,
  decomposeImageToPsd,
  generateFromPromptToPsd,
  inspectViviCompatSupport,
  type ViviCompatNativeImportBundle,
  type ViviSeeThroughLayerAsset,
  type ViviSeeThroughManifest,
} from "@vivi2d/provider-comfyui";
import {
  VIVI_PROVIDER_CAPABILITIES,
  type ViviProviderArtifact,
  type ViviProviderResult,
} from "@vivi2d/provider-sdk";
import { invokeProvider } from "@vivi2d/provider-sdk/invocation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ElectronComfyUITransport } from "@/lib/comfyui-electron-transport";
import { useFormatDialogText } from "@/lib/dialog-text";
import { type I18nKey, t as tGlobal, useT } from "@/lib/i18n";
import { useComfyUIStore } from "@/stores/comfyuiStore";
import { useNotificationStore } from "@/stores/notificationStore";
import {
  loadPsdFromBufferAsync,
  loadSeeThroughNativeImportBundleAsync,
} from "@/stores/projectIO";
import { DialogShell } from "./DialogShell";

type Mode = "image" | "prompt";
type CompatMode = "checking" | "ready" | "fallback";
type WorkflowProgress = {
  phase: string;
  step: number;
  total?: number;
};
type GeneratedImportResult =
  | {
      kind: "psd";
      psdBuffer: ArrayBuffer;
      importOptions?:
        | {
            mode: "seeThrough";
            manifest: ViviSeeThroughManifest;
          }
        | undefined;
    }
  | {
      kind: "nativeCompat";
      bundle: ViviCompatNativeImportBundle;
      exportFallback: () => Promise<ArrayBuffer>;
    };

const PHASE_I18N_KEY: Record<string, I18nKey> = {
  uploading: "ai.uploading",
  decomposing: "ai.decomposing",
  depth: "ai.processing",
  postprocess: "ai.processing",
  downloading: "ai.downloading",
  assembling: "ai.loadingPsd",
};
const MAX_RUNNING_PROGRESS = 95;
const KEEP_ALIVE_PROGRESS_LIMIT = 90;
const KEEP_ALIVE_PROGRESS_INTERVAL_MS = 2500;

function buildClient(baseUrl: string): ComfyUIClient {
  return new ComfyUIClient({
    transport: new ElectronComfyUITransport(baseUrl),
  });
}

function isCompatUnavailableError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message.startsWith("Vivi2D compat plugin is unavailable:")
  );
}

function normalizeWorkflowProgressPercent(
  progress: WorkflowProgress,
  previousPercent: number,
): number {
  const rawStep = Number.isFinite(progress.step) ? progress.step : 0;
  const rawTotal =
    typeof progress.total === "number" &&
    Number.isFinite(progress.total) &&
    progress.total > 0
      ? progress.total
      : 100;
  const rawPercent = rawTotal === 100 ? rawStep : (rawStep / rawTotal) * 100;
  const nextPercent = Math.round(Math.max(0, Math.min(MAX_RUNNING_PROGRESS, rawPercent)));
  return Math.max(previousPercent, nextPercent);
}

function createWorkflowProgressReporter(
  setProgress: (message: string, percent: number) => void,
): (progress: WorkflowProgress) => void {
  let lastPercent = 0;
  return (progress) => {
    const key = PHASE_I18N_KEY[progress.phase] ?? "ai.processing";
    const currentPercent = useComfyUIStore.getState().progressPercent;
    const nextPercent = normalizeWorkflowProgressPercent(
      progress,
      Math.max(lastPercent, currentPercent),
    );
    lastPercent = nextPercent;
    setProgress(tGlobal(key), nextPercent);
  };
}

function getKeepAliveProgressPercent(percent: number): number {
  if (percent <= 0 || percent >= KEEP_ALIVE_PROGRESS_LIMIT) {
    return percent;
  }
  const increment = percent < 40 ? 2 : 1;
  return Math.min(KEEP_ALIVE_PROGRESS_LIMIT, percent + increment);
}

async function decomposeImageWithProvider(
  client: ComfyUIClient,
  imageBuffer: ArrayBuffer,
  parameters: Record<string, unknown>,
  onProgress: (progress: WorkflowProgress) => void,
  signal: AbortSignal,
): Promise<ViviCompatNativeImportBundle> {
  const result = await invokeProvider(
    createComfyUIProvider(client),
    {
      requestId: `image-${Date.now()}`,
      capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
      inputArtifacts: [
        {
          id: "input",
          kind: "inputImage",
          mediaType: "image/png",
          byteLength: imageBuffer.byteLength,
          data: imageBuffer,
        },
      ],
      parameters,
    },
    {
      onProgress,
      signal,
    },
  );
  return readNativeImportBundle(result);
}

async function generatePromptWithProvider(
  client: ComfyUIClient,
  parameters: Record<string, unknown>,
  onProgress: (progress: WorkflowProgress) => void,
  signal: AbortSignal,
): Promise<ViviCompatNativeImportBundle> {
  const result = await invokeProvider(
    createComfyUIProvider(client),
    {
      requestId: `prompt-${Date.now()}`,
      capabilityId: VIVI_PROVIDER_CAPABILITIES.promptToLayerManifest,
      inputArtifacts: [],
      parameters,
    },
    {
      onProgress,
      signal,
    },
  );
  return readNativeImportBundle(result);
}

async function exportManifestWithProvider(
  client: ComfyUIClient,
  manifestPath: string,
  onProgress: (progress: WorkflowProgress) => void,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const result = await invokeProvider(
    createComfyUIProvider(client),
    {
      requestId: `manifest-export-${Date.now()}`,
      capabilityId: VIVI_PROVIDER_CAPABILITIES.manifestToPsd,
      inputArtifacts: [],
      parameters: { manifestPath },
    },
    {
      onProgress,
      signal,
    },
  );
  const psdArtifact = result.artifacts.find((artifact) => artifact.kind === "psd");
  return readArtifactData(psdArtifact, "PSD artifact");
}

function readNativeImportBundle(
  result: ViviProviderResult,
): ViviCompatNativeImportBundle {
  const manifestArtifact = result.artifacts.find(
    (artifact) => artifact.kind === "manifest",
  );
  const manifestData = readArtifactData(manifestArtifact, "manifest artifact");
  const manifest = parseProviderManifest(manifestData);
  return {
    manifest,
    manifestPath: readArtifactMetadataString(
      manifestArtifact,
      "manifestPath",
      manifestArtifact?.path ?? "manifest.json",
    ),
    layerAssets: result.artifacts
      .filter((artifact) => artifact.kind === "layerImage")
      .map(readLayerAssetFromArtifact),
  };
}

function parseProviderManifest(manifestData: ArrayBuffer): ViviSeeThroughManifest {
  try {
    return JSON.parse(
      new TextDecoder().decode(new Uint8Array(manifestData)),
    ) as ViviSeeThroughManifest;
  } catch (error) {
    throw new Error("Provider returned invalid see-through manifest JSON.", {
      cause: error,
    });
  }
}

function readLayerAssetFromArtifact(
  artifact: ViviProviderArtifact,
): ViviSeeThroughLayerAsset {
  return {
    image_path: readArtifactMetadataString(
      artifact,
      "imagePath",
      artifact.path ?? artifact.id,
    ),
    imageData: readArtifactData(artifact, "layer artifact"),
  };
}

function readArtifactData(
  artifact: ViviProviderArtifact | undefined,
  label: string,
): ArrayBuffer {
  if (!artifact?.data) {
    throw new Error(`Missing provider ${label} data.`);
  }
  return artifact.data;
}

function readArtifactMetadataString(
  artifact: ViviProviderArtifact | undefined,
  key: string,
  fallback: string,
): string {
  const value = artifact?.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function AIGenerateDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const formatDialogText = useFormatDialogText();
  const promptId = useId();
  const negativePromptId = useId();
  const {
    baseUrl,
    generating,
    progressMessage,
    progressPercent,
    error,
    compatStatus,
    setGenerating,
    setProgress,
    setError,
    setCompatChecking,
    setCompatSupported,
    setCompatMissing,
  } = useComfyUIStore(
    useShallow((s) => ({
      baseUrl: s.baseUrl,
      generating: s.generating,
      progressMessage: s.progressMessage,
      progressPercent: s.progressPercent,
      error: s.error,
      compatStatus: s.compatStatus,
      setGenerating: s.setGenerating,
      setProgress: s.setProgress,
      setError: s.setError,
      setCompatChecking: s.setCompatChecking,
      setCompatSupported: s.setCompatSupported,
      setCompatMissing: s.setCompatMissing,
    })),
  );

  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState(() => t("ai.promptDefault"));
  const [negativePrompt, setNegativePrompt] = useState(() =>
    t("ai.negativePromptDefault"),
  );
  const [seed, setSeed] = useState(42);
  const [resolution, setResolution] = useState(1280);
  const [steps, setSteps] = useState(30);
  const abortControllerRef = useRef<AbortController | null>(null);
  const client = useMemo(() => buildClient(baseUrl), [baseUrl]);
  const compatMode: CompatMode =
    compatStatus === "ready"
      ? "ready"
      : compatStatus === "missing"
        ? "fallback"
        : "checking";

  useEffect(() => {
    const current = useComfyUIStore.getState();
    if (current.compatBaseUrl === baseUrl && current.compatStatus !== "unknown") {
      return;
    }

    let cancelled = false;

    setCompatChecking(baseUrl);
    void inspectViviCompatSupport(client)
      .then((report) => {
        if (cancelled) return;
        if (report.supported) {
          setCompatSupported(baseUrl, report);
          return;
        }
        setCompatMissing(baseUrl, report.issues, report);
      })
      .catch((error) => {
        if (cancelled) return;
        setCompatMissing(baseUrl, [
          error instanceof Error ? error.message : "Compat probe failed",
        ]);
      });

    return () => {
      cancelled = true;
    };
  }, [baseUrl, client, setCompatChecking, setCompatSupported, setCompatMissing]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const runWithProgress = useCallback(
    (fn: (signal: AbortSignal) => Promise<GeneratedImportResult>) =>
      async (psdName: string) => {
        let progressTimer: number | undefined;
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        try {
          setGenerating(true);
          setError(null);
          setProgress(tGlobal("ai.processing"), 1);
          progressTimer = window.setInterval(() => {
            const current = useComfyUIStore.getState();
            if (!current.generating) return;
            const nextPercent = getKeepAliveProgressPercent(current.progressPercent);
            if (nextPercent <= current.progressPercent) return;
            setProgress(current.progressMessage || tGlobal("ai.processing"), nextPercent);
          }, KEEP_ALIVE_PROGRESS_INTERVAL_MS);

          const result = await fn(abortController.signal);

          if (result.kind === "nativeCompat") {
            setProgress(tGlobal("ai.loadingPsd"), 95);
            const nativeOk = await loadSeeThroughNativeImportBundleAsync(
              result.bundle,
              psdName,
              { notifyOnError: false },
            );
            if (!nativeOk) {
              useNotificationStore
                .getState()
                .addNotification("warning", tGlobal("ai.nativeImportFallbackNotice"));
              const psdBuffer = await result.exportFallback();
              const ok = await loadPsdFromBufferAsync(psdBuffer, psdName, {
                mode: "seeThrough",
                manifest: result.bundle.manifest,
              });
              if (!ok) {
                setError(tGlobal("ai.error"));
                return;
              }
            }
          } else {
            setProgress(tGlobal("ai.loadingPsd"), 95);
            const ok = await loadPsdFromBufferAsync(
              result.psdBuffer,
              psdName,
              result.importOptions,
            );
            if (!ok) {
              setError(tGlobal("ai.error"));
              return;
            }
          }

          setProgress(tGlobal("ai.complete"), 100);
          useNotificationStore
            .getState()
            .addNotification("info", tGlobal("ai.modelGenerated"));
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : tGlobal("ai.error"));
        } finally {
          if (progressTimer !== undefined) {
            window.clearInterval(progressTimer);
          }
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = null;
          }
          setGenerating(false);
        }
      },
    [setGenerating, setError, setProgress, onClose],
  );

  const handleImageGenerate = useCallback(async () => {
    const imagePath = await window.electronAPI.openImageFile();
    if (!imagePath) return;

    await runWithProgress(async (signal) => {
      const { buffer } = await window.electronAPI.readImageFile({ imagePath });
      const params = { seed, resolution, numSteps: steps };
      const reportProgress = createWorkflowProgressReporter(setProgress);

      try {
        if (compatMode !== "fallback") {
          const bundle = await decomposeImageWithProvider(
            client,
            buffer,
            params,
            reportProgress,
            signal,
          );
          return {
            kind: "nativeCompat" as const,
            bundle,
            exportFallback: () =>
              exportManifestWithProvider(
                client,
                bundle.manifestPath,
                reportProgress,
                signal,
              ),
          };
        }
      } catch (error) {
        if (!isCompatUnavailableError(error)) {
          throw error;
        }
        setCompatMissing(baseUrl, [error.message]);
        useNotificationStore
          .getState()
          .addNotification("warning", tGlobal("ai.compatFallbackRuntimeNotice"));
      }
      return {
        kind: "psd" as const,
        psdBuffer: await decomposeImageToPsd(client, buffer, params, reportProgress),
      };
    })("see-through.psd");
  }, [
    baseUrl,
    client,
    compatMode,
    seed,
    resolution,
    steps,
    setProgress,
    runWithProgress,
    setCompatMissing,
  ]);

  const handlePromptGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    await runWithProgress(async (signal) => {
      const params = {
        prompt: prompt.trim(),
        negativePrompt,
        seed,
        resolution,
        numSteps: steps,
      };
      const reportProgress = createWorkflowProgressReporter(setProgress);

      try {
        if (compatMode !== "fallback") {
          const bundle = await generatePromptWithProvider(
            client,
            params,
            reportProgress,
            signal,
          );
          return {
            kind: "nativeCompat" as const,
            bundle,
            exportFallback: () =>
              exportManifestWithProvider(
                client,
                bundle.manifestPath,
                reportProgress,
                signal,
              ),
          };
        }
      } catch (error) {
        if (!isCompatUnavailableError(error)) {
          throw error;
        }
        setCompatMissing(baseUrl, [error.message]);
        useNotificationStore
          .getState()
          .addNotification("warning", tGlobal("ai.compatFallbackRuntimeNotice"));
      }
      return {
        kind: "psd" as const,
        psdBuffer: await generateFromPromptToPsd(client, params, reportProgress),
      };
    })("see-through.psd");
  }, [
    client,
    compatMode,
    prompt,
    negativePrompt,
    seed,
    resolution,
    steps,
    setProgress,
    runWithProgress,
    setCompatMissing,
    baseUrl,
  ]);

  return (
    <DialogShell
      onClose={onClose}
      title={t("ai.dialogTitle")}
      minWidth={500}
      footer={
        <>
          {mode === "prompt" && (
            <button
              type="button"
              className="prop-btn"
              onClick={handlePromptGenerate}
              disabled={generating || !prompt.trim()}
            >
              {generating ? t("ai.generating") : t("ai.startGenerate")}
            </button>
          )}
          <button
            type="button"
            className="prop-btn"
            onClick={onClose}
            disabled={generating}
          >
            {t("common.close")}
          </button>
        </>
      }
    >
      {}
      <div className="ai-gen-tabs">
        <button
          type="button"
          className={`ai-gen-tab ${mode === "image" ? "active" : ""}`}
          onClick={() => setMode("image")}
          disabled={generating}
          aria-pressed={mode === "image"}
        >
          {t("ai.tabImage")}
        </button>
        <button
          type="button"
          className={`ai-gen-tab ${mode === "prompt" ? "active" : ""}`}
          onClick={() => setMode("prompt")}
          disabled={generating}
          aria-pressed={mode === "prompt"}
        >
          {t("ai.tabPrompt")}
        </button>
      </div>

      <div className="ai-gen-body">
        {mode === "image" && (
          <div className="ai-gen-image-panel">
            <p className="ai-gen-image-copy">{t("ai.imageModeNotice")}</p>
            <button
              type="button"
              className="prop-btn ai-gen-image-action"
              onClick={handleImageGenerate}
              disabled={generating}
            >
              {generating ? t("ai.generating") : t("ai.selectImageAndGenerate")}
            </button>
          </div>
        )}

        {mode === "prompt" && (
          <>
            <div className="ai-gen-field">
              <label className="ai-gen-label" htmlFor={promptId}>
                {t("ai.prompt")}
              </label>
              <textarea
                id={promptId}
                className="ai-gen-textarea"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={generating}
                placeholder={t("ai.promptPlaceholder")}
              />
            </div>
            <div className="ai-gen-field">
              <label className="ai-gen-label" htmlFor={negativePromptId}>
                {t("ai.negativePrompt")}
              </label>
              <textarea
                id={negativePromptId}
                className="ai-gen-textarea"
                rows={2}
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                disabled={generating}
              />
            </div>
          </>
        )}

        <div className="ai-gen-params">
          <label className="ai-gen-param">
            {t("ai.seed")}
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              disabled={generating}
              min={0}
              className="ai-gen-input"
            />
          </label>
          <label className="ai-gen-param">
            {t("ai.resolution")}
            <select
              value={resolution}
              onChange={(e) => setResolution(Number(e.target.value))}
              disabled={generating}
              className="ai-gen-select"
            >
              <option value={768}>768</option>
              <option value={1024}>1024</option>
              <option value={1280}>1280 ({t("ai.recommended")})</option>
              <option value={1536}>1536</option>
            </select>
          </label>
          <label className="ai-gen-param">
            {t("ai.steps")}
            <input
              type="number"
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              disabled={generating}
              min={1}
              max={100}
              className="ai-gen-input"
            />
          </label>
        </div>

        <div className="ai-gen-notice">{t("ai.licenseNotice")}</div>
        <div className="ai-gen-notice">
          {formatDialogText(
            compatMode === "ready"
              ? t("ai.compatReady")
              : compatMode === "fallback"
                ? t("ai.compatFallback")
                : t("ai.compatChecking"),
          )}
        </div>

        {generating && (
          <div className="ai-gen-progress">
            <div className="ai-gen-progress-label">
              {progressMessage} {progressPercent}%
            </div>
            <div className="ai-gen-progress-bar">
              <div
                className="ai-gen-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="ai-gen-error">
            {t("ai.error")}: {error}
          </div>
        )}
      </div>
    </DialogShell>
  );
}
