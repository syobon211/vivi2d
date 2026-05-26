export const VIVI_VIEWER_API_VERSION = "0.preview" as const;

export type ViewerApiScope =
  | "read:state"
  | "read:signals"
  | "read:props"
  | "read:actions"
  | "read:calibration"
  | "run:actions:safe"
  | "write:signals"
  | "write:props"
  | "write:calibration";

export interface ViewerApiScopeMetadata {
  scope: ViewerApiScope;
  surface: "core" | "extension";
  risk: "low" | "medium" | "high";
  category: string;
  description: string;
  requiresUserMediatedAssets?: boolean;
}

export interface ViewerApiGrantSummary {
  id: string;
  fingerprint?: string;
  appName: string;
  scopes: ViewerApiScope[];
  scopeMetadata?: ViewerApiScopeMetadata[];
  originBinding: string;
  origins?: string[];
  createdAt: number;
  lastUsedAt: number | null;
}

export interface ViewerApiPendingChallenge {
  id: string;
  appName: string;
  scopes: ViewerApiScope[];
  originBinding: string;
  createdAt: number;
  expiresAt: number;
  badCodeAttempts: number;
}

export interface ViewerApiStatus {
  enabled: boolean;
  port?: number;
  endpoint?: string | null;
  version?: string;
  persistentGrantsAvailable?: boolean;
  tokenPersistence?: "persistent" | "session" | "unavailable";
  pairingWindowOpen?: boolean;
  pairingWindowExpiresAt?: number | null;
  pairingAllowedOrigins?: string[];
  pendingChallenges?: ViewerApiPendingChallenge[];
  grants?: ViewerApiGrantSummary[];
}
