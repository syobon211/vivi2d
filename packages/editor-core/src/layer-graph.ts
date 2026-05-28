import type { LayerNode, LayerSemanticRole, ProjectData } from "@vivi2d/core/types";
import { isBone, isViviMesh } from "@vivi2d/core/types";

export const LAYER_GRAPH_VERSION = 1;

export type LayerGraphSemantic =
  | "face"
  | "eye"
  | "mouth"
  | "frontHair"
  | "backHair"
  | "sideHair"
  | "body"
  | "arm"
  | "leg"
  | "tail"
  | "clothing"
  | "sleeve"
  | "accessory"
  | "unknown";

export type LayerGraphAlphaMode = "binary" | "soft" | "matte";

export type LayerGraphProvenance =
  | "source"
  | "user"
  | "providerProposal"
  | "generatedHidden";

export interface SourceAsset {
  id: string;
  width: number;
  height: number;
  originalChecksum?: string;
  sourceKind?: ProjectData["sourceKind"];
}

export interface LayerGraphNode {
  id: string;
  sourceLayerIds: string[];
  semantic: LayerGraphSemantic;
  maskId: string;
  alphaMode: LayerGraphAlphaMode;
  provenance: LayerGraphProvenance;
  confidence: number;
}

export interface LayerOcclusionEdge {
  id: string;
  foregroundNodeId: string;
  lowerNodeId: string;
  overlapMaskId?: string;
  underpaintId?: string;
  confidence: number;
}

export type QualityGateId =
  | "rest_recompose_delta"
  | "protected_crop_delta"
  | "stress_pose_delta"
  | "duplicate_contour_score"
  | "alpha_halo_score"
  | "hidden_reveal_score"
  | "runtime_profile_scan"
  | "provider_boundary_scan";

export type QualityGateStatus = "pass" | "warning" | "fail" | "notRun";

export interface QualityGateResult {
  id: QualityGateId;
  status: QualityGateStatus;
  value?: number;
  threshold?: number;
  message?: string;
}

export interface LayerGraphQuality {
  gateResults: QualityGateResult[];
  accepted: boolean;
}

export interface LayerGraph {
  version: typeof LAYER_GRAPH_VERSION;
  id: string;
  sourceAssetId: string;
  nodes: LayerGraphNode[];
  occlusionEdges: LayerOcclusionEdge[];
  quality: LayerGraphQuality;
}

export interface LayerGraphValidationDiagnostic {
  severity: "error" | "warning";
  code:
    | "invalidGraphShape"
    | "invalidNodeShape"
    | "invalidOcclusionEdge"
    | "invalidQualityGate"
    | "unsafeProvenance"
    | "duplicateId";
  message: string;
  path?: string;
}

export interface LayerGraphValidationResult {
  ok: boolean;
  diagnostics: LayerGraphValidationDiagnostic[];
}

export interface AutoSetupAuditTrace {
  sourceAssetId: string;
  layerGraphId: string;
  acceptedNodeIds: string[];
  rejectedNodeIds: string[];
  qualityGateResults: QualityGateResult[];
  providerArtifactIds: string[];
  operationTrace: Array<{
    operationIndex: number;
    operationKind: string;
    sourceNodeIds: string[];
    sourceMaskIds: string[];
  }>;
  safePlanHash: string;
}

export interface LayerGraphProposalArtifact {
  id: string;
  kind:
    | "maskProposal"
    | "alphaMatte"
    | "underpaint"
    | "layerGraph"
    | "qualityReport";
  provenance: LayerGraphProvenance;
  confidence: number;
  mediaType?: string;
  sha256?: string;
}

const GRAPH_SEMANTICS = new Set<LayerGraphSemantic>([
  "face",
  "eye",
  "mouth",
  "frontHair",
  "backHair",
  "sideHair",
  "body",
  "arm",
  "leg",
  "tail",
  "clothing",
  "sleeve",
  "accessory",
  "unknown",
]);

const ALPHA_MODES = new Set<LayerGraphAlphaMode>(["binary", "soft", "matte"]);

const PROVENANCE_VALUES = new Set<LayerGraphProvenance>([
  "source",
  "user",
  "providerProposal",
  "generatedHidden",
]);

const QUALITY_GATE_IDS = new Set<QualityGateId>([
  "rest_recompose_delta",
  "protected_crop_delta",
  "stress_pose_delta",
  "duplicate_contour_score",
  "alpha_halo_score",
  "hidden_reveal_score",
  "runtime_profile_scan",
  "provider_boundary_scan",
]);

const QUALITY_GATE_STATUSES = new Set<QualityGateStatus>([
  "pass",
  "warning",
  "fail",
  "notRun",
]);

const protectedSemantics = new Set<LayerGraphSemantic>(["face", "eye", "mouth"]);
const protectedLayerSemantics = new Set<LayerSemanticRole>([
  "face",
  "eyeLeft",
  "eyeRight",
  "mouth",
]);

export function isProtectedLayerSemantic(
  role: LayerSemanticRole,
): role is "face" | "eyeLeft" | "eyeRight" | "mouth" {
  return protectedLayerSemantics.has(role);
}

export function isProtectedLayerGraphSemantic(value: LayerGraphSemantic): boolean {
  return protectedSemantics.has(value);
}

export function toLayerGraphSemantic(role: LayerSemanticRole): LayerGraphSemantic {
  switch (role) {
    case "head":
    case "face":
    case "nose":
      return "face";
    case "eyeLeft":
    case "eyeRight":
    case "eyebrowLeft":
    case "eyebrowRight":
      return "eye";
    case "mouth":
      return "mouth";
    case "hair":
    case "hairFront":
      return "frontHair";
    case "hairBack":
      return "backHair";
    case "hairSide":
      return "sideHair";
    case "body":
      return "body";
    case "armLeft":
    case "armRight":
    case "handLeft":
    case "handRight":
      return "arm";
    case "legLeft":
    case "legRight":
      return "leg";
    case "tail":
      return "tail";
    case "ear":
    case "accessory":
      return "accessory";
    case "unknown":
      return "unknown";
  }
}

export function normalizeProviderSemantic(value: string): {
  roles: readonly LayerSemanticRole[];
  ambiguous: boolean;
} {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  switch (normalized) {
    case "face":
    case "head":
      return { roles: ["face"], ambiguous: false };
    case "eye":
    case "eyes":
      return { roles: ["eyeLeft", "eyeRight"], ambiguous: true };
    case "lefteye":
    case "eyeleft":
      return { roles: ["eyeLeft"], ambiguous: false };
    case "righteye":
    case "eyeright":
      return { roles: ["eyeRight"], ambiguous: false };
    case "mouth":
      return { roles: ["mouth"], ambiguous: false };
    case "hair":
      return { roles: ["hair"], ambiguous: false };
    case "fronthair":
      return { roles: ["hairFront"], ambiguous: false };
    case "backhair":
      return { roles: ["hairBack"], ambiguous: false };
    case "sidehair":
      return { roles: ["hairSide"], ambiguous: false };
    case "body":
      return { roles: ["body"], ambiguous: false };
    case "arm":
    case "arms":
      return { roles: ["armLeft", "armRight"], ambiguous: true };
    case "leftarm":
    case "armleft":
      return { roles: ["armLeft"], ambiguous: false };
    case "rightarm":
    case "armright":
      return { roles: ["armRight"], ambiguous: false };
    case "tail":
      return { roles: ["tail"], ambiguous: false };
    case "accessory":
      return { roles: ["accessory"], ambiguous: false };
    default:
      return { roles: ["unknown"], ambiguous: false };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushDiagnostic(
  diagnostics: LayerGraphValidationDiagnostic[],
  diagnostic: LayerGraphValidationDiagnostic,
): void {
  diagnostics.push(diagnostic);
}

function isFinite01(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function normalizeLayerName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, "");
}

export function inferLayerGraphSemantic(layer: LayerNode): LayerGraphSemantic {
  if (layer.semanticRole && layer.semanticRole !== "unknown") {
    return toLayerGraphSemantic(layer.semanticRole);
  }

  const name = normalizeLayerName(layer.name);
  if (/eye|瞳|目|まつげ/.test(name)) return "eye";
  if (/mouth|口|lip/.test(name)) return "mouth";
  if (/face|head|顔|頭/.test(name)) return "face";
  if (/fronthair|bang|前髪/.test(name)) return "frontHair";
  if (/backhair|後髪|後ろ髪/.test(name)) return "backHair";
  if (/sidehair|横髪|耳/.test(name)) return "sideHair";
  if (/hair|髪/.test(name)) return "frontHair";
  if (/sleeve|袖/.test(name)) return "sleeve";
  if (/cloth|服|shirt|jacket|skirt|pants/.test(name)) return "clothing";
  if (/arm|hand|腕|手/.test(name)) return "arm";
  if (/leg|foot|脚|足/.test(name)) return "leg";
  if (/tail|尻尾/.test(name)) return "tail";
  if (/button|badge|accessory|飾|ボタン|バッジ/.test(name)) return "accessory";
  if (/body|torso|胴|体/.test(name)) return "body";
  return "unknown";
}

export function createSourceAssetFromProject(
  project: ProjectData,
  id = "source:project",
): SourceAsset {
  return {
    id,
    width: project.width,
    height: project.height,
    sourceKind: project.sourceKind,
  };
}

export function createLayerGraphFromProject(
  project: ProjectData,
  sourceAssetId = "source:project",
): LayerGraph {
  const nodes: LayerGraphNode[] = [];
  const visit = (layers: LayerNode[]): void => {
    for (const layer of layers) {
      if (!isBone(layer) && isViviMesh(layer)) {
        const semantic = inferLayerGraphSemantic(layer);
        nodes.push({
          id: `node:${layer.id}`,
          sourceLayerIds: [layer.id],
          semantic,
          maskId: `mask:${layer.id}`,
          alphaMode: layer.opacity < 1 ? "soft" : "binary",
          provenance:
            layer.importMetadata?.source === "seeThrough" &&
            !protectedSemantics.has(semantic)
              ? "providerProposal"
              : "source",
          confidence: semantic === "unknown" ? 0.45 : 0.9,
        });
      }
      if (layer.children.length > 0) visit(layer.children);
    }
  };
  visit(project.layers);
  const gateResults = buildDefaultLayerGraphGateResults(nodes);
  return {
    version: LAYER_GRAPH_VERSION,
    id: `layerGraph:${sourceAssetId}`,
    sourceAssetId,
    nodes,
    occlusionEdges: inferOcclusionEdges(nodes),
    quality: {
      gateResults,
      accepted: gateResults.every((gate) => gate.status !== "fail" && gate.status !== "notRun"),
    },
  };
}

export function buildDefaultLayerGraphGateResults(
  nodes: readonly LayerGraphNode[],
): QualityGateResult[] {
  const hasProtected = nodes.some((node) => protectedSemantics.has(node.semantic));
  const hasProvider = nodes.some((node) => node.provenance === "providerProposal");
  return [
    {
      id: "rest_recompose_delta",
      status: "warning",
      message: "Pixel readback metrics were not provided for this LayerGraph.",
    },
    {
      id: "protected_crop_delta",
      status: "warning",
      message: hasProtected
        ? "Protected face/eye/mouth layers require crop review before automatic apply."
        : "No protected semantic layer was detected.",
    },
    {
      id: "runtime_profile_scan",
      status: "pass",
      message: "LayerGraph compiles through SafeAutoSetupPlan before apply.",
    },
    {
      id: "provider_boundary_scan",
      status: hasProvider ? "warning" : "pass",
      message: hasProvider
        ? "Provider proposals require metadata stripping before runtime export."
        : "No provider-generated proposal nodes were detected.",
    },
  ];
}

export function inferOcclusionEdges(
  nodes: readonly LayerGraphNode[],
): LayerOcclusionEdge[] {
  const edges: LayerOcclusionEdge[] = [];
  const hairNodes = nodes.filter((node) =>
    node.semantic === "frontHair" ||
    node.semantic === "backHair" ||
    node.semantic === "sideHair" ||
    node.semantic === "tail"
  );
  const lowerNodes = nodes.filter((node) =>
    node.semantic === "face" || node.semantic === "body" || node.semantic === "clothing"
  );
  for (const foreground of hairNodes) {
    for (const lower of lowerNodes) {
      if (foreground.id === lower.id) continue;
      edges.push({
        id: `edge:${foreground.id}:${lower.id}`,
        foregroundNodeId: foreground.id,
        lowerNodeId: lower.id,
        confidence: Math.min(foreground.confidence, lower.confidence),
      });
    }
  }
  return edges;
}

function validateLayerGraphNode(
  node: unknown,
  index: number,
  diagnostics: LayerGraphValidationDiagnostic[],
): LayerGraphNode | null {
  const path = `nodes[${index}]`;
  if (!isRecord(node)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidNodeShape",
      message: "LayerGraph node must be an object.",
      path,
    });
    return null;
  }
  if (typeof node.id !== "string" || node.id === "") {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidNodeShape",
      message: "LayerGraph node id is required.",
      path: `${path}.id`,
    });
  }
  if (
    !Array.isArray(node.sourceLayerIds) ||
    node.sourceLayerIds.length === 0 ||
    node.sourceLayerIds.some((id) => typeof id !== "string" || id === "")
  ) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidNodeShape",
      message: "LayerGraph node sourceLayerIds must be non-empty strings.",
      path: `${path}.sourceLayerIds`,
    });
  }
  if (typeof node.semantic !== "string" || !GRAPH_SEMANTICS.has(node.semantic as never)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidNodeShape",
      message: "LayerGraph node semantic is unsupported.",
      path: `${path}.semantic`,
    });
  }
  if (typeof node.maskId !== "string" || node.maskId === "") {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidNodeShape",
      message: "LayerGraph node maskId is required.",
      path: `${path}.maskId`,
    });
  }
  if (typeof node.alphaMode !== "string" || !ALPHA_MODES.has(node.alphaMode as never)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidNodeShape",
      message: "LayerGraph node alphaMode is unsupported.",
      path: `${path}.alphaMode`,
    });
  }
  if (
    typeof node.provenance !== "string" ||
    !PROVENANCE_VALUES.has(node.provenance as never)
  ) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidNodeShape",
      message: "LayerGraph node provenance is unsupported.",
      path: `${path}.provenance`,
    });
  }
  if (!isFinite01(node.confidence)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidNodeShape",
      message: "LayerGraph node confidence must be a finite value in [0, 1].",
      path: `${path}.confidence`,
    });
  }
  if (
    (node.provenance === "generatedHidden" ||
      node.provenance === "providerProposal") &&
    protectedSemantics.has(node.semantic as never)
  ) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "unsafeProvenance",
      message:
        "Generated/provider pixels cannot own protected face, eye, or mouth layers.",
      path: `${path}.provenance`,
    });
  }
  return node as unknown as LayerGraphNode;
}

function validateQualityGate(
  gate: unknown,
  index: number,
  diagnostics: LayerGraphValidationDiagnostic[],
): void {
  const path = `quality.gateResults[${index}]`;
  if (!isRecord(gate)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidQualityGate",
      message: "Quality gate result must be an object.",
      path,
    });
    return;
  }
  if (typeof gate.id !== "string" || !QUALITY_GATE_IDS.has(gate.id as never)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidQualityGate",
      message: "Quality gate id is unsupported.",
      path: `${path}.id`,
    });
  }
  if (
    typeof gate.status !== "string" ||
    !QUALITY_GATE_STATUSES.has(gate.status as never)
  ) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidQualityGate",
      message: "Quality gate status is unsupported.",
      path: `${path}.status`,
    });
  }
  if (gate.value !== undefined && typeof gate.value !== "number") {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidQualityGate",
      message: "Quality gate value must be numeric when present.",
      path: `${path}.value`,
    });
  }
}

export function validateLayerGraph(value: unknown): LayerGraphValidationResult {
  const diagnostics: LayerGraphValidationDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "invalidGraphShape",
          message: "LayerGraph must be an object.",
        },
      ],
    };
  }
  if (value.version !== LAYER_GRAPH_VERSION) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidGraphShape",
      message: `LayerGraph version must be ${LAYER_GRAPH_VERSION}.`,
      path: "version",
    });
  }
  if (typeof value.id !== "string" || value.id === "") {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidGraphShape",
      message: "LayerGraph id is required.",
      path: "id",
    });
  }
  if (typeof value.sourceAssetId !== "string" || value.sourceAssetId === "") {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidGraphShape",
      message: "LayerGraph sourceAssetId is required.",
      path: "sourceAssetId",
    });
  }
  const nodeIds = new Set<string>();
  if (!Array.isArray(value.nodes)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidGraphShape",
      message: "LayerGraph nodes must be an array.",
      path: "nodes",
    });
  } else {
    value.nodes.forEach((node, index) => {
      const parsed = validateLayerGraphNode(node, index, diagnostics);
      if (!parsed) return;
      if (nodeIds.has(parsed.id)) {
        pushDiagnostic(diagnostics, {
          severity: "error",
          code: "duplicateId",
          message: `Duplicate LayerGraph node id: ${parsed.id}`,
          path: `nodes[${index}].id`,
        });
      }
      nodeIds.add(parsed.id);
    });
  }
  if (!Array.isArray(value.occlusionEdges)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidGraphShape",
      message: "LayerGraph occlusionEdges must be an array.",
      path: "occlusionEdges",
    });
  } else {
    value.occlusionEdges.forEach((edge, index) => {
      if (!isRecord(edge)) {
        pushDiagnostic(diagnostics, {
          severity: "error",
          code: "invalidOcclusionEdge",
          message: "LayerGraph occlusion edge must be an object.",
          path: `occlusionEdges[${index}]`,
        });
        return;
      }
      if (
        typeof edge.foregroundNodeId !== "string" ||
        !nodeIds.has(edge.foregroundNodeId) ||
        typeof edge.lowerNodeId !== "string" ||
        !nodeIds.has(edge.lowerNodeId)
      ) {
        pushDiagnostic(diagnostics, {
          severity: "error",
          code: "invalidOcclusionEdge",
          message: "Occlusion edge must reference existing foreground and lower nodes.",
          path: `occlusionEdges[${index}]`,
        });
      }
      if (!isFinite01(edge.confidence)) {
        pushDiagnostic(diagnostics, {
          severity: "error",
          code: "invalidOcclusionEdge",
          message: "Occlusion edge confidence must be in [0, 1].",
          path: `occlusionEdges[${index}].confidence`,
        });
      }
    });
  }
  if (!isRecord(value.quality) || !Array.isArray(value.quality.gateResults)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidGraphShape",
      message: "LayerGraph quality.gateResults must be an array.",
      path: "quality",
    });
  } else {
    if (typeof value.quality.accepted !== "boolean") {
      pushDiagnostic(diagnostics, {
        severity: "error",
        code: "invalidQualityGate",
        message: "LayerGraph quality.accepted must be a boolean.",
        path: "quality.accepted",
      });
    }
    if (
      value.quality.accepted === true &&
      value.quality.gateResults.some(
        (gate: unknown) =>
          isRecord(gate) && (gate.status === "fail" || gate.status === "notRun"),
      )
    ) {
      pushDiagnostic(diagnostics, {
        severity: "error",
        code: "invalidQualityGate",
        message:
          "LayerGraph quality.accepted cannot be true with fail or notRun gates.",
        path: "quality.accepted",
      });
    }
    value.quality.gateResults.forEach((gate, index) =>
      validateQualityGate(gate, index, diagnostics),
    );
  }
  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics,
  };
}

export function assertLayerGraph(value: unknown): LayerGraph {
  const validation = validateLayerGraph(value);
  if (!validation.ok) {
    throw new Error(
      validation.diagnostics[0]?.message ?? "LayerGraph validation failed.",
    );
  }
  return value as LayerGraph;
}
