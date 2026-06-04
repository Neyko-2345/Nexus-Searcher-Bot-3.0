// Cache en mémoire pour les résultats des tools externes (TTL 10 min par défaut)

const cache = new Map();
const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

function cacheKey(toolId, query) {
  return `${toolId}::${query.toLowerCase().trim()}`;
}

export function getCached(toolId, query) {
  const key = cacheKey(toolId, query);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached(toolId, query, data, ttlMs = DEFAULT_TTL) {
  const key = cacheKey(toolId, query);
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function clearCache(toolId) {
  if (toolId) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${toolId}::`)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}

export function getCacheStats() {
  let active = 0;
  let expired = 0;
  const now = Date.now();
  for (const entry of cache.values()) {
    if (now > entry.expiresAt) expired++;
    else active++;
  }
  return { active, expired, total: cache.size };
}
