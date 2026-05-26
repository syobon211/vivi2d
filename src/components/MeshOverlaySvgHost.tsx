import type { MeshOverlaySvgModel } from "@/lib/mesh-overlay-svg";

export function MeshOverlaySvgHost({ model }: { model: MeshOverlaySvgModel | null }) {
  if (!model) return null;

  return (
    <svg
      aria-hidden="true"
      className="canvas-selection-overlay"
      data-testid="mesh-overlay-svg"
      width="100%"
      height="100%"
    >
      {model.edges.map((line) => (
        <line
          key={line.id}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={line.stroke}
          strokeWidth={line.strokeWidth}
          strokeOpacity={line.strokeOpacity}
        />
      ))}
      {model.heatmapEdges.map((line) => (
        <line
          key={line.id}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={line.stroke}
          strokeWidth={line.strokeWidth}
          strokeOpacity={line.strokeOpacity}
        />
      ))}
      {model.puppetFalloff.map((circle) => (
        <circle
          key={circle.id}
          cx={circle.cx}
          cy={circle.cy}
          r={circle.radius}
          fill={circle.fill}
          stroke={circle.stroke}
          strokeWidth={circle.strokeWidth}
          strokeOpacity={circle.strokeOpacity}
        />
      ))}
      {model.vertices.map((circle) => (
        <circle
          key={circle.id}
          cx={circle.cx}
          cy={circle.cy}
          r={circle.radius}
          fill={circle.fill}
          fillOpacity={circle.fillOpacity}
          stroke={circle.stroke}
          strokeWidth={circle.strokeWidth}
          strokeOpacity={circle.strokeOpacity}
        />
      ))}
      {model.heatmapVertices.map((circle) => (
        <circle
          key={circle.id}
          cx={circle.cx}
          cy={circle.cy}
          r={circle.radius}
          fill={circle.fill}
          fillOpacity={circle.fillOpacity}
          stroke={circle.stroke}
          strokeWidth={circle.strokeWidth}
          strokeOpacity={circle.strokeOpacity}
        />
      ))}
      {model.puppetPins.map((circle) => (
        <circle
          key={circle.id}
          cx={circle.cx}
          cy={circle.cy}
          r={circle.radius}
          fill={circle.fill}
          fillOpacity={circle.fillOpacity}
          stroke={circle.stroke}
          strokeWidth={circle.strokeWidth}
          strokeOpacity={circle.strokeOpacity}
        />
      ))}
      {model.lassoPath ? (
        <path
          d={model.lassoPath.d}
          fill={model.lassoPath.fill}
          fillOpacity={model.lassoPath.fillOpacity}
          stroke={model.lassoPath.stroke}
          strokeWidth={model.lassoPath.strokeWidth}
          strokeOpacity={model.lassoPath.strokeOpacity}
        />
      ) : null}
    </svg>
  );
}
