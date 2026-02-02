// api.js - HN Firebase API client with sessionStorage cache

const API_BASE = 'https://hacker-news.firebaseio.com/v0';
const CACHE_TTL_LIST = 2 * 60 * 1000;  // 2 minutes
const CACHE_TTL_ITEM = 5 * 60 * 1000;  // 5 minutes
const BATCH_SIZE = 30;
const MAX_CONCURRENT = 15;

const HNApi = {
  _cache: {},

  _getCached(key, ttl) {
    try {
      const raw = sessionStorage.getItem(`hn_${key}`);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > ttl) {
        sessionStorage.removeItem(`hn_${key}`);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  _setCache(key, data) {
    try {
      sessionStorage.setItem(`hn_${key}`, JSON.stringify({ data, ts: Date.now() }));
    } catch {
      // storage full - clear and retry
      sessionStorage.clear();
    }
  },

  clearCache() {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k.startsWith('hn_')) keys.push(k);
    }
    keys.forEach(k => sessionStorage.removeItem(k));
  },

  async fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async getStoryIds(type = 'top') {
    const key = `${type}stories`;
    const cached = this._getCached(key, CACHE_TTL_LIST);
    if (cached) return cached;

    const ids = await this.fetchJSON(`${API_BASE}/${key}.json`);
    this._setCache(key, ids);
    return ids;
  },

  async getItem(id) {
    const key = `item_${id}`;
    const cached = this._getCached(key, CACHE_TTL_ITEM);
    if (cached) return cached;

    const item = await this.fetchJSON(`${API_BASE}/item/${id}.json`);
    if (item) this._setCache(key, item);
    return item;
  },

  async getItems(ids) {
    const results = [];
    for (let i = 0; i < ids.length; i += MAX_CONCURRENT) {
      const batch = ids.slice(i, i + MAX_CONCURRENT);
      const items = await Promise.all(batch.map(id => this.getItem(id).catch(() => null)));
      results.push(...items);
    }
    return results.filter(Boolean);
  },

  async getStories(type = 'top', page = 0) {
    const ids = await this.getStoryIds(type);
    const start = page * BATCH_SIZE;
    const end = start + BATCH_SIZE;
    const pageIds = ids.slice(start, end);
    const stories = await this.getItems(pageIds);
    return {
      stories,
      hasMore: end < ids.length,
      total: ids.length,
      page
    };
  },

  async getComments(parentId, depth = 0, maxAutoDepth = 3) {
    const item = await this.getItem(parentId);
    if (!item) return null;

    if (item.kids && item.kids.length > 0 && depth < maxAutoDepth) {
      const children = await this.getItems(item.kids);
      item._children = [];
      for (const child of children) {
        if (child && !child.dead && !child.deleted) {
          const withKids = await this.getComments(child.id, depth + 1, maxAutoDepth);
          item._children.push(withKids || child);
        }
      }
    }
    return item;
  }
};
