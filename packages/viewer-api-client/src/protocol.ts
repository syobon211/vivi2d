export const VIVI_VIEWER_API_NAME = "ViviViewerApi";
export const VIVI_VIEWER_API_VERSION = "0.preview";
export const DEFAULT_VIEWER_API_TIMEOUT_MS = 10_000;
export const DEFAULT_VIEWER_API_PAIRING_APPROVAL_TIMEOUT_MS = 120_000;
export const DEFAULT_VIEWER_API_MAX_FRAME_BYTES = 64 * 1024;
export const DEFAULT_VIEWER_API_MAX_REQUEST_BYTES = 48 * 1024;
export const DEFAULT_VIEWER_API_MAX_REQUEST_ID_LENGTH = 128;

export type ViviViewerApiSurface = "core" | "extension";
export type ViviViewerApiScope = string;
export type ViviViewerApiRequestType = string;
export type ViviViewerApiEventType = string;

export interface ViviViewerApiErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface ViviViewerApiEnvelope<TData = Record<string, unknown>> {
  api: typeof VIVI_VIEWER_API_NAME;
  version: typeof VIVI_VIEWER_API_VERSION;
  id: string;
  type: ViviViewerApiRequestType;
  data: TData;
}

export interface ViviViewerApiResponse<TData = unknown> {
  api: typeof VIVI_VIEWER_API_NAME;
  version: string;
  id?: string;
  type: string;
  ok: boolean;
  data?: TData;
  error?: ViviViewerApiErrorPayload;
  eventId?: string;
  timestamp?: number;
}

export interface ViviViewerApiScopeMetadata {
  scope: ViviViewerApiScope;
  surface: ViviViewerApiSurface;
  risk?: "low" | "medium" | "high";
  category?: string;
  description?: string;
  requiresUserMediatedAssets?: boolean;
}

export interface ViviViewerApiRequestMetadata {
  name: ViviViewerApiRequestType;
  surface: ViviViewerApiSurface;
  scopeMode?: "static" | "event-derived" | "action-derived" | string;
  authRequired?: boolean;
  requiredScopes?: ViviViewerApiScope[][];
  scopeDerivation?: "requestedEvents" | "actionKind" | string;
}

export interface ViviViewerApiEventMetadata {
  name: ViviViewerApiEventType;
  scope?: ViviViewerApiScope | null;
  surface: ViviViewerApiSurface;
  category?: string;
  delivery?: "automatic" | "subscribed" | string;
}

export interface ViviViewerApiCapabilitiesSection {
  requestTypes?: ViviViewerApiRequestMetadata[];
  eventTypes?: ViviViewerApiEventMetadata[];
  scopes?: ViviViewerApiScopeMetadata[];
}

export interface ViviViewerApiCapabilities {
  api: typeof VIVI_VIEWER_API_NAME;
  version: string;
  stability?: "preview" | string;
  authMethods?: string[];
  pairingOpen?: boolean;
  scopeMetadata?: ViviViewerApiScopeMetadata[];
  propSourceKinds?: string[];
  limits?: {
    maxRequestIdLength?: number;
    maxRequestPayloadBytes?: number;
    maxWebSocketTextFrameBytes?: number;
    [key: string]: unknown;
  };
  closeCodes?: Record<string, number>;
  availability?: Record<string, unknown>;
  core?: ViviViewerApiCapabilitiesSection;
  extensions?: ViviViewerApiCapabilitiesSection;
  requestTypes?: Array<string | ViviViewerApiRequestMetadata>;
  eventTypes?: Array<string | ViviViewerApiEventMetadata>;
}

export interface ViviViewerGrant {
  token: string;
  scopes: ViviViewerApiScope[];
  grantId?: string;
  fingerprint?: string;
}

export interface ViviViewerPairingChallenge {
  challengeId?: string;
  code: string;
  expiresAt?: string;
}

export interface ViviViewerAuthenticatedGrant {
  grantId: string;
  fingerprint?: string;
  scopes: ViviViewerApiScope[];
  tokenPersistence?: "persistent" | "session";
}

export type ViviViewerApiEventListener = (event: ViviViewerApiResponse<unknown>) => void;
