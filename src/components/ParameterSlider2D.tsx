import type { ParameterDefinition } from "@vivi2d/core/types";
import { useCallback, useRef } from "react";
import { formatParamValue } from "@/lib/format-utils";
import { useT } from "@/lib/i18n";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { useParameterStore } from "@/stores/parameterStore";

function normalize(value: number, min: number, max: number): number {
  return max === min ? 0.5 : (value - min) / (max - min);
}

function denormalize(t: number, min: number, max: number): number {
  return min + Math.max(0, Math.min(1, t)) * (max - min);
}

const PAD_SIZE = 140;

export function ParameterSlider2D({
  paramX,
  paramY,
  valueX,
  valueY,
}: {
  paramX: ParameterDefinition;
  paramY: ParameterDefinition;
  valueX: number;
  valueY: number;
}) {
  const t = useT();
  const padRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setValues = useCallback(
    (clientX: number, clientY: number) => {
      const pad = padRef.current;
      if (!pad) return;
      const rect = pad.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      const store = useParameterStore.getState();
      store.setParameterValue(
        paramX.id,
        denormalize(nx, paramX.minValue, paramX.maxValue),
      );
      store.setParameterValue(
        paramY.id,
        denormalize(1 - ny, paramY.minValue, paramY.maxValue),
      );
    },
    [paramX, paramY],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setValues(e.clientX, e.clientY);
    },
    [setValues],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      setValues(e.clientX, e.clientY);
    },
    [setValues],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleReset = useCallback(() => {
    const store = useParameterStore.getState();
    store.setParameterValue(paramX.id, paramX.defaultValue);
    store.setParameterValue(paramY.id, paramY.defaultValue);
  }, [paramX, paramY]);

  const handleUnpair = useCallback(() => {
    useParameterDefinitionStore.getState().unpairParameters(paramX.id);
  }, [paramX.id]);

  const nx = normalize(valueX, paramX.minValue, paramX.maxValue);
  const ny = 1 - normalize(valueY, paramY.minValue, paramY.maxValue);

  return (
    <div className="parameter-item parameter-2d-item">
      <div className="parameter-item-header">
        {}
        <button
          type="button"
          className="parameter-name"
          onDoubleClick={handleReset}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleReset();
            }
          }}
          title={t("param.resetDefaultTitle")}
        >
          {paramX.name} / {paramY.name}
        </button>
        <button
          type="button"
          className="param-remove-btn param-unpair-btn"
          onClick={handleUnpair}
          title={t("param.unpairTitle")}
        >
          ⊘
        </button>
      </div>
      <div className="parameter-2d-body">
        <div
          ref={padRef}
          className="parameter-2d-pad"
          style={{ width: PAD_SIZE, height: PAD_SIZE }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {}
          <div className="parameter-2d-grid-h" />
          <div className="parameter-2d-grid-v" />
          {}
          <div
            className="parameter-2d-cursor"
            style={{ left: `${nx * 100}%`, top: `${ny * 100}%` }}
          />
        </div>
        <div className="parameter-2d-labels">
          <div className="parameter-2d-label">
            <span className="parameter-2d-axis">X</span>
            <span className="parameter-value">{formatParamValue(valueX)}</span>
          </div>
          <div className="parameter-2d-label">
            <span className="parameter-2d-axis">Y</span>
            <span className="parameter-value">{formatParamValue(valueY)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
