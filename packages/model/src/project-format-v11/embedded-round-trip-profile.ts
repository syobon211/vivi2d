import { parseProjectFormatV11Json, serializeProjectFormatV11Ordinary } from "./codec";
import { ProjectFormatV11SemanticError } from "./errors";
import {
  canonicalizeJsonV11,
  PROJECT_FORMAT_V11_JSON_LIMITS,
  ProjectFormatV11JsonError,
  parseJsonV11,
} from "./json-contract";
import {
  cloneJsonDetached,
  decodeRawBase64,
  decodeUtf8Fatal,
  encodeUtf8,
  utf8ByteLength,
} from "./portable-primitives";
import { validateProjectFormatV11Schema } from "./schema";
import type { Sha256V11 } from "./types";

export type ProjectCandidateErrorCode =
  | "PROJECT_CARRIER_INVALID"
  | "PROJECT_JSON_INVALID"
  | "PROJECT_SCHEMA_INVALID"
  | "PROJECT_PROFILE_UNSUPPORTED"
  | "PROJECT_LIMIT_EXCEEDED"
  | "PROJECT_SEMANTIC_INVALID"
  | "PROJECT_PNG_MALFORMED"
  | "PROJECT_PNG_UNSUPPORTED"
  | "PROJECT_PNG_DIMENSION"
  | "PROJECT_INTERNAL";
export type EmbeddedRoundTripResult =
  | {
      ok: true;
      profile: "vivi2d.projectFormat.v11.embeddedRoundTrip.draft1";
      documentId: string;
      canonicalUtf8: Uint8Array;
    }
  | { ok: false; code: ProjectCandidateErrorCode; path: string };
export interface EmbeddedRoundTripPorts {
  sha256: Sha256V11;
  /** Trusted pure integration port: success must mean full, bounded PNG decode. */
  verifyPng(
    bytes: Uint8Array,
    width: number,
    height: number,
  ): Promise<"ok" | "malformed" | "unsupported" | "limit" | "dimension">;
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown) => value as ObjectValue;
const array = (value: unknown) => value as unknown[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const PARAMETER_ID = /^[A-Za-z0-9_.-]{1,128}$/;
const ATLAS_ID = /^[A-Za-z0-9_-]{1,120}$/;
const OPTIONAL_ARRAYS = [
  "parameterBindings",
  "sceneBlends",
  "ikControllers",
  "offscreenTargets",
  "expressionPresets",
] as const;
const PROJECT_FIELDS = [
  "name",
  "width",
  "height",
  "layers",
  "parameters",
  "clips",
  "scenes",
  "physicsGroups",
  "lipsyncConfig",
  "skins",
  ...OPTIONAL_ARRAYS,
  "colliders",
  "stateMachines",
];
const COMMON_LAYER_FIELDS = [
  "id",
  "name",
  "visible",
  "opacity",
  "x",
  "y",
  "width",
  "height",
  "blendMode",
  "expanded",
  "children",
  "kind",
  "drawOrder",
  "multiplyColor",
  "screenColor",
  "clipMaskIds",
  "clipMasks",
];
const INERT_LIPSYNC = {
  enabled: false,
  targetParameterId: null,
  source: "microphone",
  threshold: 0.02,
  smoothing: 0.7,
  gain: 2,
};
const LIMITS = {
  atlases: 32,
  axis: 8192,
  pixels: 67108864,
  png: 16777216,
  encoded: 22369624,
  totalPng: 67108864,
  rgba: 268435456,
  layers: 4096,
  meshes: 1024,
  bones: 1024,
  parameters: 2048,
  controllers: 256,
  vertices: 65536,
  indices: 196608,
  bindings: 8192,
  points: 8192,
  entries: 1024,
} as const;

class CandidateFault {
  constructor(
    readonly code: ProjectCandidateErrorCode,
    readonly path = "",
  ) {}
}
export function candidateFailure(code: ProjectCandidateErrorCode, path = ""): never {
  throw new CandidateFault(code, path);
}
export async function candidateBoundary(
  action: () => Promise<EmbeddedRoundTripResult>,
): Promise<EmbeddedRoundTripResult> {
  try {
    return await action();
  } catch (error) {
    return error instanceof CandidateFault
      ? { ok: false, code: error.code, path: error.path }
      : { ok: false, code: "PROJECT_INTERNAL", path: "" };
  }
}
export function requireCandidateDocumentId(value: string): void {
  if (typeof value !== "string" || !UUID.test(value))
    candidateFailure("PROJECT_PROFILE_UNSUPPORTED");
}
function closed(value: ObjectValue, keys: readonly string[], path: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    candidateFailure("PROJECT_PROFILE_UNSUPPORTED", path);
}
function identifier(value: unknown, path: string, pattern = ID): void {
  if (typeof value !== "string" || !pattern.test(value))
    candidateFailure("PROJECT_PROFILE_UNSUPPORTED", path);
}
function name(value: unknown, path: string): void {
  if (typeof value !== "string") candidateFailure("PROJECT_PROFILE_UNSUPPORTED", path);
  if (utf8ByteLength(value) > 1024) candidateFailure("PROJECT_LIMIT_EXCEEDED", path);
}
function integer(
  value: unknown,
  path: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min)
    candidateFailure("PROJECT_PROFILE_UNSUPPORTED", path);
  if (value > max) candidateFailure("PROJECT_LIMIT_EXCEEDED", path);
}
function count(value: unknown[], limit: number, path: string): void {
  if (value.length > limit) candidateFailure("PROJECT_LIMIT_EXCEEDED", path);
}
function jsonFailure(error: unknown): never {
  if (error instanceof ProjectFormatV11JsonError) {
    const limit = [
      "VIVI_FMT_JSON_TOO_LARGE",
      "VIVI_FMT_DEPTH_EXCEEDED",
      "VIVI_FMT_TOKEN_LIMIT_EXCEEDED",
      "VIVI_FMT_STRING_TOO_LARGE",
    ].includes(error.code);
    candidateFailure(limit ? "PROJECT_LIMIT_EXCEEDED" : "PROJECT_JSON_INVALID");
  }
  candidateFailure("PROJECT_INTERNAL");
}

/** Shared only by the two internal candidate modules; never returns raw diagnostics. */
export function readCandidateSource(input: Uint8Array): {
  wire: ObjectValue;
  canonical: string;
} {
  if (!(input instanceof Uint8Array)) candidateFailure("PROJECT_CARRIER_INVALID");
  if (input.byteLength > PROJECT_FORMAT_V11_JSON_LIMITS.maxInputUtf8Bytes)
    candidateFailure("PROJECT_LIMIT_EXCEEDED");
  const owned = new Uint8Array(input);
  if (owned[0] === 0xef && owned[1] === 0xbb && owned[2] === 0xbf)
    candidateFailure("PROJECT_CARRIER_INVALID");
  let source: string;
  try {
    source = decodeUtf8Fatal(owned);
  } catch {
    candidateFailure("PROJECT_CARRIER_INVALID");
  }
  let value: unknown, canonical: string;
  try {
    value = parseJsonV11(source);
    canonical = canonicalizeJsonV11(value);
  } catch (error) {
    jsonFailure(error);
  }
  if (validateProjectFormatV11Schema(value).length !== 0)
    candidateFailure("PROJECT_SCHEMA_INVALID");
  return { wire: object(value), canonical };
}

/** Schema precedes this fixed, candidate-owned traversal. Map keys never enter paths. */
export function checkCandidateProfile(wire: ObjectValue, legacy = false): void {
  closed(
    wire,
    legacy
      ? ["version", "profile", "project", "atlases"]
      : ["version", "assetMode", "documentId", "project", "atlases"],
    "",
  );
  if (
    legacy
      ? wire.version !== 9 && wire.version !== 10
      : wire.version !== 11 || wire.assetMode !== "embedded"
  )
    candidateFailure("PROJECT_PROFILE_UNSUPPORTED");
  if (!legacy && (typeof wire.documentId !== "string" || !UUID.test(wire.documentId)))
    candidateFailure("PROJECT_PROFILE_UNSUPPORTED", "/documentId");
  const project = object(wire.project);
  closed(project, PROJECT_FIELDS, "/project");
  name(project.name, "/project/name");
  integer(project.width, "/project/width", 1);
  integer(project.height, "/project/height", 1);
  for (const key of [
    "clips",
    "scenes",
    "physicsGroups",
    "sceneBlends",
    "offscreenTargets",
    "expressionPresets",
    "colliders",
    "stateMachines",
  ]) {
    if (project[key] !== undefined && array(project[key]).length !== 0)
      candidateFailure("PROJECT_PROFILE_UNSUPPORTED", `/project/${key}`);
  }
  if (
    project.lipsyncConfig !== undefined &&
    canonicalizeJsonV11(project.lipsyncConfig) !== canonicalizeJsonV11(INERT_LIPSYNC)
  )
    candidateFailure("PROJECT_PROFILE_UNSUPPORTED", "/project/lipsyncConfig");
  let layers = 0,
    meshes = 0,
    bones = 0;
  function visitLayer(value: unknown, path: string): void {
    const layer = object(value),
      kind = layer.kind;
    const specific =
      kind === "group"
        ? []
        : kind === "bone"
          ? ["bone", "parentBoneId"]
          : kind === "viviMesh"
            ? ["mesh", "culling"]
            : null;
    if (!specific) candidateFailure("PROJECT_PROFILE_UNSUPPORTED", `${path}/kind`);
    closed(layer, [...COMMON_LAYER_FIELDS, ...specific], path);
    if (++layers > LIMITS.layers)
      candidateFailure("PROJECT_LIMIT_EXCEEDED", "/project/layers");
    identifier(layer.id, `${path}/id`);
    name(layer.name, `${path}/name`);
    if (!["normal", "add", "multiply", "screen"].includes(String(layer.blendMode)))
      candidateFailure("PROJECT_PROFILE_UNSUPPORTED", `${path}/blendMode`);
    if (
      layer.drawOrder !== undefined &&
      (!Number.isInteger(layer.drawOrder) ||
        Number(layer.drawOrder) < -2147483648 ||
        Number(layer.drawOrder) > 2147483647)
    )
      candidateFailure("PROJECT_PROFILE_UNSUPPORTED", `${path}/drawOrder`);
    for (const key of ["multiplyColor", "screenColor"])
      if (layer[key] !== undefined)
        closed(object(layer[key]), ["r", "g", "b"], `${path}/${key}`);
    if (layer.clipMaskIds !== undefined)
      array(layer.clipMaskIds).forEach((id, index) => {
        identifier(id, `${path}/clipMaskIds/${index}`);
      });
    if (layer.clipMasks !== undefined)
      array(layer.clipMasks).forEach((value, index) => {
        const edge = object(value),
          edgePath = `${path}/clipMasks/${index}`;
        closed(edge, ["layerId", "invert"], edgePath);
        identifier(edge.layerId, `${edgePath}/layerId`);
        if (edge.invert !== false)
          candidateFailure("PROJECT_PROFILE_UNSUPPORTED", `${edgePath}/invert`);
      });
    if (kind === "viviMesh") {
      if (++meshes > LIMITS.meshes)
        candidateFailure("PROJECT_LIMIT_EXCEEDED", "/project/layers");
      const mesh = object(layer.mesh);
      closed(
        mesh,
        ["vertices", "uvs", "indices", "divisionsX", "divisionsY"],
        `${path}/mesh`,
      );
      count(array(mesh.vertices), LIMITS.vertices * 2, `${path}/mesh/vertices`);
      count(array(mesh.uvs), LIMITS.vertices * 2, `${path}/mesh/uvs`);
      count(array(mesh.indices), LIMITS.indices, `${path}/mesh/indices`);
      integer(mesh.divisionsX, `${path}/mesh/divisionsX`);
      integer(mesh.divisionsY, `${path}/mesh/divisionsY`);
    } else if (kind === "bone") {
      if (++bones > LIMITS.bones)
        candidateFailure("PROJECT_LIMIT_EXCEEDED", "/project/layers");
      closed(object(layer.bone), ["angle", "length", "scaleX", "scaleY"], `${path}/bone`);
      if (layer.parentBoneId !== undefined)
        identifier(layer.parentBoneId, `${path}/parentBoneId`);
    }
    array(layer.children).forEach((child, index) => {
      visitLayer(child, `${path}/children/${index}`);
    });
  }
  array(project.layers).forEach((layer, index) => {
    visitLayer(layer, `/project/layers/${index}`);
  });
  count(array(project.parameters), LIMITS.parameters, "/project/parameters");
  array(project.parameters).forEach((value, index) => {
    const parameter = object(value),
      path = `/project/parameters/${index}`;
    closed(
      parameter,
      [
        "id",
        "name",
        "minValue",
        "maxValue",
        "defaultValue",
        "pairedParameterId",
        "group",
      ],
      path,
    );
    identifier(parameter.id, `${path}/id`, PARAMETER_ID);
    name(parameter.name, `${path}/name`);
    if (parameter.pairedParameterId !== undefined)
      identifier(parameter.pairedParameterId, `${path}/pairedParameterId`, PARAMETER_ID);
    if (parameter.group !== undefined) name(parameter.group, `${path}/group`);
  });
  const skins = object(project.skins ?? {});
  count(Object.keys(skins), LIMITS.bones, "/project/skins");
  for (const key of Object.keys(skins).sort()) {
    identifier(key, "/project/skins");
    const skin = object(skins[key]);
    closed(skin, ["weights", "bindPoseInverse"], "/project/skins");
    for (const row of array(skin.weights)) {
      count(array(row), LIMITS.bones, "/project/skins");
      for (const value of array(row)) {
        const weight = object(value);
        closed(weight, ["boneId", "weight"], "/project/skins");
        identifier(weight.boneId, "/project/skins");
      }
    }
    const inverse = object(skin.bindPoseInverse);
    count(Object.keys(inverse), LIMITS.bones, "/project/skins");
    for (const boneId of Object.keys(inverse).sort())
      identifier(boneId, "/project/skins");
  }
  const bindings = array(project.parameterBindings ?? []);
  count(bindings, LIMITS.bindings, "/project/parameterBindings");
  let points = 0;
  bindings.forEach((value, index) => {
    const binding = object(value),
      path = `/project/parameterBindings/${index}`;
    closed(binding, ["id", "parameterId", "target", "bindingPoints"], path);
    identifier(binding.id, `${path}/id`);
    identifier(binding.parameterId, `${path}/parameterId`, PARAMETER_ID);
    const target = object(binding.target),
      owner = target.type === "bone" ? "boneId" : "controllerId";
    closed(target, ["type", owner, "property"], `${path}/target`);
    identifier(target[owner], `${path}/target/${owner}`);
    const values = array(binding.bindingPoints);
    if (values.length === 0)
      candidateFailure("PROJECT_PROFILE_UNSUPPORTED", `${path}/bindingPoints`);
    points += values.length;
    if (points > LIMITS.points)
      candidateFailure("PROJECT_LIMIT_EXCEEDED", "/project/parameterBindings");
    for (const point of values)
      closed(object(point), ["paramValue", "targetValue"], `${path}/bindingPoints`);
  });
  const controllers = array(project.ikControllers ?? []);
  count(controllers, LIMITS.controllers, "/project/ikControllers");
  controllers.forEach((value, index) => {
    const controller = object(value),
      path = `/project/ikControllers/${index}`;
    closed(
      controller,
      [
        "id",
        "name",
        "solverType",
        "boneChain",
        "targetX",
        "targetY",
        "influence",
        "parameterMappings",
        "poleTargetX",
        "poleTargetY",
        "maxIterations",
      ],
      path,
    );
    identifier(controller.id, `${path}/id`);
    name(controller.name, `${path}/name`);
    count(array(controller.boneChain), LIMITS.bones, `${path}/boneChain`);
    if (controller.maxIterations !== undefined)
      integer(controller.maxIterations, `${path}/maxIterations`, 1, 1024);
    array(controller.boneChain).forEach((value, child) => {
      const row = object(value);
      const at = `${path}/boneChain/${child}`;
      closed(row, ["boneId", "minAngle", "maxAngle"], at);
      identifier(row.boneId, `${at}/boneId`);
    });
    array(controller.parameterMappings).forEach((value, child) => {
      const row = object(value);
      const at = `${path}/parameterMappings/${child}`;
      closed(
        row,
        ["boneId", "parameterId", "angleMin", "angleMax", "paramMin", "paramMax"],
        at,
      );
      identifier(row.boneId, `${at}/boneId`);
      identifier(row.parameterId, `${at}/parameterId`, PARAMETER_ID);
    });
  });
  const atlases = array(wire.atlases);
  count(atlases, LIMITS.atlases, "/atlases");
  let compressed = 0,
    rgba = 0,
    entries = 0;
  atlases.forEach((value, index) => {
    const atlas = object(value),
      path = `/atlases/${index}`;
    closed(
      atlas,
      legacy
        ? ["image", "width", "height", "entries"]
        : ["id", "image", "width", "height", "entries"],
      path,
    );
    if (!legacy) identifier(atlas.id, `${path}/id`, ATLAS_ID);
    integer(atlas.width, `${path}/width`, 1, LIMITS.axis);
    integer(atlas.height, `${path}/height`, 1, LIMITS.axis);
    const pixels = Number(atlas.width) * Number(atlas.height);
    if (!Number.isSafeInteger(pixels) || pixels > LIMITS.pixels)
      candidateFailure("PROJECT_LIMIT_EXCEEDED", path);
    rgba += pixels * 4;
    if (!Number.isSafeInteger(rgba) || rgba > LIMITS.rgba)
      candidateFailure("PROJECT_LIMIT_EXCEEDED", "/atlases");
    const image = atlas.image as string;
    if (image.length > LIMITS.encoded)
      candidateFailure("PROJECT_LIMIT_EXCEEDED", `${path}/image`);
    const bytes =
      (image.length / 4) * 3 - (image.endsWith("==") ? 2 : image.endsWith("=") ? 1 : 0);
    compressed += bytes;
    if (bytes > LIMITS.png) candidateFailure("PROJECT_LIMIT_EXCEEDED", `${path}/image`);
    if (!Number.isSafeInteger(compressed) || compressed > LIMITS.totalPng)
      candidateFailure("PROJECT_LIMIT_EXCEEDED", "/atlases");
    entries += array(atlas.entries).length;
    if (entries > LIMITS.entries) candidateFailure("PROJECT_LIMIT_EXCEEDED", "/atlases");
    array(atlas.entries).forEach((value, child) => {
      const entry = object(value),
        at = `${path}/entries/${child}`;
      closed(entry, ["layerId", "x", "y", "width", "height"], at);
      identifier(entry.layerId, `${at}/layerId`);
      for (const key of ["x", "y", "width", "height"])
        integer(entry[key], `${at}/${key}`, key === "x" || key === "y" ? 0 : 1);
    });
  });
}

export function candidateCodecOptions(ports: EmbeddedRoundTripPorts) {
  if (typeof ports?.sha256 !== "function" || typeof ports?.verifyPng !== "function")
    candidateFailure("PROJECT_INTERNAL");
  return {
    registry: new Map(),
    supportedCapabilities: new Map(),
    sha256: async (bytes: Uint8Array) => {
      let digest: unknown;
      try {
        digest = await ports.sha256(new Uint8Array(bytes));
      } catch {
        candidateFailure("PROJECT_INTERNAL");
      }
      if (typeof digest !== "string" || !/^[0-9a-f]{64}$/i.test(digest))
        candidateFailure("PROJECT_INTERNAL");
      return digest;
    },
  };
}
export async function parseCandidateSemantics(
  canonical: string,
  ports: EmbeddedRoundTripPorts,
) {
  const options = candidateCodecOptions(ports);
  try {
    const parsed = await parseProjectFormatV11Json(canonical, options);
    if (
      parsed.compatibility !== "full" ||
      parsed.derivedRequirements.length ||
      parsed.opaqueExtensions.length
    )
      candidateFailure("PROJECT_SEMANTIC_INVALID");
    return parsed;
  } catch (error) {
    if (error instanceof CandidateFault) throw error;
    if (error instanceof ProjectFormatV11SemanticError)
      candidateFailure("PROJECT_SEMANTIC_INVALID");
    candidateFailure("PROJECT_INTERNAL");
  }
}

function canonicalBase64(value: string): boolean {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (value.length % 4 !== 0) return false;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  for (let index = 0; index < value.length - padding; index++)
    if (alphabet.indexOf(value.charAt(index)) < 0) return false;
  return value.endsWith("==")
    ? (alphabet.indexOf(value.charAt(value.length - 3)) & 15) === 0
    : value.endsWith("=")
      ? (alphabet.indexOf(value.charAt(value.length - 2)) & 3) === 0
      : true;
}
function pngPolicy(bytes: Uint8Array): "ok" | "malformed" | "unsupported" {
  if (
    bytes.length < 8 ||
    [137, 80, 78, 71, 13, 10, 26, 10].some((byte, index) => byte !== bytes[index])
  )
    return "malformed";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8,
    malformed = false,
    unsupported = false,
    paletteOrData = false,
    transparency = false;
  let srgb = false,
    gamma = false,
    chroma = false;
  const expectedChroma = [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000];
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) return "malformed";
    const length = view.getUint32(offset),
      end = offset + length + 12;
    if (end > bytes.length) return "malformed";
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)),
      start = offset + 8;
    if (kind === "PLTE") {
      if (transparency) malformed = true;
      paletteOrData = true;
    } else if (kind === "IDAT") paletteOrData = true;
    else if (kind === "tRNS") transparency = true;
    else if (kind === "sRGB") {
      if (srgb || paletteOrData || length !== 1 || (bytes[start] ?? 256) > 3)
        malformed = true;
      srgb = true;
    } else if (kind === "gAMA") {
      if (gamma || paletteOrData || length !== 4) malformed = true;
      else {
        const value = view.getUint32(start);
        if (value === 0) malformed = true;
        else if (value !== 45455) unsupported = true;
      }
      gamma = true;
    } else if (kind === "cHRM") {
      if (chroma || paletteOrData || length !== 32) malformed = true;
      else if (
        expectedChroma.some((value, index) => value !== view.getUint32(start + index * 4))
      )
        unsupported = true;
      chroma = true;
    } else if (kind !== "IHDR" && kind !== "IEND") unsupported = true;
    offset = end;
  }
  if ((gamma || chroma) && !srgb) unsupported = true;
  return malformed ? "malformed" : unsupported ? "unsupported" : "ok";
}
async function verifyImages(
  wire: ObjectValue,
  ports: EmbeddedRoundTripPorts,
): Promise<void> {
  const codes = {
    malformed: "PROJECT_PNG_MALFORMED",
    unsupported: "PROJECT_PNG_UNSUPPORTED",
    limit: "PROJECT_LIMIT_EXCEEDED",
    dimension: "PROJECT_PNG_DIMENSION",
  } as const;
  const atlases = array(wire.atlases);
  for (let index = 0; index < atlases.length; index++) {
    const atlas = object(atlases[index]),
      at = `/atlases/${index}/image`,
      image = atlas.image as string;
    if (!canonicalBase64(image)) candidateFailure("PROJECT_PNG_MALFORMED", at);
    const bytes = decodeRawBase64(image),
      supplied = new Uint8Array(bytes);
    let verdict: unknown;
    try {
      verdict = await ports.verifyPng(
        supplied,
        Number(atlas.width),
        Number(atlas.height),
      );
    } catch {
      candidateFailure("PROJECT_INTERNAL", at);
    }
    if (
      supplied.byteLength !== bytes.byteLength ||
      supplied.some((value, position) => value !== bytes[position])
    )
      candidateFailure("PROJECT_INTERNAL", at);
    if (verdict !== "ok") {
      if (typeof verdict !== "string" || !Object.hasOwn(codes, verdict))
        candidateFailure("PROJECT_INTERNAL", at);
      candidateFailure(codes[verdict as keyof typeof codes], at);
    }
    const policy = pngPolicy(bytes);
    if (policy !== "ok") candidateFailure(codes[policy], at);
  }
}
function expectedOrdinarySource(wire: ObjectValue): ObjectValue {
  const expected = cloneJsonDetached(wire),
    project = object(expected.project);
  for (const key of OPTIONAL_ARRAYS) project[key] ??= [];
  function masks(value: unknown): void {
    const layer = object(value);
    if (layer.clipMasks !== undefined) {
      layer.clipMaskIds = array(layer.clipMasks).map((edge) => object(edge).layerId);
      delete layer.clipMasks;
    }
    array(layer.children).forEach(masks);
  }
  array(project.layers).forEach(masks);
  return expected;
}

export async function validateEmbeddedRoundTripV11(
  input: Uint8Array,
  ports: EmbeddedRoundTripPorts,
): Promise<EmbeddedRoundTripResult> {
  return candidateBoundary(async () => {
    const { wire, canonical } = readCandidateSource(input);
    checkCandidateProfile(wire);
    const parsed = await parseCandidateSemantics(canonical, ports);
    await verifyImages(wire, ports);
    let serialized: string;
    try {
      serialized = await serializeProjectFormatV11Ordinary(parsed);
    } catch {
      candidateFailure("PROJECT_INTERNAL");
    }
    try {
      const emitted = readCandidateSource(encodeUtf8(serialized));
      checkCandidateProfile(emitted.wire);
      if (
        emitted.canonical !== serialized ||
        canonicalizeJsonV11(expectedOrdinarySource(wire)) !== serialized
      )
        candidateFailure("PROJECT_INTERNAL");
    } catch {
      candidateFailure("PROJECT_INTERNAL");
    }
    return {
      ok: true,
      profile: "vivi2d.projectFormat.v11.embeddedRoundTrip.draft1",
      documentId: wire.documentId as string,
      canonicalUtf8: encodeUtf8(serialized),
    };
  });
}
