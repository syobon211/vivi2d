import { findLayerById } from "@vivi2d/core/layer-utils";
import type { LayerSemanticRole } from "@vivi2d/core/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  canSplitManualPngLayer,
  countMaskPixels,
  createCanvasLike,
  listManualPngSplitCandidates,
  MANUAL_PNG_SPLIT_PARTS,
  type ManualPngSplitMask,
  type ManualPngSplitPartId,
} from "@/lib/manual-png-layer-split";
import { useT } from "@/lib/i18n";
import {
  createLassoSmoothingOptions,
  resolveEffectiveLassoStrength,
  shouldAcceptLassoPoint,
  smoothLassoPath,
  type LassoPoint,
  type LassoSmoothingStrength,
  type LassoSmoothingWarning,
  type SmoothedLassoPath,
} from "@/lib/manual-layer-split/lasso-smoothing";
import { resolveOverlapToActive } from "@/lib/manual-layer-split/mask-ops";
import { runManualMaskOperationAsync } from "@/lib/workers/manual-mask-client";
import type { ManualMaskWorkerOperation } from "@/workers/manual-mask.worker";
import { useEditorStore } from "@/stores/editorStore";
import { splitManualPngLayer } from "@/stores/manualPngSplit";
import { useSelectionStore } from "@/stores/selectionStore";
import { CATEGORY_LABEL_KEYS } from "./AutoSetupHelpers";
import { DialogShell } from "./DialogShell";
import { ManualPngSplitControls } from "./manual-png-split/ManualPngSplitControls";
import {
  canvasToMaskBuffer,
  createDefaultPartNames,
  createEmptyMaskCounts,
  createOperationId,
  drawCheckerboard,
  drawLassoPath,
  drawShiftedMaskedSource,
  fillPolygonOnMask,
  getCanvasImageData,
  getCanvasPoint,
  getCanvasPointFromClient,
  getLayerTexture,
  hasMaskOverlap,
  isEditableEventTarget,
  trimMaskHistory,
  writeMaskBufferToCanvas,
  type MaskCountState,
  type MaskHistoryEntry,
  type MaskSnapshot,
  type PaintMode,
  type PartNameState,
  type SplitTool,
} from "./manual-png-split-dialog-utils";

export function ManualPngSplitDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const selectedLayerId = useSelectionStore((s) => s.selectedLayerId);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasMapRef = useRef(
    new Map<ManualPngSplitPartId, HTMLCanvasElement>(),
  );
  const paintingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const lassoRawPointsRef = useRef<LassoPoint[]>([]);
  const latestLassoResultRef = useRef<SmoothedLassoPath | null>(null);
  const lassoPreviewFrameRef = useRef<number | null>(null);
  const completingPointerRef = useRef(false);
  const strokeBeforeRef = useRef<MaskSnapshot[] | null>(null);
  const draftGenerationRef = useRef(0);
  const pendingOperationIdRef = useRef<string | null>(null);
  const activeOperationAbortRef = useRef<AbortController | null>(null);
  const [activePartId, setActivePartId] =
    useState<ManualPngSplitPartId>("hair");
  const [tool, setTool] = useState<SplitTool>("brush");
  const [paintMode, setPaintMode] = useState<PaintMode>("add");
  const [brushSize, setBrushSize] = useState(42);
  const [refineRadius, setRefineRadius] = useState(4);
  const [wandTolerance, setWandTolerance] = useState(48);
  const [isMaskBusy, setIsMaskBusy] = useState(false);
  const [isDrawingStroke, setIsDrawingStroke] = useState(false);
  const [showSource, setShowSource] = useState(true);
  const [showStressPreview, setShowStressPreview] = useState(false);
  const [stressOffset, setStressOffset] = useState(24);
  const [lassoSmoothing, setLassoSmoothing] =
    useState<LassoSmoothingStrength>("medium");
  const [lassoPrecision, setLassoPrecision] = useState(false);
  const [lassoWarning, setLassoWarning] =
    useState<LassoSmoothingWarning | null>(null);
  const [lassoPoints, setLassoPoints] = useState<LassoPoint[]>(
    [],
  );
  const [undoStack, setUndoStack] = useState<MaskHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<MaskHistoryEntry[]>([]);
  const [hasOverlap, setHasOverlap] = useState(false);
  const [maskCounts, setMaskCounts] = useState<MaskCountState>(
    createEmptyMaskCounts,
  );
  const [partNames, setPartNames] = useState<PartNameState>(
    createDefaultPartNames,
  );

  const selectedLayer = useMemo(() => {
    if (!project || !selectedLayerId) return null;
    const layer = findLayerById(project.layers, selectedLayerId);
    return canSplitManualPngLayer(layer) ? layer : null;
  }, [project, selectedLayerId]);

  const sourceLayer = useMemo(() => {
    if (!project) return null;
    if (selectedLayer && getLayerTexture(selectedLayer)) return selectedLayer;
    return (
      listManualPngSplitCandidates(project).find((layer) =>
        getLayerTexture(layer),
      ) ?? null
    );
  }, [project, selectedLayer]);

  const sourceCanvas = getLayerTexture(sourceLayer);

  const lassoOptions = useMemo(
    () =>
      sourceCanvas
        ? createLassoSmoothingOptions(
            lassoSmoothing,
            sourceCanvas.width,
            sourceCanvas.height,
            lassoPrecision,
          )
        : null,
    [lassoPrecision, lassoSmoothing, sourceCanvas],
  );
  const effectiveLassoSmoothing = resolveEffectiveLassoStrength(
    lassoSmoothing,
    lassoPrecision,
  );

  const lassoWarningMessage = lassoWarning
    ? t(`manualLayerSplit.lassoWarning.${lassoWarning}`)
    : "";

  const getMaskCanvas = useCallback(
    (partId: ManualPngSplitPartId): HTMLCanvasElement | null => {
      if (!sourceCanvas) return null;
      const existing = maskCanvasMapRef.current.get(partId);
      if (
        existing &&
        existing.width === sourceCanvas.width &&
        existing.height === sourceCanvas.height
      ) {
        return existing;
      }
      const next = createCanvasLike(sourceCanvas);
      maskCanvasMapRef.current.set(partId, next);
      return next;
    },
    [sourceCanvas],
  );

  const filledMaskCount = Object.values(maskCounts).filter(
    (count) => count > 0,
  ).length;

  useEffect(() => {
    maskCanvasMapRef.current.clear();
    draftGenerationRef.current += 1;
    pendingOperationIdRef.current = null;
    activePointerIdRef.current = null;
    lassoRawPointsRef.current = [];
    latestLassoResultRef.current = null;
    if (lassoPreviewFrameRef.current != null) {
      cancelAnimationFrame(lassoPreviewFrameRef.current);
      lassoPreviewFrameRef.current = null;
    }
    activeOperationAbortRef.current?.abort();
    activeOperationAbortRef.current = null;
    setMaskCounts(createEmptyMaskCounts());
    setUndoStack([]);
    setRedoStack([]);
    setLassoPoints([]);
    setLassoWarning(null);
    setHasOverlap(false);
    setIsMaskBusy(false);
    setIsDrawingStroke(false);
  }, [sourceCanvas]);

  const abortActiveMaskOperation = useCallback(() => {
    activeOperationAbortRef.current?.abort();
    activeOperationAbortRef.current = null;
    pendingOperationIdRef.current = null;
    setIsMaskBusy(false);
  }, []);

  useEffect(() => abortActiveMaskOperation, [abortActiveMaskOperation]);

  const refreshOverlap = useCallback(() => {
    setHasOverlap(hasMaskOverlap(maskCanvasMapRef.current));
  }, []);

  const captureMasks = useCallback(
    (partIds: readonly ManualPngSplitPartId[]): MaskSnapshot[] =>
      partIds.flatMap((partId) => {
        const canvas = getMaskCanvas(partId);
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return [];
        return [
          {
            partId,
            imageData: context.getImageData(0, 0, canvas.width, canvas.height),
          },
        ];
      }),
    [getMaskCanvas],
  );

  const restoreMasks = useCallback(
    (snapshots: readonly MaskSnapshot[]) => {
      const restoredCounts: Partial<MaskCountState> = {};
      for (const snapshot of snapshots) {
        const canvas = getMaskCanvas(snapshot.partId);
        const context = canvas?.getContext("2d");
        if (!canvas || !context) continue;
        context.putImageData(snapshot.imageData, 0, 0);
        restoredCounts[snapshot.partId] = countMaskPixels(canvas);
      }
      setMaskCounts((current) => ({ ...current, ...restoredCounts }));
    },
    [getMaskCanvas],
  );

  const pushHistory = useCallback((entry: MaskHistoryEntry) => {
    draftGenerationRef.current += 1;
    setUndoStack((current) => trimMaskHistory([...current, entry]));
    setRedoStack([]);
  }, []);

  useEffect(
    () => () => {
      if (lassoPreviewFrameRef.current != null) {
        cancelAnimationFrame(lassoPreviewFrameRef.current);
      }
    },
    [],
  );

  const collectLassoEventPoints = useCallback(
    (
      event: PointerEvent<HTMLCanvasElement>,
      canvas: HTMLCanvasElement,
    ): LassoPoint[] => {
      const nativeEvent = event.nativeEvent;
      const coalesced =
        typeof nativeEvent.getCoalescedEvents === "function"
          ? nativeEvent.getCoalescedEvents()
          : [];
      const sourceEvents = coalesced.length > 0 ? coalesced : [nativeEvent];
      return sourceEvents.map((sourceEvent) => {
        const point = getCanvasPointFromClient(sourceEvent, canvas);
        return {
          x: point.x,
          y: point.y,
          t: sourceEvent.timeStamp,
        };
      });
    },
    [],
  );

  const updateLassoPreview = useCallback(
    (mode: "preview" | "commit"): SmoothedLassoPath | null => {
      if (!lassoOptions) return null;
      if (lassoRawPointsRef.current.length < 3) {
        setLassoWarning(null);
        setLassoPoints([...lassoRawPointsRef.current]);
        latestLassoResultRef.current = null;
        return null;
      }
      const options =
        mode === "preview"
          ? {
              ...lassoOptions,
              maxInputPointCount: Math.min(lassoOptions.maxInputPointCount, 1024),
              maxOutputPointCount: Math.min(lassoOptions.maxOutputPointCount, 2048),
            }
          : lassoOptions;
      const result = smoothLassoPath(lassoRawPointsRef.current, options);
      latestLassoResultRef.current = result;
      setLassoWarning(result.warnings[0] ?? null);
      setLassoPoints(
        result.status === "accepted"
          ? [...result.previewPoints]
          : [...(result.previewPoints.length > 0
              ? result.previewPoints
              : lassoRawPointsRef.current)],
      );
      return result;
    },
    [lassoOptions],
  );

  const scheduleLassoPreview = useCallback(() => {
    if (lassoPreviewFrameRef.current != null) return;
    lassoPreviewFrameRef.current = requestAnimationFrame(() => {
      lassoPreviewFrameRef.current = null;
      updateLassoPreview("preview");
    });
  }, [updateLassoPreview]);

  const appendLassoPoints = useCallback(
    (points: readonly LassoPoint[]) => {
      if (!lassoOptions) return;
      for (const point of points) {
        const previous =
          lassoRawPointsRef.current[lassoRawPointsRef.current.length - 1] ?? null;
        if (
          shouldAcceptLassoPoint(
            previous,
            point,
            lassoOptions.minSampleDistancePx,
          )
        ) {
          lassoRawPointsRef.current.push(point);
        }
      }
      scheduleLassoPreview();
    },
    [lassoOptions, scheduleLassoPreview],
  );

  const abortActiveStroke = useCallback(() => {
    if (completingPointerRef.current) return;
    const before = strokeBeforeRef.current;
    if (before) {
      restoreMasks(before);
      refreshOverlap();
    }
    paintingRef.current = false;
    activePointerIdRef.current = null;
    lassoRawPointsRef.current = [];
    latestLassoResultRef.current = null;
    strokeBeforeRef.current = null;
    if (lassoPreviewFrameRef.current != null) {
      cancelAnimationFrame(lassoPreviewFrameRef.current);
      lassoPreviewFrameRef.current = null;
    }
    setLassoPoints([]);
    setLassoWarning(null);
    setIsDrawingStroke(false);
  }, [refreshOverlap, restoreMasks]);

  const undoMaskEdit = useCallback(() => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    restoreMasks(entry.before);
    draftGenerationRef.current += 1;
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack((redo) => [...redo, entry]);
    setTimeout(refreshOverlap, 0);
  }, [refreshOverlap, restoreMasks, undoStack]);

  const redoMaskEdit = useCallback(() => {
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;
    restoreMasks(entry.after);
    draftGenerationRef.current += 1;
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack((undo) => trimMaskHistory([...undo, entry]));
    setTimeout(refreshOverlap, 0);
  }, [redoStack, refreshOverlap, restoreMasks]);

  const redrawPreview = useCallback(() => {
    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas || !sourceCanvas) return;
    previewCanvas.width = sourceCanvas.width;
    previewCanvas.height = sourceCanvas.height;
    const context = previewCanvas.getContext("2d");
    if (!context) return;
    drawCheckerboard(context, previewCanvas.width, previewCanvas.height);
    if (showSource) {
      context.globalAlpha = 0.58;
      context.drawImage(sourceCanvas, 0, 0);
      context.globalAlpha = 1;
    }

    for (const part of MANUAL_PNG_SPLIT_PARTS) {
      const mask = maskCanvasMapRef.current.get(part.id);
      if (!mask || maskCounts[part.id] === 0) continue;
      const colorLayer = createCanvasLike(sourceCanvas);
      const colorContext = colorLayer.getContext("2d");
      if (!colorContext) continue;
      colorContext.fillStyle = part.color;
      colorContext.fillRect(0, 0, colorLayer.width, colorLayer.height);
      colorContext.globalCompositeOperation = "destination-in";
      colorContext.drawImage(mask, 0, 0);
      context.globalAlpha = part.id === activePartId ? 0.72 : 0.38;
      context.drawImage(colorLayer, 0, 0);
      context.globalAlpha = 1;
    }
    const activeMask = maskCanvasMapRef.current.get(activePartId);
    if (showStressPreview && activeMask && maskCounts[activePartId] > 0) {
      drawShiftedMaskedSource(context, sourceCanvas, activeMask, stressOffset);
    }
    drawLassoPath(context, lassoPoints);
  }, [
    activePartId,
    lassoPoints,
    maskCounts,
    showSource,
    showStressPreview,
    sourceCanvas,
    stressOffset,
  ]);

  useEffect(() => {
    redrawPreview();
  }, [maskCounts, redrawPreview]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "z") return;
      if (isEditableEventTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.shiftKey) redoMaskEdit();
      else undoMaskEdit();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [redoMaskEdit, undoMaskEdit]);

  const paintAt = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const previewCanvas = previewCanvasRef.current;
      const maskCanvas = getMaskCanvas(activePartId);
      if (!previewCanvas || !maskCanvas) return;
      const { x, y } = getCanvasPoint(event, previewCanvas);
      const context = maskCanvas.getContext("2d");
      if (!context) return;
      context.save();
      context.globalCompositeOperation = paintMode === "subtract"
        ? "destination-out"
        : "source-over";
      context.fillStyle = "rgba(255, 255, 255, 1)";
      context.beginPath();
      context.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      context.fill();
      context.restore();
      setMaskCounts((current) => ({
        ...current,
        [activePartId]: countMaskPixels(maskCanvas),
      }));
    },
    [activePartId, brushSize, getMaskCanvas, paintMode],
  );

  const clearActiveMask = useCallback(() => {
    const before = captureMasks([activePartId]);
    const mask = getMaskCanvas(activePartId);
    const context = mask?.getContext("2d");
    if (!mask || !context) return;
    context.clearRect(0, 0, mask.width, mask.height);
    setMaskCounts((current) => ({ ...current, [activePartId]: 0 }));
    pushHistory({ before, after: captureMasks([activePartId]) });
    refreshOverlap();
  }, [activePartId, captureMasks, getMaskCanvas, pushHistory, refreshOverlap]);

  const clearAllMasks = useCallback(() => {
    const partIds = MANUAL_PNG_SPLIT_PARTS.map((part) => part.id).filter(
      (partId) => maskCounts[partId] > 0,
    );
    if (partIds.length === 0) return;
    const before = captureMasks(partIds);
    for (const mask of maskCanvasMapRef.current.values()) {
      const context = mask.getContext("2d");
      context?.clearRect(0, 0, mask.width, mask.height);
    }
    setMaskCounts(createEmptyMaskCounts());
    pushHistory({ before, after: captureMasks(partIds) });
    refreshOverlap();
  }, [captureMasks, maskCounts, pushHistory, refreshOverlap]);

  const applyActiveMaskWorkerOperation = useCallback(
    async (operation: ManualMaskWorkerOperation) => {
      const mask = getMaskCanvas(activePartId);
      if (!mask || isMaskBusy) return;
      const buffer = canvasToMaskBuffer(activePartId, mask);
      if (!buffer) return;
      const before = captureMasks([activePartId]);
      const operationId = createOperationId();
      const baseDraftGeneration = draftGenerationRef.current;
      activeOperationAbortRef.current?.abort();
      const abortController = new AbortController();
      activeOperationAbortRef.current = abortController;
      pendingOperationIdRef.current = operationId;
      setIsMaskBusy(true);
      try {
        const result = await runManualMaskOperationAsync(buffer, operation, {
          operationId,
          baseDraftGeneration,
          signal: abortController.signal,
        });
        if (
          pendingOperationIdRef.current !== result.operationId ||
          draftGenerationRef.current !== result.baseDraftGeneration ||
          paintingRef.current
        ) {
          return;
        }
        const latestMask = getMaskCanvas(activePartId);
        if (!latestMask || latestMask.width !== result.width || latestMask.height !== result.height) {
          return;
        }
        writeMaskBufferToCanvas(latestMask, {
          id: result.targetBufferId,
          width: result.width,
          height: result.height,
          alpha: new Uint8ClampedArray(result.alphaBuffer),
        });
        setMaskCounts((current) => ({
          ...current,
          [activePartId]: countMaskPixels(latestMask),
        }));
        pushHistory({ before, after: captureMasks([activePartId]) });
        refreshOverlap();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        return;
      } finally {
        if (pendingOperationIdRef.current === operationId) {
          pendingOperationIdRef.current = null;
        }
        if (activeOperationAbortRef.current === abortController) {
          activeOperationAbortRef.current = null;
        }
        setIsMaskBusy(false);
      }
    },
    [
      activePartId,
      captureMasks,
      getMaskCanvas,
      isMaskBusy,
      pushHistory,
      refreshOverlap,
    ],
  );

  const resolveActiveOverlap = useCallback(() => {
    const filledPartIds = MANUAL_PNG_SPLIT_PARTS.map((part) => part.id).filter(
      (partId) => maskCounts[partId] > 0,
    );
    if (filledPartIds.length < 2) return;
    const before = captureMasks(filledPartIds);
    const buffers = filledPartIds.flatMap((partId) => {
      const canvas = getMaskCanvas(partId);
      const buffer = canvas ? canvasToMaskBuffer(partId, canvas) : null;
      return buffer ? [buffer] : [];
    });
    resolveOverlapToActive(buffers, activePartId);
    const nextCounts = { ...maskCounts };
    for (const buffer of buffers) {
      const canvas = getMaskCanvas(buffer.id as ManualPngSplitPartId);
      if (!canvas) continue;
      writeMaskBufferToCanvas(canvas, buffer);
      nextCounts[buffer.id as ManualPngSplitPartId] = countMaskPixels(canvas);
    }
    setMaskCounts(nextCounts);
    pushHistory({ before, after: captureMasks(filledPartIds) });
    refreshOverlap();
  }, [
    activePartId,
    captureMasks,
    getMaskCanvas,
    maskCounts,
    pushHistory,
    refreshOverlap,
  ]);

  const createSplitLayers = useCallback(() => {
    if (!sourceLayer) return;
    const masks: ManualPngSplitMask[] = MANUAL_PNG_SPLIT_PARTS.map(
      (part): ManualPngSplitMask | null => {
      const maskCanvas = maskCanvasMapRef.current.get(part.id);
      if (!maskCanvas || countMaskPixels(maskCanvas) === 0) return null;
      return {
        maskId: crypto.randomUUID() as string,
        partId: part.id,
        name: partNames[part.id],
        role: part.role,
        maskCanvas,
      };
    },
    ).filter((mask): mask is ManualPngSplitMask => mask != null);

    const didCreate = splitManualPngLayer({
      sourceLayerId: sourceLayer.id,
      masks,
    });
    if (didCreate) onClose();
  }, [onClose, partNames, sourceLayer]);

  if (!project) return null;

  const roleLabel = (role: LayerSemanticRole) =>
    t(CATEGORY_LABEL_KEYS[role] ?? "prop.semanticRole.unknown");
  const handleClose = () => {
    abortActiveStroke();
    abortActiveMaskOperation();
    onClose();
  };

  return (
    <DialogShell
      onClose={handleClose}
      title={t("manualPngSplit.title")}
      className="manual-png-split-dialog"
      minWidth={940}
      footer={
        <>
          <button type="button" className="modal-btn" onClick={handleClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            onClick={createSplitLayers}
            disabled={!sourceCanvas || filledMaskCount < 2}
          >
            {t("manualPngSplit.createLayers")}
          </button>
        </>
      }
    >
      {!sourceLayer || !sourceCanvas ? (
        <div className="manual-png-split-empty">
          {t("manualPngSplit.noSource")}
        </div>
      ) : (
        <div className="manual-png-split-body">
          <section className="manual-png-split-stage">
            <p className="manual-png-split-help">
              {t("manualPngSplit.description")}
            </p>
            <div className="manual-png-split-canvas-frame">
              <canvas
                ref={previewCanvasRef}
                className="manual-png-split-canvas"
                aria-label={t("manualPngSplit.canvasLabel")}
                onPointerDown={(event) => {
                  if (pendingOperationIdRef.current) return;
                  if (paintingRef.current || activePointerIdRef.current != null) return;
                  const previewCanvas = previewCanvasRef.current ?? event.currentTarget;
                  if (!previewCanvas) return;
                  setLassoWarning(null);
                  if (tool === "wand") {
                    const sourceImageData = getCanvasImageData(sourceCanvas);
                    if (!sourceImageData) return;
                    const point = getCanvasPoint(event, previewCanvas);
                    const sourceRgbaBuffer = sourceImageData.data.buffer.slice(
                      sourceImageData.data.byteOffset,
                      sourceImageData.data.byteOffset + sourceImageData.data.byteLength,
                    );
                    void applyActiveMaskWorkerOperation({
                      kind: "regionGrow",
                      x: point.x,
                      y: point.y,
                      tolerance: wandTolerance,
                      mode: paintMode,
                      sourceRgbaBuffer,
                    });
                    return;
                  }
                  paintingRef.current = true;
                  setIsDrawingStroke(true);
                  activePointerIdRef.current = event.pointerId;
                  try {
                    previewCanvas.setPointerCapture(event.pointerId);
                  } catch {
                    // Pointer capture can fail in synthetic tests; the active
                    // pointer guard still prevents mixed strokes.
                  }
                  strokeBeforeRef.current = captureMasks([activePartId]);
                  if (tool === "brush") {
                    if (paintMode === "replace") {
                      const mask = getMaskCanvas(activePartId);
                      const context = mask?.getContext("2d");
                      if (mask && context) {
                        context.clearRect(0, 0, mask.width, mask.height);
                      }
                    }
                    paintAt(event);
                    return;
                  }
                  lassoRawPointsRef.current = [];
                  latestLassoResultRef.current = null;
                  appendLassoPoints(collectLassoEventPoints(event, previewCanvas));
                }}
                onPointerMove={(event) => {
                  if (!paintingRef.current) return;
                  if (activePointerIdRef.current !== event.pointerId) return;
                  if (tool === "brush") {
                    paintAt(event);
                    return;
                  }
                  const previewCanvas = previewCanvasRef.current ?? event.currentTarget;
                  if (!previewCanvas) return;
                  appendLassoPoints(collectLassoEventPoints(event, previewCanvas));
                }}
                onPointerUp={(event) => {
                  if (activePointerIdRef.current !== event.pointerId) return;
                  completingPointerRef.current = true;
                  paintingRef.current = false;
                  setIsDrawingStroke(false);
                  try {
                    const previewCanvas = previewCanvasRef.current ?? event.currentTarget;
                    if (previewCanvas?.hasPointerCapture(event.pointerId)) {
                      try {
                        previewCanvas.releasePointerCapture(event.pointerId);
                      } catch {
                        // Browser capture state can already be cleared by tests or
                        // OS cancellation; the active pointer guard remains enough.
                      }
                    }
                    activePointerIdRef.current = null;
                    let didCommitLasso = false;
                    if (tool === "lasso") {
                      const mask = getMaskCanvas(activePartId);
                      if (mask && previewCanvas && lassoOptions) {
                        appendLassoPoints(collectLassoEventPoints(event, previewCanvas));
                        if (lassoPreviewFrameRef.current != null) {
                          cancelAnimationFrame(lassoPreviewFrameRef.current);
                          lassoPreviewFrameRef.current = null;
                        }
                        const result =
                          updateLassoPreview("commit") ?? latestLassoResultRef.current;
                        if (result?.status === "accepted") {
                          fillPolygonOnMask(mask, result.acceptedPoints, paintMode);
                          didCommitLasso = true;
                        }
                        setMaskCounts((current) => ({
                          ...current,
                          [activePartId]: countMaskPixels(mask),
                        }));
                      }
                      lassoRawPointsRef.current = [];
                      latestLassoResultRef.current = null;
                      setLassoPoints([]);
                    }
                    const before = strokeBeforeRef.current;
                    strokeBeforeRef.current = null;
                    if (before && (tool !== "lasso" || didCommitLasso)) {
                      pushHistory({
                        before,
                        after: captureMasks([activePartId]),
                      });
                    }
                    refreshOverlap();
                  } finally {
                    window.setTimeout(() => {
                      completingPointerRef.current = false;
                    }, 0);
                  }
                }}
                onPointerCancel={abortActiveStroke}
                onLostPointerCapture={abortActiveStroke}
              />
            </div>
          </section>

          <ManualPngSplitControls
            activePartId={activePartId}
            applyActiveMaskWorkerOperation={(operation) => {
              void applyActiveMaskWorkerOperation(operation);
            }}
            brushSize={brushSize}
            clearActiveMask={clearActiveMask}
            clearAllMasks={clearAllMasks}
            effectiveLassoSmoothing={effectiveLassoSmoothing}
            filledMaskCount={filledMaskCount}
            hasOverlap={hasOverlap}
            isDrawingStroke={isDrawingStroke}
            isMaskBusy={isMaskBusy}
            lassoPrecision={lassoPrecision}
            lassoSmoothing={lassoSmoothing}
            lassoWarningMessage={lassoWarningMessage}
            maskCounts={maskCounts}
            paintMode={paintMode}
            partNames={partNames}
            redoMaskEdit={redoMaskEdit}
            redoStackLength={redoStack.length}
            refineRadius={refineRadius}
            resolveActiveOverlap={resolveActiveOverlap}
            roleLabel={roleLabel}
            setActivePartId={setActivePartId}
            setBrushSize={setBrushSize}
            setLassoPrecision={setLassoPrecision}
            setLassoSmoothing={setLassoSmoothing}
            setPaintMode={setPaintMode}
            setPartNames={setPartNames}
            setRefineRadius={setRefineRadius}
            setShowSource={setShowSource}
            setShowStressPreview={setShowStressPreview}
            setStressOffset={setStressOffset}
            setTool={setTool}
            setWandTolerance={setWandTolerance}
            showSource={showSource}
            showStressPreview={showStressPreview}
            sourceLayerName={sourceLayer.name}
            stressOffset={stressOffset}
            tool={tool}
            undoMaskEdit={undoMaskEdit}
            undoStackLength={undoStack.length}
            wandTolerance={wandTolerance}
          />
        </div>
      )}
    </DialogShell>
  );
}
