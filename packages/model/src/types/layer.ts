export type LayerId = string;

export type ParameterId = string;

export type ClipId = string;

export type SceneId = string;

export type PhysicsGroupId = string;

export type LayerSemanticRole =
  | "head"
  | "face"
  | "eyeLeft"
  | "eyeRight"
  | "eyebrowLeft"
  | "eyebrowRight"
  | "mouth"
  | "nose"
  | "hair"
  | "hairFront"
  | "hairBack"
  | "hairSide"
  | "body"
  | "armLeft"
  | "armRight"
  | "handLeft"
  | "handRight"
  | "legLeft"
  | "legRight"
  | "tail"
  | "ear"
  | "accessory"
  | "unknown";

export type LayerSemanticRoleSource = "seeThroughImport" | "manual" | "assistant";

export type LayerRiggingHint = "rigid" | "localBones" | "skinned" | "physics";

export interface ProviderProposalAudit {
  providerId: string;
  capabilityId: string;
  proposalId: string;
  confidence?: number;
  convertedAt?: string;
}

export type ManualSplitOutputMetadata =
  | {
      kind: "maskExtractedLayer";
      ownership: "userAccepted";
      origin: "manualMask";
      manualSplitLayerId: LayerId;
      manualSplitSourceLayerId: LayerId;
      manualSplitSourceFingerprint: string;
      manualSplitMaskId: string;
      maskCoverage: number;
      edgeFeatherPx: number;
      customLabel?: string;
      convertedFromProviderProposal?: never;
    }
  | {
      kind: "maskExtractedLayer";
      ownership: "userAccepted";
      origin: "providerProposal";
      manualSplitLayerId: LayerId;
      manualSplitSourceLayerId: LayerId;
      manualSplitSourceFingerprint: string;
      manualSplitMaskId: string;
      maskCoverage: number;
      edgeFeatherPx: number;
      customLabel?: string;
      convertedFromProviderProposal: ProviderProposalAudit & { convertedAt: string };
    }
  | {
      kind: "generatedUnderpaintLayer";
      ownership: "userAccepted";
      origin: "localUnderpaint";
      manualSplitLayerId: LayerId;
      manualSplitSourceLayerId: LayerId;
      manualSplitSourceFingerprint: string;
      underpaintBufferId: string;
      bounds: { x: number; y: number; width: number; height: number };
      sourceMaskId?: string;
      occludedByMaskId?: string;
      acceptedAt: string;
      providerAudit?: never;
    }
  | {
      kind: "generatedUnderpaintLayer";
      ownership: "userAccepted";
      origin: "providerUnderpaint";
      manualSplitLayerId: LayerId;
      manualSplitSourceLayerId: LayerId;
      manualSplitSourceFingerprint: string;
      underpaintBufferId: string;
      bounds: { x: number; y: number; width: number; height: number };
      sourceMaskId?: string;
      occludedByMaskId?: string;
      acceptedAt: string;
      providerAudit: ProviderProposalAudit;
    };

export type LayerImportLrSplit = "left" | "right" | "center" | "unknown";
export type LayerImportFbSplit = "front" | "back" | "middle" | "unknown";

export interface LayerDepthStats {
  min: number;
  max: number;
  mean: number;
}

export interface SeeThroughImportMetadata {
  label: string;
  order: number;
  psdLeafToken?: string;
  confidence: number;
  leftRightSplit: LayerImportLrSplit;
  frontBackSplit: LayerImportFbSplit;
  bbox: [number, number, number, number];
  depthStats: LayerDepthStats;
}

export type ManualPngPlacementMode = "preserveImageOffset" | "centerOnCanvas";

export interface ManualPngImportMetadata {
  sourceFileName: string;
  sourcePath?: string;
  originalWidth: number;
  originalHeight: number;
  trimmedBounds: [number, number, number, number];
  finalOrigin: [number, number];
  placementMode: ManualPngPlacementMode;
  trimTransparentBoundsApplied?: boolean;
  autoGenerateMeshApplied: boolean;
}

export interface SeeThroughLayerImportMetadata {
  source: "seeThrough";
  seeThrough: SeeThroughImportMetadata;
  manualPng?: never;
}

export interface ManualPngLayerImportMetadata {
  source: "manualPng";
  seeThrough?: never;
  manualPng: ManualPngImportMetadata;
}

export type LayerImportMetadata =
  | SeeThroughLayerImportMetadata
  | ManualPngLayerImportMetadata;

export function isSeeThroughLayerImportMetadata(
  metadata: LayerImportMetadata | undefined,
): metadata is SeeThroughLayerImportMetadata {
  return metadata?.source === "seeThrough" && metadata.seeThrough != null;
}

export function isManualPngLayerImportMetadata(
  metadata: LayerImportMetadata | undefined,
): metadata is ManualPngLayerImportMetadata {
  return metadata?.source === "manualPng" && metadata.manualPng != null;
}

export function getSeeThroughImportMetadata(
  metadata: LayerImportMetadata | undefined,
): SeeThroughImportMetadata | undefined {
  return isSeeThroughLayerImportMetadata(metadata) ? metadata.seeThrough : undefined;
}

export function getManualPngImportMetadata(
  metadata: LayerImportMetadata | undefined,
): ManualPngImportMetadata | undefined {
  return isManualPngLayerImportMetadata(metadata) ? metadata.manualPng : undefined;
}

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export type NodeKind = "viviMesh" | "group" | "bone" | "artPath";

export type BlendMode =
  | "normal"
  | "add"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion";

export type AffineMatrix = [number, number, number, number, number, number];

export interface MeshData {
  vertices: number[];

  uvs: number[];

  indices: number[];
  divisionsX: number;
  divisionsY: number;
}

export interface NodeBase {
  id: LayerId;
  name: string;
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  blendMode: BlendMode;
  expanded: boolean;

  children: LayerNode[];

  clipMaskIds?: LayerId[];

  drawOrder?: number;

  multiplyColor?: RGBColor;

  screenColor?: RGBColor;

  semanticRole?: LayerSemanticRole;
  semanticRoleSource?: LayerSemanticRoleSource;
  riggingHint?: LayerRiggingHint;
  manualSplitOutputMetadata?: ManualSplitOutputMetadata;

  importMetadata?: LayerImportMetadata;

  managedTag?: string;
  managedSignature?: string;
  managedSourceFingerprint?: string;
  manualSplitSourceLayerId?: LayerId;
  manualSplitSourceFingerprint?: string;
  manualSplitLayerId?: LayerId;
}

/**
 * Drawable mesh node in the Vivi2D scene graph.
 */
export interface ViviMeshNode extends NodeBase {
  kind: "viviMesh";
  mesh: MeshData;

  culling?: boolean;
}

export type DrawableMeshNode = ViviMeshNode;

export interface GroupNode extends NodeBase {
  kind: "group";
}

export interface BoneData {
  angle: number;

  length: number;

  scaleX: number;
  scaleY: number;
}

export type BoneRigConfig = BoneData;

export interface BoneNode extends NodeBase {
  kind: "bone";
  bone: BoneData;

  parentBoneId?: LayerId;
}

// --- ArtPath ---

export interface ArtPathControlPoint {
  x: number;

  y: number;

  handleInX: number;

  handleInY: number;

  handleOutX: number;

  handleOutY: number;

  width: number;

  opacity: number;
}

export interface ArtPathStyle {
  color: number;

  baseWidth: number;

  lineCap: "butt" | "round" | "square";

  lineJoin: "miter" | "round" | "bevel";
}

export interface ArtPathNode extends NodeBase {
  kind: "artPath";

  controlPoints: ArtPathControlPoint[];

  closed: boolean;

  style: ArtPathStyle;
}

export type LayerNode =
  | ViviMeshNode
  | GroupNode
  | BoneNode
  | ArtPathNode;

// --- Type Guards ---

export function isViviMesh(node: LayerNode): node is ViviMeshNode {
  return node.kind === "viviMesh";
}

export function isGroup(node: LayerNode): node is GroupNode {
  return node.kind === "group";
}

export function isBone(node: LayerNode): node is BoneNode {
  return node.kind === "bone";
}

export function isArtPath(node: LayerNode): node is ArtPathNode {
  return node.kind === "artPath";
}

export function hasChildren(node: LayerNode): node is GroupNode | BoneNode {
  return node.kind === "group" || node.kind === "bone";
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected node kind: ${JSON.stringify(value)}`);
}
