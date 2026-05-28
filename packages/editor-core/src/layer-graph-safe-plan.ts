import {
  assertSafeAutoSetupPlan,
  stableStringify,
  type SafeAutoSetupOperation,
  type SafeAutoSetupPlan,
} from "./safe-auto-setup-plan";
import {
  assertLayerGraph,
  type AutoSetupAuditTrace,
  type LayerGraph,
  type QualityGateResult,
} from "./layer-graph";

export interface LayerGraphCompileOptions {
  allowBbwSolver?: boolean;
  providerArtifactIds?: string[];
  excludedSourceLayerIds?: Iterable<string>;
  minAcceptedNodeConfidence?: number;
}

export const LAYER_GRAPH_DEFAULT_ACCEPTANCE_CONFIDENCE = 0.5;

export class SafeAutoSetupAuditHashUnsupportedError extends Error {
  constructor() {
    super("Safe Auto Setup audit hashing requires SubtleCrypto SHA-256 support.");
    this.name = "SafeAutoSetupAuditHashUnsupportedError";
  }
}

export interface LayerGraphCompileInput {
  layerGraph: LayerGraph;
  plan: SafeAutoSetupPlan;
  operationSourceNodeIds?: Record<number, string[]>;
}

export interface LayerGraphCompileResult {
  plan: SafeAutoSetupPlan;
  auditTrace: AutoSetupAuditTrace;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSafeDiagnosticPathValue(value: unknown, path: string): void {
  if (value === undefined) return;
  if (typeof value !== "string") {
    throw new Error(`Safe Auto Setup diagnostic path must be a string at ${path}.`);
  }
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`Safe Auto Setup audit hash cannot include host path ${path}.`);
  }
}

function assertNoUnsafeAuditFields(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnsafeAuditFields(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const isDiagnosticPath =
      path.startsWith("$.diagnostics[") && key === "path";
    if (isDiagnosticPath) {
      assertSafeDiagnosticPathValue(child, `${path}.${key}`);
    }
    if (
      !isDiagnosticPath &&
      /^(timestamp|generatedAt|localPath|hostPath|sourcePath|path)$/i.test(key)
    ) {
      throw new Error(`Safe Auto Setup audit hash cannot include ${path}.${key}.`);
    }
    assertNoUnsafeAuditFields(child, `${path}.${key}`);
  }
}

export function canonicalizeJson(value: unknown): unknown {
  if (value === undefined) return { "$vivi2dUndefined": true };
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item));
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if ((value as Record<string, unknown>)[key] === undefined) continue;
    const canonical = canonicalizeJson((value as Record<string, unknown>)[key]);
    out[key] = canonical;
  }
  return out;
}

async function createSha256Hex(payload: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new SafeAutoSetupAuditHashUnsupportedError();
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSafePlanHash(plan: SafeAutoSetupPlan): Promise<string> {
  assertNoUnsafeAuditFields(plan);
  const canonical = canonicalizeJson(plan);
  return `sha256:${await createSha256Hex(stableStringify(canonical))}`;
}

export function assertLayerGraphPlanPolicy(
  plan: SafeAutoSetupPlan,
  options: LayerGraphCompileOptions = {},
): void {
  for (const [index, operation] of plan.operations.entries()) {
    if (
      operation.kind === "createSkin" &&
      operation.solver === "bbw" &&
      !options.allowBbwSolver
    ) {
      throw new Error(
        `Safe Auto Setup operation ${index} uses bbw before the BBW review gate.`,
      );
    }
    if (
      operation.kind === "createBinding" &&
      operation.target.type !== "bone" &&
      operation.target.type !== "ikController"
    ) {
      throw new Error(
        `Safe Auto Setup operation ${index} has an unsupported binding target.`,
      );
    }
  }
}

function sourceMaskIdsForNodes(layerGraph: LayerGraph, nodeIds: readonly string[]): string[] {
  const masks = new Set<string>();
  for (const nodeId of nodeIds) {
    const node = layerGraph.nodes.find((candidate) => candidate.id === nodeId);
    if (node) masks.add(node.maskId);
  }
  return [...masks].sort();
}

function sourceNodeIdsForOperation(
  layerGraph: LayerGraph,
  operation: SafeAutoSetupOperation,
  excludedSourceLayerIds: ReadonlySet<string>,
  minAcceptedNodeConfidence: number,
): string[] {
  if ("layerId" in operation && typeof operation.layerId === "string") {
    if (excludedSourceLayerIds.has(operation.layerId)) return [];
    return layerGraph.nodes
      .filter(
        (node) =>
          node.confidence >= minAcceptedNodeConfidence &&
          node.provenance !== "generatedHidden" &&
          node.sourceLayerIds.includes(operation.layerId) &&
          !node.sourceLayerIds.some((layerId) =>
            excludedSourceLayerIds.has(layerId),
          ),
      )
      .map((node) => node.id)
      .sort();
  }
  return acceptedNodeIds(
    layerGraph,
    excludedSourceLayerIds,
    minAcceptedNodeConfidence,
  );
}

function acceptedNodeIds(
  layerGraph: LayerGraph,
  excludedSourceLayerIds: ReadonlySet<string> = new Set<string>(),
  minAcceptedNodeConfidence = LAYER_GRAPH_DEFAULT_ACCEPTANCE_CONFIDENCE,
): string[] {
  return layerGraph.nodes
    .filter(
      (node) =>
        node.confidence >= minAcceptedNodeConfidence &&
        node.provenance !== "generatedHidden" &&
        !node.sourceLayerIds.some((layerId) => excludedSourceLayerIds.has(layerId)),
    )
    .map((node) => node.id)
    .sort();
}

function rejectedNodeIds(
  layerGraph: LayerGraph,
  excludedSourceLayerIds: ReadonlySet<string>,
  minAcceptedNodeConfidence: number,
): string[] {
  const accepted = new Set(
    acceptedNodeIds(layerGraph, excludedSourceLayerIds, minAcceptedNodeConfidence),
  );
  return layerGraph.nodes
    .filter((node) => !accepted.has(node.id))
    .map((node) => node.id)
    .sort();
}

export function hasBlockingQualityGate(gates: readonly QualityGateResult[]): boolean {
  return gates.some((gate) => gate.status === "fail");
}

export async function compileLayerGraphSafeAutoSetupPlan(
  input: LayerGraphCompileInput,
  options: LayerGraphCompileOptions = {},
): Promise<LayerGraphCompileResult> {
  const layerGraph = assertLayerGraph(input.layerGraph);
  const plan = assertSafeAutoSetupPlan(input.plan, {
    allowBbwSolver: options.allowBbwSolver,
  });
  if (
    !layerGraph.quality.accepted ||
    hasBlockingQualityGate(layerGraph.quality.gateResults)
  ) {
    throw new Error("LayerGraph contains failing quality gates.");
  }
  assertLayerGraphPlanPolicy(plan, options);
  const excludedSourceLayerIds = new Set(options.excludedSourceLayerIds ?? []);
  const minAcceptedNodeConfidence =
    options.minAcceptedNodeConfidence ??
    LAYER_GRAPH_DEFAULT_ACCEPTANCE_CONFIDENCE;

  const operationTrace = plan.operations.map((operation, operationIndex) => {
    const sourceNodeIds =
      input.operationSourceNodeIds?.[operationIndex] ??
      sourceNodeIdsForOperation(
        layerGraph,
        operation,
        excludedSourceLayerIds,
        minAcceptedNodeConfidence,
      );
    return {
      operationIndex,
      operationKind: operation.kind,
      sourceNodeIds: [...sourceNodeIds].sort(),
      sourceMaskIds: sourceMaskIdsForNodes(layerGraph, sourceNodeIds),
    };
  });

  return {
    plan,
    auditTrace: {
      sourceAssetId: layerGraph.sourceAssetId,
      layerGraphId: layerGraph.id,
      acceptedNodeIds: acceptedNodeIds(
        layerGraph,
        excludedSourceLayerIds,
        minAcceptedNodeConfidence,
      ),
      rejectedNodeIds: rejectedNodeIds(
        layerGraph,
        excludedSourceLayerIds,
        minAcceptedNodeConfidence,
      ),
      qualityGateResults: layerGraph.quality.gateResults,
      providerArtifactIds: [...(options.providerArtifactIds ?? [])].sort(),
      operationTrace,
      safePlanHash: await createSafePlanHash(plan),
    },
  };
}
