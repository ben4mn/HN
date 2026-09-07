// api.js - Data layer. Prefers the bundled backend (/api); falls back to talking to
// Firebase / Algolia / Jina directly when hosted as pure static files (e.g. GitHub Pages).

const API = {
  BASE: new URL('./', location.href).href,
  mode: 'server', // 'server' | 'direct'
  PAGE_SIZE: 30,
  FEEDS: ['top', 'new', 'best', 'ask', 'show', 'jobs'],

  _mem: new Map(),
  _memGet(key, ttl) {
    const hit = this._mem.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > ttl) {
      this._mem.delete(key);
      return null;
    }
    return hit.value;
  },
  _memSet(key, value, max = 300) {
    if (this._mem.size >= max) this._mem.delete(this._mem.keys().next().value);
    this._mem.set(key, { value, ts: Date.now() });
    return value;
  },
  clearCache() {
    this._mem.clear();
  },

  async _json(url, { timeout = 12000, signal } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  },

  /** Try the backend; on a hard failure (unreachable / 404 route) switch to direct mode. */
  async _viaServer(path, opts, directFn) {
    if (this.mode === 'server') {
      try {
        return await this._json(`${this.BASE}api/${path}`, opts);
      } catch (err) {
        // A 404 or a network failure on the API means there is no backend here.
        if (err.status === 404 || err.name === 'TypeError') {
          this.mode = 'direct';
        } else if (err.name === 'AbortError' && !navigator.onLine) {
          throw err;
        } else if (!directFn) {
          throw err;
        }
        if (!directFn) throw err;
      }
    }
    if (!directFn) throw new Error('unavailable');
    return directFn();
  },

  // ---------------- Feeds ----------------

  async feed(type, page = 0, { fresh = false } = {}) {
    const key = `feed:${type}:${page}`;
    if (!fresh) {
      const hit = this._memGet(key, 2 * 60 * 1000);
      if (hit) return hit;
    }
    const data = await this._viaServer(`feed/${type}?page=${page}${fresh ? `&t=${Date.now()}` : ''}`, {}, () => Direct.feed(type, page));
    return this._memSet(key, data);
  },

  async search(q, page = 0) {
    const key = `search:${q}:${page}`;
    const hit = this._memGet(key, 5 * 60 * 1000);
    if (hit) return hit;
    const data = await this._viaServer(`search?q=${encodeURIComponent(q)}&page=${page}`, {}, () => Direct.search(q, page));
    return this._memSet(key, data);
  },

  // ---------------- Items ----------------

  async item(id, { fresh = false } = {}) {
    const key = `item:${id}`;
    if (!fresh) {
      const hit = this._memGet(key, 2 * 60 * 1000);
      if (hit) return hit;
    }
    const data = await this._viaServer(`item/${id}${fresh ? `?t=${Date.now()}` : ''}`, { timeout: 20000 }, () => Direct.item(id));
    return this._memSet(key, data, 100);
  },

  // ---------------- Article extraction ----------------

  async extract(url) {
    const key = `article:${url}`;
    const hit = this._memGet(key, 30 * 60 * 1000);
    if (hit) return hit;
    const data = await this._viaServer(`extract?url=${encodeURIComponent(url)}`, { timeout: 30000 }, () => Direct.extract(url));
    return this._memSet(key, data, 40);
  },

  /** Page metadata for thumbnails/blurbs. Null in direct mode. */
  async meta(url) {
    if (this.mode !== 'server') return null;
    const key = `meta:${url}`;
    const hit = this._memGet(key, 60 * 60 * 1000);
    if (hit) return hit;
    try {
      const data = await this._json(`${this.BASE}api/meta?url=${encodeURIComponent(url)}`, { timeout: 12000 });
      return this._memSet(key, data, 600);
    } catch (err) {
      if (err.status === 404 || err.name === 'TypeError') this.mode = 'direct';
      return null;
    }
  }
};

// ---------------- Direct mode (no backend) ----------------

const Direct = {
  FIREBASE: 'https://hacker-news.firebaseio.com/v0',
  ALGOLIA: 'https://hn.algolia.com/api/v1',
  FEED_PATH: { top: 'topstories', new: 'newstories', best: 'beststories', ask: 'askstories', show: 'showstories', jobs: 'jobstories' },

  _ids: new Map(),

  async _ids_for(type) {
    const hit = this._ids.get(type);
    if (hit && Date.now() - hit.ts < 60 * 1000) return hit.ids;
    const ids = await API._json(`${this.FIREBASE}/${this.FEED_PATH[type]}.json`);
    this._ids.set(type, { ids, ts: Date.now() });
    return ids;
  },

  _slim(item, rank) {
    if (!item) return null;
    return {
      id: item.id, rank, title: item.title || '', url: item.url || null, by: item.by || '',
      time: item.time || 0, score: item.score || 0, descendants: item.descendants || 0,
      type: item.type || 'story', text: !!item.text
    };
  },

  async feed(type, page) {
    const ids = await this._ids_for(type);
    const start = page * API.PAGE_SIZE;
    const slice = ids.slice(start, start + API.PAGE_SIZE);
    const items = await Promise.all(slice.map((id) => API._json(`${this.FIREBASE}/item/${id}.json`).catch(() => null)));
    return {
      stories: items.map((it, i) => this._slim(it, start + i + 1)).filter(Boolean),
      page, hasMore: start + API.PAGE_SIZE < ids.length, total: ids.length
    };
  },

  async search(q, page) {
    const data = await API._json(`${this.ALGOLIA}/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${API.PAGE_SIZE}&page=${page}`);
    return {
      stories: (data.hits || []).map((h, i) => ({
        id: Number(h.objectID), rank: page * API.PAGE_SIZE + i + 1, title: h.title || '', url: h.url || null,
        by: h.author || '', time: h.created_at_i || 0, score: h.points || 0, descendants: h.num_comments || 0,
        type: 'story', text: !!h.story_text
      })),
      page, hasMore: page + 1 < (data.nbPages || 0), total: data.nbHits || 0
    };
  },

  _fromAlgolia(node, depth = 0) {
    if (!node) return null;
    const kids = (node.children || [])
      .filter((c) => c && (c.text || (c.children && c.children.length)))
      .map((c) => this._fromAlgolia(c, depth + 1)).filter(Boolean);
    return {
      id: node.id, by: node.author || '', time: node.created_at_i || 0, text: node.text || '',
      title: node.title || undefined, url: node.url || undefined, score: node.points ?? undefined,
      type: node.type || (depth === 0 ? 'story' : 'comment'), kids
    };
  },

  async item(id) {
    const [meta, raw] = await Promise.all([
      API._json(`${this.FIREBASE}/item/${id}.json`).catch(() => null),
      API._json(`${this.ALGOLIA}/items/${id}`, { timeout: 15000 }).catch(() => null)
    ]);
    let tree = raw ? this._fromAlgolia(raw) : null;
    if (!tree && meta) tree = { id: meta.id, by: meta.by, time: meta.time, text: meta.text || '', kids: [], type: meta.type };
    if (!tree) return null;
    if (meta) {
      Object.assign(tree, {
        title: meta.title ?? tree.title, url: meta.url ?? tree.url, score: meta.score ?? tree.score,
        by: meta.by ?? tree.by, time: meta.time ?? tree.time, descendants: meta.descendants ?? 0, type: meta.type ?? tree.type
      });
      if (meta.text) tree.text = meta.text;
    }
    return tree;
  },

  async extract(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/markdown' }, signal: ctrl.signal });
      if (!res.ok) return { url, error: `HTTP ${res.status}`, content: null };
      let md = await res.text();
      const i = md.indexOf('Markdown Content:');
      if (i !== -1) md = md.slice(i + 'Markdown Content:'.length).trim();
      if (md.length < 100) return { url, error: 'no readable content', content: null };
      const html = typeof marked !== 'undefined' ? marked.parse(md) : `<pre>${escapeHtml(md)}</pre>`;
      const text = md.replace(/[#*_>`\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
      return { url, via: 'jina', error: null, title: null, byline: null, siteName: null, excerpt: null, content: html, textContent: text, length: text.length };
    } catch (err) {
      return { url, error: err.name === 'AbortError' ? 'timeout' : err.message, content: null };
    } finally {
      clearTimeout(t);
    }
  }
};
