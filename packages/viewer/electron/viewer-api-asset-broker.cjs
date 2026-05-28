const crypto = require("node:crypto");
const {
  MAX_FILE_PICKER_PROP_BYTES,
  validateInlinePropImage,
} = require("./viewer-api-schema.cjs");

const ASSET_ID_PREFIX = "vpa_";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MIN_TTL_MS = 60 * 1000;
const MAX_TTL_MS = 30 * 60 * 1000;
const EXTENSION_MS = 15 * 60 * 1000;
const MAX_PENDING_ASSETS_PER_GRANT = 32;
const MAX_PENDING_BYTES_PER_GRANT = 16 * 1024 * 1024;
const MAX_GLOBAL_PENDING_BYTES = 64 * 1024 * 1024;
const MAX_FILE_PICKER_PROP_BASE64_LENGTH =
  Math.ceil(MAX_FILE_PICKER_PROP_BYTES / 3) * 4 + 4;
const CLEANUP_LIMIT = 256;
const PUBLIC_API_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function createViewerApiAssetBroker({
  now = () => Date.now(),
  randomBytes = (size) => crypto.randomBytes(size),
  logger = console,
} = {}) {
  return new ViewerApiAssetBroker({ now, randomBytes, logger });
}

class ViewerApiAssetBroker {
  constructor({ now, randomBytes, logger }) {
    this.now = now;
    this.randomBytes = randomBytes;
    this.logger = logger;
    this.assets = new Map();
  }

  issue(payload, grant) {
    const safeGrant = normalizeGrant(grant);
    if (!safeGrant || !safeGrant.scopes.includes("write:props")) {
      return brokerError("scope_denied");
    }
    const mimeType =
      typeof payload?.mimeType === "string" ? payload.mimeType : "";
    if (!PUBLIC_API_MIME_TYPES.has(mimeType)) {
      return brokerError("unsupported", { feature: "prop.asset.mimeType" });
    }
    const decoded = decodeBase64Payload(payload?.bytesBase64);
    if (!decoded.ok) {
      return brokerError(decoded.code, decoded.details);
    }
    const bytes = decoded.bytes;
    if (bytes.length <= 0 || bytes.length > MAX_FILE_PICKER_PROP_BYTES) {
      return brokerError("payload_too_large", {
        limitBytes: MAX_FILE_PICKER_PROP_BYTES,
      });
    }
    try {
      validateInlinePropImage(bytes, mimeType);
    } catch (error) {
      this.logger.warn?.("[viewer-api-assets] rejected file-picker asset", error);
      return brokerError("invalid_request", {
        field: "source",
        reason: "format",
      });
    }
    this.cleanupExpired(this.now());
    if (this.assetsForGrant(safeGrant.id).length >= MAX_PENDING_ASSETS_PER_GRANT) {
      return brokerError("asset_unavailable", { reason: "limit_exceeded" });
    }
    const pendingGrantBytes = this.assetsForGrant(safeGrant.id).reduce(
      (sum, asset) => sum + asset.bytes.length,
      0,
    );
    if (pendingGrantBytes + bytes.length > MAX_PENDING_BYTES_PER_GRANT) {
      return brokerError("asset_unavailable", { reason: "limit_exceeded" });
    }
    if (this.pendingBytes() + bytes.length > MAX_GLOBAL_PENDING_BYTES) {
      this.cleanupExpired(this.now(), Number.POSITIVE_INFINITY);
      if (this.pendingBytes() + bytes.length > MAX_GLOBAL_PENDING_BYTES) {
        return brokerError("asset_unavailable", { reason: "limit_exceeded" });
      }
    }
    const createdAt = this.now();
    const ttlMs = clampTtl(payload?.ttlMs);
    const asset = {
      id: this.newAssetId(),
      grantId: safeGrant.id,
      appName: safeGrant.appName,
      originBinding: safeGrant.originBinding,
      label: sanitizeLabel(payload?.displayName),
      mimeType,
      bytes,
      createdAt,
      expiresAt: createdAt + ttlMs,
      extended: false,
      reserved: false,
    };
    this.assets.set(asset.id, asset);
    return { ok: true, asset: summarizeAsset(asset, this.now()) };
  }

  checkout(source, grant, origin) {
    const safeGrant = normalizeGrant(grant);
    if (!safeGrant) return brokerError("asset_unavailable", { reason: "wrong_grant" });
    const asset = this.lookup(source?.assetId);
    if (!asset) return brokerError("asset_unavailable", { reason: "not_found" });
    if (asset.grantId !== safeGrant.id) {
      return brokerError("asset_unavailable", { reason: "wrong_grant" });
    }
    if (!originMatches(asset.originBinding, origin)) {
      return brokerError("asset_unavailable", { reason: "wrong_origin" });
    }
    if (asset.reserved) {
      return brokerError("asset_unavailable", { reason: "consumed" });
    }
    if (source?.mimeType !== asset.mimeType || source?.bytes !== asset.bytes.length) {
      return brokerError("asset_unavailable", { reason: "not_found" });
    }
    asset.reserved = true;
    const reservation = { assetId: asset.id, token: this.newReservationToken() };
    asset.reservationToken = reservation.token;
    return {
      ok: true,
      reservation,
      source: {
        kind: "inlineBase64",
        mimeType: asset.mimeType,
        bytes: asset.bytes.toString("base64"),
      },
    };
  }

  consume(reservation) {
    const asset = this.assets.get(reservation?.assetId);
    if (!asset || asset.reservationToken !== reservation?.token) return false;
    this.assets.delete(asset.id);
    return true;
  }

  release(reservation) {
    const asset = this.assets.get(reservation?.assetId);
    if (!asset || asset.reservationToken !== reservation?.token) return false;
    asset.reserved = false;
    delete asset.reservationToken;
    return true;
  }

  extend(assetId, grant) {
    const safeGrant = normalizeGrant(grant);
    const asset = this.lookup(assetId);
    if (!asset) return brokerError("asset_unavailable", { reason: "not_found" });
    if (!safeGrant || asset.grantId !== safeGrant.id) {
      return brokerError("asset_unavailable", { reason: "wrong_grant" });
    }
    if (asset.extended || asset.reserved) {
      return brokerError("asset_unavailable", { reason: "consumed" });
    }
    asset.extended = true;
    asset.expiresAt = Math.min(
      asset.createdAt + MAX_TTL_MS,
      Math.max(asset.expiresAt, this.now()) + EXTENSION_MS,
    );
    return { ok: true, asset: summarizeAsset(asset, this.now()) };
  }

  revoke(assetId, grant) {
    const safeGrant = normalizeGrant(grant);
    const asset = this.lookup(assetId);
    if (!asset) return false;
    if (!safeGrant || asset.grantId !== safeGrant.id) return false;
    this.assets.delete(asset.id);
    return true;
  }

  revokeGrant(grantId) {
    let count = 0;
    for (const [assetId, asset] of this.assets) {
      if (asset.grantId === grantId) {
        this.assets.delete(assetId);
        count += 1;
      }
    }
    return count;
  }

  listForGrant(grantId) {
    this.cleanupExpired(this.now());
    return [...this.assets.values()]
      .filter((asset) => asset.grantId === grantId)
      .map((asset) => summarizeAsset(asset, this.now()));
  }

  clear() {
    const count = this.assets.size;
    this.assets.clear();
    return count;
  }

  cleanupExpired(now = this.now(), limit = CLEANUP_LIMIT) {
    let removed = 0;
    for (const [assetId, asset] of this.assets) {
      if (asset.expiresAt <= now) {
        this.assets.delete(assetId);
        removed += 1;
        if (removed >= limit) break;
      }
    }
    return removed;
  }

  lookup(assetId) {
    if (typeof assetId !== "string" || !assetId.startsWith(ASSET_ID_PREFIX)) {
      return null;
    }
    const asset = this.assets.get(assetId);
    if (!asset) return null;
    if (asset.expiresAt <= this.now()) {
      this.assets.delete(assetId);
      return null;
    }
    return asset;
  }

  assetsForGrant(grantId) {
    return [...this.assets.values()].filter((asset) => asset.grantId === grantId);
  }

  pendingBytes() {
    return [...this.assets.values()].reduce((sum, asset) => sum + asset.bytes.length, 0);
  }

  newAssetId() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const id = `${ASSET_ID_PREFIX}${this.randomBytes(18).toString("base64url")}`;
      if (!this.assets.has(id)) return id;
    }
    return `${ASSET_ID_PREFIX}${crypto.randomUUID()}`;
  }

  newReservationToken() {
    return this.randomBytes(16).toString("base64url");
  }
}

function normalizeGrant(grant) {
  if (!grant || typeof grant.id !== "string" || !Array.isArray(grant.scopes)) {
    return null;
  }
  return {
    id: grant.id,
    appName: typeof grant.appName === "string" ? grant.appName : "Unknown client",
    scopes: grant.scopes.filter((scope) => typeof scope === "string"),
    originBinding: grant.originBinding ?? grant.origins?.[0] ?? "no-origin",
  };
}

function decodeBase64Payload(value) {
  if (typeof value !== "string" || value.length === 0) {
    return invalidBase64Payload();
  }
  if (value.length > MAX_FILE_PICKER_PROP_BASE64_LENGTH) {
    return {
      ok: false,
      code: "payload_too_large",
      details: { limitBytes: MAX_FILE_PICKER_PROP_BYTES },
    };
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return invalidBase64Payload();
  }
  const bytes = Buffer.from(value, "base64");
  return bytes.toString("base64") === value
    ? { ok: true, bytes }
    : invalidBase64Payload();
}

function invalidBase64Payload() {
  return {
    ok: false,
    code: "invalid_request",
    details: { field: "source", reason: "format" },
  };
}

function clampTtl(value) {
  if (!Number.isFinite(value)) return DEFAULT_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Math.floor(value)));
}

function sanitizeLabel(value) {
  if (typeof value !== "string") return null;
  const label = value.replace(/[\\/]/g, " ").replace(/\s+/g, " ").trim();
  return label.length > 0 ? label.slice(0, 80) : null;
}

function originMatches(binding, origin) {
  if (binding === "no-origin") return origin == null;
  return origin === binding;
}

function summarizeAsset(asset, now) {
  return {
    assetId: asset.id,
    grantId: asset.grantId,
    appName: asset.appName,
    originBinding: asset.originBinding,
    label: asset.label,
    mimeType: asset.mimeType,
    bytes: asset.bytes.length,
    createdAt: asset.createdAt,
    expiresAt: asset.expiresAt,
    secondsRemaining: Math.max(0, Math.ceil((asset.expiresAt - now) / 1000)),
    extended: asset.extended,
    reserved: asset.reserved,
  };
}

function brokerError(code, details) {
  return { ok: false, error: { code, details } };
}

module.exports = {
  ASSET_ID_PREFIX,
  DEFAULT_TTL_MS,
  MAX_FILE_PICKER_PROP_BYTES,
  MAX_GLOBAL_PENDING_BYTES,
  MAX_PENDING_ASSETS_PER_GRANT,
  MAX_PENDING_BYTES_PER_GRANT,
  createViewerApiAssetBroker,
};
