const crypto = require("node:crypto");
const { VIEWER_API_SCOPE_METADATA } = require("./viewer-api-schema.cjs");

const PAIRING_WINDOW_MS = 120_000;
const MAX_PAIRING_CHALLENGES_PER_WINDOW = 12;
const MAX_GRANTS = 32;
const MAX_PENDING_CHALLENGES = 5;
const MAX_AUTH_ATTEMPTS_PER_MINUTE = 30;
const MAX_PAIRING_WINDOW_MS = 300_000;
const MAX_GLOBAL_PAIRING_CHALLENGES_PER_WINDOW = 60;
const MAX_GLOBAL_AUTH_ATTEMPTS_PER_MINUTE = 120;
const MAX_BAD_PAIRING_CODE_ATTEMPTS = 5;

function createPairingToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createPairingCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function isSafeTokenEqual(leftToken, rightToken) {
  if (typeof leftToken !== "string" || typeof rightToken !== "string") return false;
  const left = Buffer.from(leftToken);
  const right = Buffer.from(rightToken);
  if (left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function grantFingerprint(grant) {
  return crypto
    .createHash("sha256")
    .update(`${grant.id}:${grant.createdAt}:${grant.appName}`)
    .digest("hex")
    .slice(0, 12);
}

function publicGrant(grant) {
  const originBinding = grant.originBinding ?? (grant.origins?.[0] ?? "no-origin");
  const scopeSet = new Set(grant.scopes);
  return {
    id: grant.id,
    fingerprint: grantFingerprint(grant),
    appName: grant.appName,
    scopes: [...grant.scopes],
    scopeMetadata: VIEWER_API_SCOPE_METADATA
      .filter((metadata) => scopeSet.has(metadata.scope))
      .map((metadata) => ({ ...metadata })),
    originBinding,
    origins: originBinding === "no-origin" ? [] : [originBinding],
    createdAt: grant.createdAt,
    lastUsedAt: grant.lastUsedAt,
  };
}

module.exports = {
  MAX_AUTH_ATTEMPTS_PER_MINUTE,
  MAX_BAD_PAIRING_CODE_ATTEMPTS,
  MAX_GLOBAL_AUTH_ATTEMPTS_PER_MINUTE,
  MAX_GLOBAL_PAIRING_CHALLENGES_PER_WINDOW,
  MAX_GRANTS,
  MAX_PAIRING_CHALLENGES_PER_WINDOW,
  MAX_PAIRING_WINDOW_MS,
  MAX_PENDING_CHALLENGES,
  PAIRING_WINDOW_MS,
  createPairingCode,
  createPairingToken,
  grantFingerprint,
  isSafeTokenEqual,
  publicGrant,
};
