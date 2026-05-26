// The Web SDK loader is a public-package boundary. It snapshots caller-owned
// sources, enforces byte/depth limits, and accepts only public-profile Vivi2D
// models before creating runtime state.
import {
  assertByteLengthWithinLimit,
  assertTextLengthWithinLimit,
  MAX_VIVI_TEXT_FILE_BYTES,
} from "@vivi2d/core/load-limits";
import { parseViviFile } from "@vivi2d/core/project-parser";
import { PublicViviModel } from "@vivi2d/core/public-model";
import type { ViviFileData } from "@vivi2d/core/types";
import { toViviWebError, ViviWebError } from "./errors";
import { brandViviWebModel, hasViviWebModelBrand } from "./model-internals";

const MAX_JSON_CLONE_DEPTH = 256;

export interface ViviModelJSON {
  profile: "publicProfileV1";
  version: number;
  project: Record<string, unknown>;
  atlases: unknown[];
  [key: string]: unknown;
}

export type ViviWebLoadSource =
  | string
  | URL
  | Request
  | Response
  | Blob
  | ArrayBuffer
  | Uint8Array
  | ViviModelJSON;

export interface ViviWebLoadOptions {
  fetchOptions?: Omit<RequestInit, "body" | "credentials" | "mode" | "signal">;
  initialParameters?: Readonly<Record<string, number>>;
  signal?: AbortSignal;
}

export interface ViviWebModelMetadata {
  name?: string;
  width: number;
  height: number;
  parameterCount: number;
  expressionPresetCount: number;
}

export interface ViviWebParameter {
  id: string;
  name: string;
  min: number;
  max: number;
  default: number;
}

export interface ViviWebExpressionPreset {
  id: string;
  name: string;
  hotkey?: number;
}

declare const VIVI_WEB_MODEL_BRAND_TYPE: unique symbol;

export interface ViviWebModel {
  readonly [VIVI_WEB_MODEL_BRAND_TYPE]: never;
  readonly expressionPresets: readonly ViviWebExpressionPreset[];
  readonly metadata: ViviWebModelMetadata;
  readonly parameters: readonly ViviWebParameter[];
}

class ViviWebModelImpl {
  constructor(
    private readonly fileData: ViviFileData,
    runtimeModel: PublicViviModel,
    readonly metadata: ViviWebModelMetadata,
  ) {
    brandViviWebModel(this, {
      fileData,
      runtimeModel,
    });
  }

  get parameters(): ViviWebParameter[] {
    return this.fileData.project.parameters.map((parameter) => ({
      id: parameter.id,
      name: parameter.name,
      min: parameter.minValue,
      max: parameter.maxValue,
      default: parameter.defaultValue,
    }));
  }

  get expressionPresets(): ViviWebExpressionPreset[] {
    return (
      this.fileData.project.expressionPresets?.map((preset) => ({
        id: preset.id,
        name: preset.name,
        hotkey: preset.hotkey,
      })) ?? []
    );
  }
}

export function isViviWebModel(value: unknown): value is ViviWebModel {
  return typeof value === "object" && value !== null && hasViviWebModelBrand(value);
}

export async function loadViviWebModel(
  source: ViviWebLoadSource,
  options: ViviWebLoadOptions = {},
): Promise<ViviWebModel> {
  try {
    throwIfAborted(options.signal);
    const jsonText =
      typeof source === "object" && isPlainJsonSource(source)
        ? JSON.stringify(safeCloneJsonValue(source, "<root>"))
        : await loadSourceText(source, options);
    throwIfAborted(options.signal);
    const fileData = parseViviFile(jsonText, { profile: "publicProfileV1" });
    return createViviWebModel(fileData, options);
  } catch (error) {
    throw toViviWebError(
      error,
      "VIVI_WEB_INVALID_SOURCE",
      "Could not load a Vivi2D web model.",
    );
  }
}

function cloneViviFileData(fileData: ViviFileData): ViviFileData {
  return JSON.parse(JSON.stringify(fileData)) as ViviFileData;
}

function createViviWebModel(
  fileData: ViviFileData,
  options?: ViviWebLoadOptions,
): ViviWebModel {
  assertPublicSdkProfile(fileData);
  const clonedFileData = cloneViviFileData(fileData);
  const initialParameters = sanitizeInitialParameters(
    clonedFileData,
    options?.initialParameters ?? {},
  );
  const runtimeModel = PublicViviModel.fromFileData(clonedFileData, {
    initialParameters,
  });
  return new ViviWebModelImpl(clonedFileData, runtimeModel, {
    name: clonedFileData.project.name,
    width: runtimeModel.width,
    height: runtimeModel.height,
    parameterCount: clonedFileData.project.parameters.length,
    expressionPresetCount: clonedFileData.project.expressionPresets?.length ?? 0,
  }) as unknown as ViviWebModel;
}

async function loadSourceText(
  source: Exclude<ViviWebLoadSource, ViviModelJSON>,
  options: ViviWebLoadOptions,
): Promise<string> {
  if (typeof source === "string" || source instanceof URL || isRequest(source)) {
    if (typeof source === "string" && source.trim() === "") {
      throw new ViviWebError(
        "VIVI_WEB_INVALID_SOURCE",
        "Model source must not be empty.",
      );
    }
    let response: Response;
    try {
      response = await fetch(source, {
        ...options.fetchOptions,
        credentials: "omit",
        mode: "cors",
        signal: options.signal,
      });
    } catch (error) {
      throwIfAborted(options.signal);
      throw new ViviWebError("VIVI_WEB_FETCH_FAILED", "Failed to fetch model.", {
        cause: error,
      });
    }
    if (!response.ok) {
      throw new ViviWebError("VIVI_WEB_FETCH_FAILED", "Failed to fetch model.", {
        details: { status: response.status },
      });
    }
    return readResponseTextWithLimit(response, "Remote .vivi model", options.signal);
  }
  if (isResponse(source)) {
    throwIfAborted(options.signal);
    const response = source.clone();
    if (!response.ok) {
      throw new ViviWebError("VIVI_WEB_FETCH_FAILED", "Failed to read model response.", {
        details: { status: response.status },
      });
    }
    return readResponseTextWithLimit(response, "Response .vivi model", options.signal);
  }
  if (isBlob(source)) {
    throwIfAborted(options.signal);
    assertByteLengthWithinLimit(
      source.size,
      MAX_VIVI_TEXT_FILE_BYTES,
      "Blob .vivi model",
    );
    const text = await source.text();
    throwIfAborted(options.signal);
    return text;
  }
  if (source instanceof ArrayBuffer) {
    throwIfAborted(options.signal);
    assertByteLengthWithinLimit(
      source.byteLength,
      MAX_VIVI_TEXT_FILE_BYTES,
      "ArrayBuffer .vivi model",
    );
    return new TextDecoder().decode(source);
  }
  if (source instanceof Uint8Array) {
    throwIfAborted(options.signal);
    assertByteLengthWithinLimit(
      source.byteLength,
      MAX_VIVI_TEXT_FILE_BYTES,
      "Uint8Array .vivi model",
    );
    return new TextDecoder().decode(source);
  }
  throw new ViviWebError("VIVI_WEB_INVALID_SOURCE", "Unsupported model source.");
}

async function readResponseTextWithLimit(
  response: Response,
  label: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  throwIfAborted(signal);
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > 0) {
      assertByteLengthWithinLimit(contentLength, MAX_VIVI_TEXT_FILE_BYTES, label);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    throwIfAborted(signal);
    assertTextLengthWithinLimit(text, MAX_VIVI_TEXT_FILE_BYTES, label);
    return text;
  }

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    throwIfAborted(signal);
    if (done) break;
    totalBytes += value.byteLength;
    assertByteLengthWithinLimit(totalBytes, MAX_VIVI_TEXT_FILE_BYTES, label);
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  throwIfAborted(signal);
  assertTextLengthWithinLimit(text, MAX_VIVI_TEXT_FILE_BYTES, label);
  return text;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (typeof DOMException !== "undefined") {
    throw new DOMException("Model loading was aborted.", "AbortError");
  }
  const error = new Error("Model loading was aborted.");
  error.name = "AbortError";
  throw error;
}

function assertPublicSdkProfile(fileData: ViviFileData): void {
  if (fileData.profile !== "publicProfileV1") {
    throw new ViviWebError(
      "VIVI_WEB_VALIDATION_FAILED",
      "Web SDK models must use the publicProfileV1 profile.",
    );
  }
}

function sanitizeInitialParameters(
  fileData: ViviFileData,
  initialParameters: Readonly<Record<string, number>>,
): Record<string, number> {
  const definitions = new Map(
    fileData.project.parameters.map((definition) => [definition.id, definition]),
  );
  const result: Record<string, number> = {};
  for (const [id, value] of Object.entries(initialParameters)) {
    const definition = definitions.get(id);
    if (!definition) continue;
    if (!Number.isFinite(value)) {
      throw new ViviWebError(
        "VIVI_WEB_INVALID_INPUT",
        "Initial parameter values must be finite.",
        { details: { id } },
      );
    }
    result[id] = Math.max(definition.minValue, Math.min(definition.maxValue, value));
  }
  return result;
}

function isPlainJsonSource(source: object): source is ViviModelJSON {
  return !(
    source instanceof URL ||
    isRequest(source) ||
    isResponse(source) ||
    isBlob(source) ||
    source instanceof ArrayBuffer ||
    source instanceof Uint8Array
  );
}

function isRequest(value: unknown): value is Request {
  return typeof Request !== "undefined" && value instanceof Request;
}

function isResponse(value: unknown): value is Response {
  return typeof Response !== "undefined" && value instanceof Response;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function safeCloneJsonValue(
  value: unknown,
  path: string,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (depth > MAX_JSON_CLONE_DEPTH) {
    throw new ViviWebError(
      "VIVI_WEB_VALIDATION_FAILED",
      "Model JSON nesting is too deep.",
      { details: { maxDepth: MAX_JSON_CLONE_DEPTH, path } },
    );
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ViviWebError(
        "VIVI_WEB_VALIDATION_FAILED",
        "JSON numbers must be finite.",
        {
          details: { path },
        },
      );
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new ViviWebError(
      "VIVI_WEB_VALIDATION_FAILED",
      "Model JSON is not serializable.",
      {
        details: { path },
      },
    );
  }
  if (seen.has(value)) {
    throw new ViviWebError("VIVI_WEB_VALIDATION_FAILED", "Model JSON is cyclic.", {
      details: { path },
    });
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return cloneArray(value, path, seen, depth);
    }
    return cloneRecord(value, path, seen, depth);
  } finally {
    seen.delete(value);
  }
}

function cloneArray(
  value: readonly unknown[],
  path: string,
  seen: WeakSet<object>,
  depth: number,
): unknown[] {
  const clone: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new ViviWebError(
        "VIVI_WEB_VALIDATION_FAILED",
        "Model JSON arrays must not contain holes.",
        { details: { path: `${path}[${index}]` } },
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor || !("value" in descriptor)) {
      throw new ViviWebError(
        "VIVI_WEB_VALIDATION_FAILED",
        "Model JSON accessors are not allowed.",
        { details: { path: `${path}[${index}]` } },
      );
    }
    clone[index] = safeCloneJsonValue(
      descriptor.value,
      `${path}[${index}]`,
      seen,
      depth + 1,
    );
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new ViviWebError(
        "VIVI_WEB_VALIDATION_FAILED",
        "Model JSON symbol keys are not allowed.",
        { details: { path } },
      );
    }
    if (key === "length" || isArrayIndexKey(key, value.length)) {
      continue;
    }
    throw new ViviWebError(
      "VIVI_WEB_VALIDATION_FAILED",
      "Model JSON arrays must not contain custom properties.",
      { details: { path: `${path}.${String(key)}` } },
    );
  }
  return clone;
}

function cloneRecord(
  value: object,
  path: string,
  seen: WeakSet<object>,
  depth: number,
): Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ViviWebError(
      "VIVI_WEB_VALIDATION_FAILED",
      "Model JSON objects must be plain objects.",
      { details: { path } },
    );
  }
  const clone: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new ViviWebError(
        "VIVI_WEB_VALIDATION_FAILED",
        "Model JSON symbol keys are not allowed.",
        { details: { path } },
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) continue;
    if (!("value" in descriptor)) {
      throw new ViviWebError(
        "VIVI_WEB_VALIDATION_FAILED",
        "Model JSON accessors are not allowed.",
        { details: { path: `${path}.${key}` } },
      );
    }
    clone[key] = safeCloneJsonValue(descriptor.value, `${path}.${key}`, seen, depth + 1);
  }
  return clone;
}

function isArrayIndexKey(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
