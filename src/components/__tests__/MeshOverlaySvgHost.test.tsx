import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MeshOverlaySvgHost } from "@/components/MeshOverlaySvgHost";

describe("MeshOverlaySvgHost", () => {
  it("renders overlay primitives when a model is provided", () => {
    render(
      <MeshOverlaySvgHost
        model={{
          layerId: "mesh-1",
          mode: "vertex",
          edges: [
            {
              id: "edge-1",
              x1: 0,
              y1: 0,
              x2: 10,
              y2: 10,
              stroke: "#ffffff",
              strokeWidth: 1,
            },
          ],
          vertices: [
            {
              id: "vertex-1",
              cx: 4,
              cy: 5,
              radius: 3,
              fill: "#ff0000",
            },
          ],
          heatmapEdges: [],
          heatmapVertices: [],
          puppetFalloff: [],
          puppetPins: [],
          lassoPath: {
            d: "M 0 0 L 10 0 L 10 10 Z",
            fill: "#00ff00",
            fillOpacity: 0.2,
            stroke: "#00ff00",
            strokeWidth: 1,
            strokeOpacity: 0.5,
          },
        }}
      />,
    );

    const svg = screen.getByTestId("mesh-overlay-svg");
    expect(svg.querySelectorAll("line")).toHaveLength(1);
    expect(svg.querySelectorAll("circle")).toHaveLength(1);
    expect(svg.querySelectorAll("path")).toHaveLength(1);
  });

  it("renders nothing when the model is null", () => {
    const { container } = render(<MeshOverlaySvgHost model={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
