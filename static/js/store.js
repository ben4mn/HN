// store.js - Persistent preferences and per-user state (localStorage), with safe fallbacks

const Store = {
  _get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* quota or private mode */ }
  },

  // ---- theme: 'auto' | 'light' | 'dark'
  get theme() {
    const t = this._get('hn_theme', 'auto');
    return t === 'light' || t === 'dark' ? t : 'auto';
  },
  set theme(v) {
    this._set('hn_theme', v);
  },

  // ---- reader font scale
  get fontScale() {
    return clamp(Number(this._get('hn_font', 1)) || 1, 0.85, 1.35);
  },
  set fontScale(v) {
    this._set('hn_font', clamp(v, 0.85, 1.35));
  },

  // ---- blurbs + thumbnails in feed
  get blurbs() {
    return this._get('hn_blurbs', true) !== false;
  },
  set blurbs(v) {
    this._set('hn_blurbs', !!v);
  },

  // ---- read stories
  _readSet: null,
  _read() {
    if (!this._readSet) this._readSet = new Set(this._get('hn_read', []));
    return this._readSet;
  },
  isRead(id) {
    return this._read().has(id);
  },
  markRead(id) {
    const set = this._read();
    if (set.has(id)) return;
    set.add(id);
    let arr = Array.from(set);
    if (arr.length > 3000) arr = arr.slice(arr.length - 3000);
    this._readSet = new Set(arr);
    this._set('hn_read', arr);
  },

  // ---- saved stories (slim story objects, newest first)
  saved() {
    return this._get('hn_saved', []);
  },
  isSaved(id) {
    return this.saved().some((s) => s.id === id);
  },
  toggleSaved(story) {
    const list = this.saved();
    const idx = list.findIndex((s) => s.id === story.id);
    if (idx >= 0) {
      list.splice(idx, 1);
      this._set('hn_saved', list);
      return false;
    }
    list.unshift({
      id: story.id, title: story.title, url: story.url || null, by: story.by,
      time: story.time, score: story.score || 0, descendants: story.descendants || 0,
      savedAt: Math.floor(Date.now() / 1000)
    });
    this._set('hn_saved', list.slice(0, 500));
    return true;
  },

  // ---- collapsed comments per story (session only)
  collapsed(storyId) {
    try {
      const raw = sessionStorage.getItem(`hn_col_${storyId}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  },
  setCollapsed(storyId, set) {
    try {
      sessionStorage.setItem(`hn_col_${storyId}`, JSON.stringify(Array.from(set)));
    } catch { /* ignore */ }
  },

  // ---- last seen feed (for start_url landing)
  get lastFeed() {
    return this._get('hn_feed', 'top');
  },
  set lastFeed(v) {
    this._set('hn_feed', v);
  }
};
