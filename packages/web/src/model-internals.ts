import type { PublicViviModel } from "@vivi2d/core/public-model";
import type { ViviFileData } from "@vivi2d/core/types";
import { ViviWebError } from "./errors";

export interface ViviWebModelInternals {
  readonly fileData: ViviFileData;
  readonly runtimeModel: PublicViviModel;
}

const VIVI_WEB_MODEL_BRAND = new WeakSet<object>();
const VIVI_WEB_MODEL_INTERNALS = new WeakMap<object, ViviWebModelInternals>();

export function brandViviWebModel(model: object, internals: ViviWebModelInternals): void {
  VIVI_WEB_MODEL_BRAND.add(model);
  VIVI_WEB_MODEL_INTERNALS.set(model, internals);
}

export function hasViviWebModelBrand(value: object): boolean {
  return VIVI_WEB_MODEL_BRAND.has(value);
}

export function getViviWebModelInternals(model: unknown): ViviWebModelInternals {
  if (typeof model !== "object" || model === null || !VIVI_WEB_MODEL_BRAND.has(model)) {
    throw new ViviWebError(
      "VIVI_WEB_INVALID_SOURCE",
      "Model must be returned by loadViviWebModel().",
    );
  }
  return VIVI_WEB_MODEL_INTERNALS.get(model)!;
}
