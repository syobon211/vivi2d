import { findLayerById, flattenLayers } from "@vivi2d/core/layer-utils";
import type { AtlasEntry, LayerNode, MeshData } from "@vivi2d/core/types";
import {
  createViviMeshFromPreparedCanvas,
  getImageBaseName,
  getNextImportedDrawOrder,
  makeUniqueLayerName,
} from "@vivi2d/editor-core/manual-png-import-command";
import { embeddedRoundTripPngPolicy } from "@vivi2d/model/internal/project-format-v11";
import { createNativePngDecoder } from "@vivi2d/runtime-wasm/internal/png-rgba8-v1";
import {
  createAtlasEntryCanvas,
  mapAtlasEntryUvs,
  projectV11Sha256,
  type V11Atlas,
  V11AtlasRevision,
  V11ImageBacking,
} from "@/lib/project-v11-serializer";
import { getAllTextures } from "@/lib/texture-store";
import { useEditorStore } from "../editorStore";
import { commitProjectV11Edit } from "../project-v11-transaction";
import { mutateProject } from "../projectMutator";

async function decodeImage(
  bytes: Uint8Array,
  rgbaBudget = 268_435_456,
): Promise<V11ImageBacking> {
  if (bytes.byteLength < 24 || bytes.byteLength > 16_777_216)
    throw new Error("PROJECT_PNG_INVALID");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (width < 1 || height < 1 || width > 8192 || height > 8192)
    throw new Error("PROJECT_PNG_DIMENSION");
  if (width * height * 4 > rgbaBudget) throw new Error("PROJECT_IMAGE_LIMIT");
  const sha256 = projectV11Sha256(bytes);
  const expectedSha256 = Uint8Array.from(sha256.match(/../g) ?? [], (hex) =>
    Number.parseInt(hex, 16),
  );
  const created = await createNativePngDecoder();
  if (!created.ok) throw new Error("PROJECT_PNG_UNAVAILABLE");
  try {
    const decoded = created.decoder.decode({ bytes, expectedSha256, width, height });
    if (!decoded.ok || embeddedRoundTripPngPolicy(bytes) !== "ok")
      throw new Error("PROJECT_PNG_INVALID");
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 8192)
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
    return new V11ImageBacking(btoa(chunks.join("")), {
      sha256,
      byteLength: bytes.byteLength,
      width,
      height,
      rowStride: decoded.rowStride,
      rgba: decoded.rgba,
    });
  } finally {
    created.decoder.dispose();
  }
}

function uniqueAtlasId(atlases: readonly V11Atlas[]): string {
  const id = `atlas-${crypto.randomUUID()}`;
  if (atlases.some((atlas) => atlas.id === id)) throw new Error("PROJECT_ID_COLLISION");
  return id;
}

export async function verifyV11PngForMigration(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<"ok" | "dimension"> {
  const decoded = await decodeImage(new Uint8Array(bytes));
  return decoded.width === width && decoded.height === height ? "ok" : "dimension";
}

export async function importV11Images(
  files: readonly { buffer: ArrayBuffer; fileName: string }[],
): Promise<boolean> {
  const before = useEditorStore.getState(),
    session = before.projectV11;
  if (!session || !before.project || !files.length) return false;
  if (session.revision.atlases.length + files.length > 32)
    throw new Error("PROJECT_ATLAS_LIMIT");
  // Snapshot the whole bounded request before the first asynchronous decoder.
  let total = session.revision.atlases.reduce(
    (sum, atlas) => sum + atlas.backing.pngByteLength,
    0,
  );
  for (const file of files) {
    total += file.buffer.byteLength;
    if (file.buffer.byteLength > 16_777_216 || total > 67_108_864)
      throw new Error("PROJECT_IMAGE_LIMIT");
  }
  const owned = files.map((file) => ({
    bytes: new Uint8Array(new Uint8Array(file.buffer)),
    name: file.fileName,
  }));
  session.display.assertUnchanged(getAllTextures());
  const project = structuredClone(before.project),
    atlases = [...session.revision.atlases];
  let rgbaBudget =
    268_435_456 - atlases.reduce((sum, atlas) => sum + atlas.backing.rgbaByteLength, 0);
  let drawOrder = getNextImportedDrawOrder(project);
  for (const file of owned) {
    const backing = await decodeImage(file.bytes, rgbaBudget);
    rgbaBudget -= backing.rgbaByteLength;
    const canvas = backing.createCanvas(),
      layerId = crypto.randomUUID();
    if (findLayerById(project.layers, layerId)) throw new Error("PROJECT_ID_COLLISION");
    const name = makeUniqueLayerName(project, getImageBaseName(file.name));
    const layer = createViviMeshFromPreparedCanvas(
      layerId,
      name,
      {
        canvas,
        offsetX: 0,
        offsetY: 0,
        originalWidth: backing.width,
        originalHeight: backing.height,
        trimmed: false,
      },
      drawOrder++,
      {
        x: Math.round((project.width - backing.width) / 2),
        y: Math.round((project.height - backing.height) / 2),
      },
      {
        centerOnCanvas: true,
        trimTransparentBounds: false,
        createGroupForImportedLayers: false,
        autoGenerateMesh: false,
      },
    );
    delete layer.importMetadata;
    project.layers.push(layer);
    atlases.push({
      id: uniqueAtlasId(atlases),
      backing,
      entries: [{ layerId, x: 0, y: 0, width: backing.width, height: backing.height }],
    });
  }
  if (
    useEditorStore.getState().project !== before.project ||
    useEditorStore.getState().projectV11 !== session
  )
    throw new Error("PROJECT_SESSION_CHANGED");
  commitProjectV11Edit(project, { revision: new V11AtlasRevision(atlases) });
  return true;
}

export async function replaceV11Image(
  layerId: string,
  supplied?: ArrayBuffer,
): Promise<boolean> {
  const before = useEditorStore.getState(),
    session = before.projectV11;
  const target = before.project && findLayerById(before.project.layers, layerId);
  const mapping = session?.revision.entry(layerId);
  if (!session || !before.project || target?.kind !== "viviMesh" || !mapping)
    return false;
  session.display.assertUnchanged(getAllTextures());
  if (supplied && supplied.byteLength > 16_777_216)
    throw new Error("PROJECT_IMAGE_LIMIT");
  let input = supplied ? new Uint8Array(new Uint8Array(supplied)) : undefined;
  if (!input) {
    const imagePath = await window.electronAPI.openPngFile();
    if (!imagePath) return false;
    const result = await window.electronAPI.readImageFile({ imagePath });
    if (result.buffer.byteLength > 16_777_216) throw new Error("PROJECT_IMAGE_LIMIT");
    input = new Uint8Array(new Uint8Array(result.buffer));
  }
  const { atlas, entry } = mapping;
  const fullEntry =
    entry.x === 0 &&
    entry.y === 0 &&
    entry.width === atlas.backing.width &&
    entry.height === atlas.backing.height;
  if (
    useEditorStore.getState().project !== before.project ||
    useEditorStore.getState().projectV11 !== session
  )
    throw new Error("PROJECT_SESSION_CHANGED");
  session.display.assertUnchanged(getAllTextures());
  if (fullEntry && input.byteLength === atlas.backing.pngByteLength) {
    const original = atob(atlas.backing.image);
    if (input.every((byte, index) => byte === original.charCodeAt(index))) return true;
  }
  const exclusive = atlas.entries.length === 1;
  const retained = session.revision.atlases.filter(
    (item) => !exclusive || item !== atlas,
  );
  if (
    retained.length + 1 > 32 ||
    retained.reduce((sum, item) => sum + item.backing.pngByteLength, input.byteLength) >
      67_108_864
  )
    throw new Error("PROJECT_IMAGE_LIMIT");
  const backing = await decodeImage(
    input,
    268_435_456 - retained.reduce((sum, item) => sum + item.backing.rgbaByteLength, 0),
  );
  if (
    useEditorStore.getState().project !== before.project ||
    useEditorStore.getState().projectV11 !== session
  )
    throw new Error("PROJECT_SESSION_CHANGED");
  session.display.assertUnchanged(getAllTextures());
  const project = structuredClone(before.project),
    layer = findLayerById(project.layers, layerId);
  if (layer?.kind !== "viviMesh") throw new Error("PROJECT_SESSION_CHANGED");
  if (!fullEntry)
    layer.mesh.uvs = layer.mesh.uvs.map((value, index) =>
      index % 2 === 0
        ? (value * atlas.backing.width - entry.x) / entry.width
        : (value * atlas.backing.height - entry.y) / entry.height,
    );
  if (layer.mesh.uvs.some((value) => !Number.isFinite(value)))
    throw new Error("PROJECT_EDIT_INVALID");
  const nextEntry = { layerId, x: 0, y: 0, width: backing.width, height: backing.height };
  const atlases: V11Atlas[] = session.revision.atlases.map((item) =>
    item !== atlas
      ? item
      : exclusive
        ? { id: item.id, backing, entries: [nextEntry] }
        : { ...item, entries: item.entries.filter((item) => item.layerId !== layerId) },
  );
  if (!exclusive)
    atlases.push({ id: uniqueAtlasId(atlases), backing, entries: [nextEntry] });
  commitProjectV11Edit(project, { revision: new V11AtlasRevision(atlases) });
  return true;
}

export function deleteV11Mesh(layerId: string): boolean {
  const { project: current, projectV11: session } = useEditorStore.getState();
  if (!current || !session || findLayerById(current.layers, layerId)?.kind !== "viviMesh")
    return false;
  const project = structuredClone(current);
  const remove = (nodes: LayerNode[], parentBoneId?: string): boolean => {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node) continue;
      if (node.id === layerId) {
        for (const child of node.children)
          if (child.kind === "bone") {
            if (parentBoneId === undefined) delete child.parentBoneId;
            else child.parentBoneId = parentBoneId;
          }
        nodes.splice(index, 1, ...node.children);
        return true;
      }
      if (remove(node.children, node.kind === "bone" ? node.id : parentBoneId))
        return true;
    }
    return false;
  };
  remove(project.layers);
  if (project.skins) delete project.skins[layerId];
  for (const node of flattenLayers(project.layers))
    if (node.clipMaskIds)
      node.clipMaskIds = node.clipMaskIds.filter((id) => id !== layerId);
  const atlases = session.revision.atlases.flatMap((atlas) => {
    const entries = atlas.entries.filter((entry) => entry.layerId !== layerId);
    return atlas.entries.length > 0 && entries.length === 0
      ? []
      : [{ ...atlas, entries }];
  });
  commitProjectV11Edit(project, { revision: new V11AtlasRevision(atlases) });
  return true;
}

export function removeUnusedV11Images(): boolean {
  const { project, projectV11: session } = useEditorStore.getState();
  if (!project || !session) return false;
  const atlases = session.revision.atlases.filter((atlas) => atlas.entries.length > 0);
  if (atlases.length === session.revision.atlases.length) return true;
  commitProjectV11Edit(project, { revision: new V11AtlasRevision(atlases) });
  return true;
}

export function setV11AtlasEntry(
  layerId: string,
  atlasId: string,
  bounds: Omit<AtlasEntry, "layerId">,
): void {
  const { project, projectV11: session } = useEditorStore.getState();
  if (!project || !session) throw new Error("PROJECT_SESSION_CHANGED");
  const mapping = session.revision.entry(layerId);
  const target = session.revision.atlases.find((atlas) => atlas.id === atlasId);
  if (!mapping || !target) throw new Error("PROJECT_EDIT_INVALID");
  if (
    mapping.atlas.id === atlasId &&
    ["x", "y", "width", "height"].every((key) =>
      Object.is(
        mapping.entry[key as keyof typeof bounds],
        bounds[key as keyof typeof bounds],
      ),
    )
  )
    return;
  const atlases = session.revision.atlases
    .map((atlas) => ({
      ...atlas,
      entries:
        atlas === mapping.atlas && atlas.id === atlasId
          ? atlas.entries.map((entry) =>
              entry.layerId === layerId ? { layerId, ...bounds } : entry,
            )
          : [
              ...atlas.entries.filter((entry) => entry.layerId !== layerId),
              ...(atlas.id === atlasId ? [{ layerId, ...bounds }] : []),
            ],
    }))
    .filter(
      (atlas) =>
        atlas.id !== mapping.atlas.id ||
        mapping.atlas.id === atlasId ||
        atlas.entries.length > 0,
    );
  commitProjectV11Edit(project, { revision: new V11AtlasRevision(atlases) });
}

export function setV11RawUv(layerId: string, vertex: number, u: number, v: number): void {
  if (
    !useEditorStore.getState().projectV11 ||
    !Number.isInteger(vertex) ||
    vertex < 0 ||
    !Number.isFinite(u) ||
    !Number.isFinite(v)
  )
    throw new Error("PROJECT_EDIT_INVALID");
  mutateProject((project) => {
    const layer = findLayerById(project.layers, layerId);
    if (layer?.kind !== "viviMesh" || vertex * 2 + 1 >= layer.mesh.uvs.length)
      throw new Error("PROJECT_EDIT_INVALID");
    layer.mesh.uvs[vertex * 2] = u;
    layer.mesh.uvs[vertex * 2 + 1] = v;
  }, `v11-uv:${layerId}:${vertex}`);
}

export function mapV11GeneratedUvs(layerId: string, mesh: MeshData): MeshData {
  return mapAtlasEntryUvs(useEditorStore.getState().projectV11?.revision, layerId, mesh);
}

export function v11EntryCanvas(layerId: string): HTMLCanvasElement | undefined {
  return createAtlasEntryCanvas(useEditorStore.getState().projectV11?.revision, layerId);
}
