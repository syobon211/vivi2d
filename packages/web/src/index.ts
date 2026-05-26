// Browser global usage:
//   <script src="vivi2d.umd.js"></script>
//   <vivi-model src="character.vivi"></vivi-model>
//
// npm:
//   import { defineViviModelElement } from "@vivi2d/web";

import { ViviModelElement } from "./vivi-model-element";

export type { ViviWebErrorCode, ViviWebErrorDetails } from "./errors";
export { isViviWebError, ViviWebError } from "./errors";
export {
  isViviWebModel,
  loadViviWebModel,
  type ViviModelJSON,
  type ViviWebExpressionPreset,
  type ViviWebLoadOptions,
  type ViviWebLoadSource,
  type ViviWebModel,
  type ViviWebModelMetadata,
  type ViviWebParameter,
} from "./model-loader";
export {
  createViviWebPlayer,
  type ViviWebEvent,
  type ViviWebEventMap,
  type ViviWebFrameScheduler,
  type ViviWebHitTestResult,
  type ViviWebInputMap,
  type ViviWebPlayer,
  type ViviWebPlayerOptions,
  type ViviWebThumbnailOptions,
} from "./player";
export { ViviModelElement };

export function defineViviModelElement(tagName = "vivi-model"): typeof ViviModelElement {
  if (typeof customElements === "undefined") {
    return ViviModelElement;
  }
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ViviModelElement);
  }
  return ViviModelElement;
}
