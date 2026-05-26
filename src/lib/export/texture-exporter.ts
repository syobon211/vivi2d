import { flattenLayers } from "@vivi2d/core/layer-utils";
import { isViviMesh, type ProjectData } from "@vivi2d/core/types";
import { getAllTextures } from "../texture-store";

export interface ExportedTexture {
  fileName: string;
  blob: Blob;
}

export async function exportTextures(
  project: ProjectData,
  layerFilter?: ReadonlySet<string>,
): Promise<ExportedTexture[]> {
  const textures = getAllTextures();
  const allNodes = flattenLayers(project.layers).filter(isViviMesh);
  const nodes = layerFilter ? allNodes.filter((n) => layerFilter.has(n.id)) : allNodes;

  const entries: { id: string; canvas: HTMLCanvasElement }[] = [];
  for (const node of nodes) {
    const canvas = textures.get(node.id);
    if (canvas) {
      entries.push({ id: node.id, canvas });
    }
  }

  if (entries.length === 0) {
    return [];
  }

  let totalWidth = 0;
  let maxHeight = 0;
  for (const entry of entries) {
    totalWidth += entry.canvas.width;
    maxHeight = Math.max(maxHeight, entry.canvas.height);
  }

  const atlasWidth = nextPow2(totalWidth);
  const atlasHeight = nextPow2(maxHeight);

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasWidth;
  atlasCanvas.height = atlasHeight;
  const ctx = atlasCanvas.getContext("2d");
  if (!ctx) return [];

  let offsetX = 0;
  for (const entry of entries) {
    ctx.drawImage(entry.canvas, offsetX, 0);
    offsetX += entry.canvas.width;
  }

  const blob = await canvasToBlob(atlasCanvas);
  return [{ fileName: "texture_00.png", blob }];
}

function nextPow2(n: number): number {
  let v = Math.max(1, Math.ceil(n));
  v--;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  return v + 1;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Texture Blob conversion failed"));
    }, "image/png");
  });
}

export { nextPow2 };
