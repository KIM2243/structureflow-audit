// Coalesce simultaneous callers; retain successful responses only briefly.
// Return the original object/timestamp so cache hits never become fresh quotes.
export function createRequestCache(ttlMs, now = Date.now) {
  const entries = new Map();
  return (key, load) => {
    const found = entries.get(key);
    if (found && (found.pending || found.expiresAt > now())) return found.promise;
    if (entries.size >= 256) entries.delete(entries.keys().next().value);
    const entry = { pending: true, expiresAt: 0, promise: undefined };
    entry.promise = Promise.resolve().then(load).then(value => {
      entry.pending = false;
      entry.expiresAt = now() + ttlMs;
      return value;
    }, error => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    });
    entries.set(key, entry);
    return entry.promise;
  };
}
