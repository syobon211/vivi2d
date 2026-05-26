const VIEWER_API_CLOSE_CODES = Object.freeze({
  invalidRequest: { code: 4400, reason: "invalid_request" },
  grantRevoked: { code: 4403, reason: "grant_revoked" },
  rateLimited: { code: 4408, reason: "rate_limited" },
  originMismatch: { code: 4409, reason: "origin_mismatch" },
  frameTooLarge: { code: 4411, reason: "frame_too_large" },
  binaryRejected: { code: 4412, reason: "binary_rejected" },
  compressionRejected: { code: 4413, reason: "compression_rejected" },
});

module.exports = {
  VIEWER_API_CLOSE_CODES,
};
