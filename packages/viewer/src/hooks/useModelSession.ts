import {
  assertByteLengthWithinLimit,
  assertTextLengthWithinLimit,
  MAX_VIVI_TEXT_FILE_BYTES,
} from "@vivi2d/core/load-limits";
import { ViviModel } from "@vivi2d/core/model";
import { parseViviFile } from "@vivi2d/core/project-parser";
import {
  extractTextures,
  ParticleEffectRenderer,
  ViviPixiRenderer,
} from "@vivi2d/renderer-pixi";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { TranslationKey } from "../i18n";
import type { ViewerRecorder } from "../recorder";
import {
  autoDetectHandMapping,
  autoDetectMapping,
  autoDetectPoseMapping,
} from "../tracking/auto-mapper";
import { autoDetectPlatformFaceMapping } from "../tracking/platform-face-channels";
import type { UseViewerStateResult } from "./useViewerState";

export interface UseModelSessionParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  recorderRef: RefObject<ViewerRecorder | null>;
  recorderFactory: (
    canvas: HTMLCanvasElement,
    beforeCapture: () => void,
  ) => ViewerRecorder;
  state: Pick<
    UseViewerStateResult,
    | "setError"
    | "setLoaded"
    | "setModelName"
    | "setDragging"
    | "trackingMapRef"
    | "platformFaceMapRef"
    | "handTrackingMapRef"
    | "poseTrackingMapRef"
    | "setMappedCount"
    | "setPlatformFaceMappedCount"
    | "setHandMappedCount"
    | "setPoseMappedCount"
  >;
  t: (key: TranslationKey) => string;
}

export interface UseModelSessionResult {
  modelRef: RefObject<ViviModel | null>;
  rendererRef: RefObject<ViviPixiRenderer | null>;
  particlesRef: RefObject<ParticleEffectRenderer | null>;
  loading: boolean;
  loadModel: (source: File | string) => Promise<void>;
  handleFileLoad: (file: File) => Promise<void>;
  handleUrlLoad: () => Promise<void>;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent) => void;
}

async function readResponseTextWithLimit(
  response: Response,
  label: string,
): Promise<string> {
  const reader = response.body?.getReader();
  try {
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > 0) {
        assertByteLengthWithinLimit(contentLength, MAX_VIVI_TEXT_FILE_BYTES, label);
      }
    }

    if (!reader) {
      const text = await response.text();
      assertTextLengthWithinLimit(text, MAX_VIVI_TEXT_FILE_BYTES, label);
      return text;
    }

    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      assertByteLengthWithinLimit(totalBytes, MAX_VIVI_TEXT_FILE_BYTES, label);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    assertTextLengthWithinLimit(text, MAX_VIVI_TEXT_FILE_BYTES, label);
    return text;
  } catch (error) {
    // Stop downloading rejected payloads and preserve the original load error.
    await reader?.cancel().catch(() => {});
    throw error;
  } finally {
    reader?.releaseLock();
  }
}

export function useModelSession({
  canvasRef,
  recorderRef,
  recorderFactory,
  state,
  t,
}: UseModelSessionParams): UseModelSessionResult {
  const modelRef = useRef<ViviModel | null>(null);
  const rendererRef = useRef<ViviPixiRenderer | null>(null);
  const rendererInitRef = useRef<Promise<ViviPixiRenderer | null> | null>(null);
  const particlesRef = useRef<ParticleEffectRenderer | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(false);

  const loadModel = useCallback(
    async (source: File | string) => {
      if (!mountedRef.current) return;
      loadAbortRef.current?.abort();
      const abort = new AbortController();
      loadAbortRef.current = abort;
      const isCurrent = () =>
        mountedRef.current && loadAbortRef.current === abort && !abort.signal.aborted;
      let replacingRenderer = false;
      setLoading(true);
      try {
        state.setError(null);
        let text: string;
        if (typeof source === "string") {
          const response = await fetch(source, {
            signal: abort.signal,
            credentials: "omit",
          });
          if (!isCurrent()) return;
          if (!response.ok) {
            void response.body?.cancel().catch(() => {});
            throw new Error(`HTTP ${response.status}`);
          }
          text = await readResponseTextWithLimit(response, "Remote .vivi model");
        } else {
          assertByteLengthWithinLimit(
            source.size,
            MAX_VIVI_TEXT_FILE_BYTES,
            ".vivi file",
          );
          text = await source.text();
          assertTextLengthWithinLimit(text, MAX_VIVI_TEXT_FILE_BYTES, ".vivi file");
        }
        if (!isCurrent()) return;
        const fileData = parseViviFile(text, { profile: "publicProfileV1" });
        const model = ViviModel.fromFileData(fileData);
        const textures = await extractTextures(fileData);
        if (!isCurrent()) return;

        if (!canvasRef.current) return;

        // One renderer owns the mounted canvas. Overlapping loads share only
        // initialization; only the latest load may install a model into it.
        if (!rendererRef.current && !rendererInitRef.current) {
          const canvas = canvasRef.current;
          const initialization: Promise<ViviPixiRenderer | null> =
            ViviPixiRenderer.create(canvas, {
              backgroundColor: 0x000000,
              transparent: true,
            })
              .then((renderer) => {
                if (
                  !mountedRef.current ||
                  rendererInitRef.current !== initialization ||
                  canvasRef.current !== canvas
                ) {
                  renderer.destroy();
                  return null;
                }
                rendererRef.current = renderer;
                return renderer;
              })
              .finally(() => {
                if (rendererInitRef.current === initialization)
                  rendererInitRef.current = null;
              });
          rendererInitRef.current = initialization;
        }
        const renderer = rendererRef.current ?? (await rendererInitRef.current);
        if (!isCurrent() || !renderer || !canvasRef.current) return;
        // setModel may destroy the previous model before throwing. Once renderer
        // replacement begins, a failure must clear both sides of that binding.
        replacingRenderer = true;
        renderer.resize(model.width, model.height);
        renderer.setModel(model, textures);

        if (particlesRef.current) particlesRef.current.destroy();
        const particles = new ParticleEffectRenderer(renderer.pixiApp);
        particlesRef.current = particles;

        model.update();
        renderer.render();

        const name =
          typeof source === "string"
            ? new URL(source, window.location.href).pathname
                .split("/")
                .pop()
                ?.replace(/\.vivi$/, "") || "Remote Model"
            : model.project.name || source.name.replace(".vivi", "");
        state.setModelName(name);

        const mapping = autoDetectMapping(model.project.parameters);
        state.trackingMapRef.current = mapping;
        state.setMappedCount(Object.values(mapping).filter(Boolean).length);

        const platformFaceMapping = autoDetectPlatformFaceMapping(
          model.project.parameters,
        );
        state.platformFaceMapRef.current = platformFaceMapping;
        state.setPlatformFaceMappedCount(
          Object.values(platformFaceMapping).filter(Boolean).length,
        );

        const handMapping = autoDetectHandMapping(model.project.parameters);
        state.handTrackingMapRef.current = handMapping;
        state.setHandMappedCount(Object.values(handMapping).filter(Boolean).length);

        const poseMapping = autoDetectPoseMapping(model.project.parameters);
        state.poseTrackingMapRef.current = poseMapping;
        state.setPoseMappedCount(Object.values(poseMapping).filter(Boolean).length);

        recorderRef.current ??= recorderFactory(canvasRef.current, () => {
          const currentRenderer = rendererRef.current;
          if (!currentRenderer) throw new Error("Recording failed.");
          currentRenderer.render();
        });

        modelRef.current = model;
        state.setLoaded(true);
      } catch {
        if (isCurrent()) {
          if (replacingRenderer) {
            modelRef.current = null;
            state.setLoaded(false);
            state.setModelName("");
            const particles = particlesRef.current;
            const renderer = rendererRef.current;
            particlesRef.current = null;
            rendererRef.current = null;
            particles?.destroy();
            renderer?.destroy();
          }
          // Source errors can include credential-bearing URLs or model values.
          state.setError(t("errFileLoad"));
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [canvasRef, recorderRef, recorderFactory, state, t],
  );

  const handleFileLoad = useCallback(
    async (file: File) => {
      await loadModel(file);
    },
    [loadModel],
  );

  const handleUrlLoad = useCallback(async () => {
    const url = prompt(t("urlPrompt"));
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        state.setError(t("errUrlProtocol"));
        return;
      }
    } catch {
      state.setError(t("errInvalidUrl"));
      return;
    }
    await loadModel(url);
  }, [loadModel, t, state]);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      state.setDragging(true);
    },
    [state],
  );

  const handleDragLeave = useCallback(() => state.setDragging(false), [state]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      state.setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file?.name.endsWith(".vivi")) {
        handleFileLoad(file);
      } else {
        state.setError(t("errDropVivi"));
      }
    },
    [handleFileLoad, t, state],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      rendererInitRef.current = null;
      recorderRef.current?.cancel();
      recorderRef.current = null;
      particlesRef.current?.destroy();
      rendererRef.current?.destroy();
      particlesRef.current = null;
      rendererRef.current = null;
      modelRef.current = null;
    };
  }, [recorderRef]);

  return {
    modelRef,
    rendererRef,
    particlesRef,
    loading,
    loadModel,
    handleFileLoad,
    handleUrlLoad,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
