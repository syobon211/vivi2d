import type { AtlasEntry, LayerNode, ViviFileData } from "@vivi2d/model/types";

export interface ExtractedTexture {
  layerId: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

function flattenLayers(layers: readonly LayerNode[]): LayerNode[] {
  const result: LayerNode[] = [];
  for (const layer of layers) {
    result.push(layer);
    const children = Array.isArray(layer.children) ? layer.children : [];
    if (children.length > 0) {
      result.push(...flattenLayers(children));
    }
  }
  return result;
}

export async function extractTextures(
  fileData: ViviFileData,
): Promise<Map<string, HTMLCanvasElement>> {
  const textures = new Map<string, HTMLCanvasElement>();

  const entryMap = new Map<
    string,
    { entry: AtlasEntry; atlasWidth: number; atlasHeight: number }
  >();

  for (const atlas of fileData.atlases) {
    const atlasCanvas = await loadBase64Image(atlas.image, atlas.width, atlas.height);

    for (const entry of atlas.entries) {
      entryMap.set(entry.layerId, {
        entry,
        atlasWidth: atlas.width,
        atlasHeight: atlas.height,
      });

      const texCanvas = document.createElement("canvas");
      texCanvas.width = entry.width;
      texCanvas.height = entry.height;
      const ctx = texCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(
          atlasCanvas,
          entry.x,
          entry.y,
          entry.width,
          entry.height,
          0,
          0,
          entry.width,
          entry.height,
        );
      }
      textures.set(entry.layerId, texCanvas);
    }
  }

  const allLayers = flattenLayers(fileData.project.layers);
  for (const node of allLayers) {
    if (node.kind !== "viviMesh") continue;
    const mapping = entryMap.get(node.id);
    if (!mapping) continue;
    const { entry, atlasWidth, atlasHeight } = mapping;
    const uvs = node.mesh.uvs;
    for (let i = 0; i < uvs.length; i += 2) {
      uvs[i] = (uvs[i]! * atlasWidth - entry.x) / entry.width || 0;
      uvs[i + 1] = (uvs[i + 1]! * atlasHeight - entry.y) / entry.height || 0;
    }
  }

  return textures;
}

function loadBase64Image(
  base64: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Failed to load atlas image"));
    img.src = `data:image/png;base64,${base64}`;
  });
}
