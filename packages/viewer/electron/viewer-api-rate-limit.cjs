function pruneTimestamps(timestamps, now, windowMs) {
  return timestamps.filter((timestamp) => now - timestamp < windowMs);
}

function hasRateLimitBudget(timestamps, now, windowMs, maxCount) {
  return pruneTimestamps(timestamps, now, windowMs).length < maxCount;
}

function consumeRateLimitBudget(timestamps, now, windowMs) {
  const pruned = pruneTimestamps(timestamps, now, windowMs);
  pruned.push(now);
  return pruned;
}

module.exports = {
  consumeRateLimitBudget,
  hasRateLimitBudget,
  pruneTimestamps,
};
