import {
  assertByteLengthWithinLimit,
  assertTextLengthWithinLimit,
  MAX_VIVI_TEXT_FILE_BYTES,
} from "@vivi2d/core/load-limits";
import { ViviModel } from "@vivi2d/core/model";
import { parseViviFile } from "@vivi2d/core/project-parser";
import { extractTextures, ParticleEffectRenderer, ViviPixiRenderer } from "@vivi2d/renderer-pixi";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { TranslationKey } from "../i18n";
import type { ViewerRecorder } from "../recorder";
import { autoDetectPlatformFaceMapping } from "../tracking/platform-face-channels";
import {
  autoDetectHandMapping,
  autoDetectMapping,
  autoDetectPoseMapping,
} from "../tracking/auto-mapper";
import type { UseViewerStateResult } from "./useViewerState";

export interface UseModelSessionParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  recorderRef: RefObject<ViewerRecorder | null>;
  recorderFactory: (canvas: HTMLCanvasElement) => ViewerRecorder;
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
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > 0) {
      assertByteLengthWithinLimit(contentLength, MAX_VIVI_TEXT_FILE_BYTES, label);
    }
  }

  const reader = response.body?.getReader();
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
  const particlesRef = useRef<ParticleEffectRenderer | null>(null);
  const [loading, setLoading] = useState(false);

  const loadModel = useCallback(
    async (source: File | string) => {
      setLoading(true);
      try {
        state.setError(null);
        let text: string;
        if (typeof source === "string") {
          const response = await fetch(source);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
        const fileData = parseViviFile(text, { profile: "publicProfileV1" });
        const model = ViviModel.fromFileData(fileData);
        const textures = await extractTextures(fileData);

        if (!canvasRef.current) return;

        if (rendererRef.current) {
          rendererRef.current.destroy();
        }

        canvasRef.current.width = model.width;
        canvasRef.current.height = model.height;

        const renderer = await ViviPixiRenderer.create(canvasRef.current, {
          backgroundColor: 0x000000,
          transparent: true,
        });
        renderer.setModel(model, textures);

        if (particlesRef.current) particlesRef.current.destroy();
        const particles = new ParticleEffectRenderer(renderer.pixiApp);
        particlesRef.current = particles;

        rendererRef.current = renderer;
        modelRef.current = model;
        state.setLoaded(true);

        const name =
          typeof source === "string"
            ? (source.split("/").pop()?.replace(".vivi", "") ?? "Remote Model")
            : model.project.name || source.name.replace(".vivi", "");
        state.setModelName(name);

        const mapping = autoDetectMapping(model.project.parameters);
        state.trackingMapRef.current = mapping;
        state.setMappedCount(Object.values(mapping).filter(Boolean).length);

        const platformFaceMapping = autoDetectPlatformFaceMapping(model.project.parameters);
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

        recorderRef.current = recorderFactory(canvasRef.current);

        model.update();
        renderer.render();
      } catch (e) {
        state.setError(e instanceof Error ? e.message : t("errFileLoad"));
      } finally {
        setLoading(false);
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
    return () => {
      particlesRef.current?.destroy();
      rendererRef.current?.destroy();
    };
  }, []);

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
