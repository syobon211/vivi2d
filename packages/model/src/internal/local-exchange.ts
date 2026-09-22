/** Internal local-host friend; no root SDK or persisted preparation proofs. */
export * from "./local-exchange-state";
export {
  canonicalizeJsonV11,
  parseJsonV11,
  PROJECT_FORMAT_V11_JSON_LIMITS,
} from "../project-format-v11/json-contract";
export {
  decodeRawBase64,
  decodeUtf8Fatal,
  encodeUtf8,
} from "../project-format-v11/portable-primitives";
export type { EmbeddedRoundTripPorts } from "./project-format-v11";
