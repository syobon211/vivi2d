import { findLayerById } from "@vivi2d/core/layer-utils";
import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  buildBoneSvgOverlays,
  buildColliderSvgOverlays,
  buildIkSvgOverlays,
} from "@/lib/selection-overlay-svg";
import { useColliderStore } from "@/stores/colliderStore";
import { useEditorStore } from "@/stores/editorStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";

const ColliderOverlays = memo(function ColliderOverlays({
  zoom,
  panX,
  panY,
}: {
  zoom: number;
  panX: number;
  panY: number;
}) {
  const colliders = useEditorStore((state) => state.project?.colliders ?? []);
  const selectedColliderId = useColliderStore((state) => state.selectedColliderId);

  const overlays = useMemo(
    () => buildColliderSvgOverlays(colliders, selectedColliderId, zoom, panX, panY),
    [colliders, panX, panY, selectedColliderId, zoom],
  );

  return (
    <>
      {overlays.map((overlay) => {
        if (overlay.kind === "rect") {
          return (
            <g key={overlay.id} data-testid={`selection-overlay-collider-${overlay.id}`}>
              <rect
                x={overlay.x}
                y={overlay.y}
                width={overlay.width}
                height={overlay.height}
                fill={overlay.fill}
                fillOpacity={overlay.opacity * 0.15}
                stroke={overlay.stroke}
                strokeOpacity={overlay.opacity}
                strokeWidth={overlay.strokeWidth}
              />
              {overlay.handles.map((handle) => (
                <circle
                  key={`${overlay.id}-${handle.id}`}
                  cx={handle.cx}
                  cy={handle.cy}
                  r={handle.radius}
                  fill={handle.fill}
                />
              ))}
            </g>
          );
        }

        return (
          <g key={overlay.id} data-testid={`selection-overlay-collider-${overlay.id}`}>
            <circle
              cx={overlay.cx}
              cy={overlay.cy}
              r={overlay.radius}
              fill={overlay.fill}
              fillOpacity={overlay.opacity * 0.15}
              stroke={overlay.stroke}
              strokeOpacity={overlay.opacity}
              strokeWidth={overlay.strokeWidth}
            />
            {overlay.handles.map((handle) => (
              <circle
                key={`${overlay.id}-${handle.id}`}
                cx={handle.cx}
                cy={handle.cy}
                r={handle.radius}
                fill={handle.fill}
              />
            ))}
          </g>
        );
      })}
    </>
  );
});

const IkOverlays = memo(function IkOverlays({
  zoom,
  panX,
  panY,
}: {
  zoom: number;
  panX: number;
  panY: number;
}) {
  const controllers = useEditorStore((state) => state.project?.ikControllers ?? []);
  const runtimeTargets = useIKRuntimeStore((state) => state.runtimeTargets);

  const overlays = useMemo(
    () => buildIkSvgOverlays(controllers, runtimeTargets, zoom, panX, panY),
    [controllers, panX, panY, runtimeTargets, zoom],
  );

  return (
    <>
      {overlays.map((overlay) => (
        <g key={overlay.id} data-testid={`selection-overlay-ik-${overlay.id}`}>
          <circle
            cx={overlay.targetX}
            cy={overlay.targetY}
            r={overlay.targetRadius}
            fill={overlay.targetFill}
            fillOpacity={0.6}
            stroke={overlay.targetStroke}
            strokeWidth={2}
          />
          <line
            x1={overlay.targetX - overlay.targetRadius}
            y1={overlay.targetY}
            x2={overlay.targetX + overlay.targetRadius}
            y2={overlay.targetY}
            stroke={overlay.targetStroke}
            strokeWidth={1}
          />
          <line
            x1={overlay.targetX}
            y1={overlay.targetY - overlay.targetRadius}
            x2={overlay.targetX}
            y2={overlay.targetY + overlay.targetRadius}
            stroke={overlay.targetStroke}
            strokeWidth={1}
          />
          {overlay.poleTarget ? (
            <circle
              cx={overlay.poleTarget.x}
              cy={overlay.poleTarget.y}
              r={overlay.poleTarget.radius}
              fill={overlay.poleTarget.fill}
              fillOpacity={0.5}
              stroke={overlay.poleTarget.stroke}
              strokeWidth={1}
            />
          ) : null}
        </g>
      ))}
    </>
  );
});

const BoneOverlays = memo(function BoneOverlays({
  selectedBoneId,
  zoom,
  panX,
  panY,
}: {
  selectedBoneId: string;
  zoom: number;
  panX: number;
  panY: number;
}) {
  const layers = useEditorStore((state) => state.project?.layers ?? []);
  const overlays = useMemo(
    () => buildBoneSvgOverlays(layers, selectedBoneId, zoom, panX, panY),
    [layers, panX, panY, selectedBoneId, zoom],
  );

  return (
    <>
      {overlays.map((overlay) => (
        <g key={overlay.id} data-testid={`selection-overlay-bone-${overlay.id}`}>
          <line
            x1={overlay.pivotX}
            y1={overlay.pivotY}
            x2={overlay.tipX}
            y2={overlay.tipY}
            stroke={overlay.color}
            strokeWidth={overlay.armWidth}
          />
          <circle
            cx={overlay.pivotX}
            cy={overlay.pivotY}
            r={overlay.pivotRadius}
            fill={overlay.color}
          />
          <circle
            cx={overlay.tipX}
            cy={overlay.tipY}
            r={overlay.tipRadius}
            fill={overlay.color}
          />
        </g>
      ))}
    </>
  );
});

export function SelectionOverlaySvgHost() {
  const { project } = useEditorStore(useShallow((state) => ({ project: state.project })));
  const selectedLayerId = useSelectionStore((state) => state.selectedLayerId);
  const { zoom, panX, panY } = useViewportStore(
    useShallow((state) => ({
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
    })),
  );
  const _selectedColliderId = useColliderStore((state) => state.selectedColliderId);
  const runtimeTargets = useIKRuntimeStore((state) => state.runtimeTargets);

  const selectedBoneId = useMemo(() => {
    if (!project || !selectedLayerId) {
      return null;
    }

    const layer = findLayerById(project.layers, selectedLayerId);
    return layer && layer.kind === "bone" ? layer.id : null;
  }, [project, selectedLayerId]);

  const hasColliderOverlays = Boolean(project?.colliders.length);
  const hasIkOverlays = Boolean(
    project?.ikControllers?.length && runtimeTargets.size > 0,
  );
  const hasBoneOverlays = selectedBoneId !== null;

  if (!hasBoneOverlays && !hasColliderOverlays && !hasIkOverlays) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className="canvas-selection-overlay"
      data-testid="selection-overlay-svg"
      width="100%"
      height="100%"
    >
      {hasBoneOverlays ? (
        <BoneOverlays
          selectedBoneId={selectedBoneId}
          zoom={zoom}
          panX={panX}
          panY={panY}
        />
      ) : null}
      {hasColliderOverlays ? (
        <ColliderOverlays zoom={zoom} panX={panX} panY={panY} />
      ) : null}
      {hasIkOverlays ? <IkOverlays zoom={zoom} panX={panX} panY={panY} /> : null}
    </svg>
  );
}
