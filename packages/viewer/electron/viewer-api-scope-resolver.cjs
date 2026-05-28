const {
  VIEWER_API_EVENT_DEFS,
  WRITE_TYPES,
} = require("./viewer-api-schema.cjs");

function hasScopeAlternatives(grant, requiredScopeAlternatives) {
  if (!grant || !Array.isArray(grant.scopes)) return false;
  if (!Array.isArray(requiredScopeAlternatives) || requiredScopeAlternatives.length === 0) {
    return true;
  }
  return requiredScopeAlternatives.some((requiredScopes) =>
    Array.isArray(requiredScopes) &&
    requiredScopes.every((scope) => grant.scopes.includes(scope)),
  );
}

function hasWriteType(type) {
  return WRITE_TYPES.has(type);
}

function hasEventScope(grant, eventName) {
  const required = VIEWER_API_EVENT_DEFS[eventName]?.scope;
  return !required || grant.scopes.includes(required);
}

function publicScopeDeniedDetails(requiredScopeAlternatives) {
  const requiredScopes = [
    ...new Set(requiredScopeAlternatives.flat().filter((scope) => typeof scope === "string")),
  ].sort();
  return requiredScopes.length > 0 ? { requiredScopes } : undefined;
}

module.exports = {
  hasEventScope,
  hasScopeAlternatives,
  hasWriteType,
  publicScopeDeniedDetails,
};
