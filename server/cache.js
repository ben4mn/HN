// cache.js - tiny in-memory TTL cache with LRU eviction and in-flight dedupe

export class TTLCache {
  constructor({ max = 1000 } = {}) {
    this.max = max;
    this.map = new Map();
    this.inflight = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU position
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key, value, ttlMs) {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  }

  /** Resolve `fn` once per key while in flight; cache the result for ttlMs. */
  async wrap(key, ttlMs, fn) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => {
      try {
        const value = await fn();
        if (value !== undefined && value !== null) this.set(key, value, ttlMs);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }
}
