// app.js - Router, layout, detail orchestration, keyboard, theme, service worker

const App = {
  state: {
    route: null,
    feed: 'top',        // 'top' | 'new' | ... | 'saved' | 'search'
    query: '',
    page: 0,
    hasMore: false,
    loadingFeed: false,
    selectedId: null,
    story: null,        // slim story for the open item
    pane: 'comments',   // 'article' | 'comments'
    layout: 'mobile',   // 'mobile' | 'two' | 'three'
    detailOpen: false,
    depth: 0,           // in-app history depth (0 = entry point)
    lastHidden: 0
  },
  _replacing: false,
  _itemToken: 0,
  _mq: null,

  init() {
    Feed.init();
    Reader.init();
    Thread.init();
    Gestures.init();
    this._initLayout();
    this._initColumns();
    this._initTheme();
    this._bind();
    this._initServiceWorker();
    this._initVisibility();
    this._initShare();

    window.addEventListener('hashchange', () => this.handleRoute());
    if (!location.hash) {
      this._replacing = true;
      location.replace(`#/${Store.lastFeed}`);
    }
    this.handleRoute();
  },

  // ---------------- Layout ----------------

  _initLayout() {
    this._mq = { two: matchMedia('(min-width: 768px)'), three: matchMedia('(min-width: 1180px)') };
    const apply = () => {
      const l = this._mq.three.matches ? 'three' : this._mq.two.matches ? 'two' : 'mobile';
      const was = this.state.layout;
      this.state.layout = l;
      document.body.dataset.layout = l;
      // Collapsing to a phone width while on a feed route: the desktop detail pane must not linger as an overlay.
      if (l === 'mobile' && was !== 'mobile' && this.state.route && this.state.route.name !== 'item') this.closeDetail();
      this._syncDetail();
      Thread._updateJump();
    };
    this._applyLayout = apply;
    this._mq.two.addEventListener('change', apply);
    this._mq.three.addEventListener('change', apply);
    // Some embedded browsers fire resize without matchMedia change events.
    window.addEventListener('resize', debounce(apply, 80));
    apply();
  },

  // ---------------- Desktop columns: drag to resize, swap panes ----------------

  _initColumns() {
    const root = document.documentElement.style;
    if (Store.sidebar) root.setProperty('--sidebar', `${Store.sidebar}px`);
    if (Store.split) root.setProperty('--split', `${Store.split}px`);
    $('#detail-body').classList.toggle('swapped', Store.swapped);
    $('#btn-swap').classList.toggle('on', Store.swapped);
    $('#btn-swap').addEventListener('click', () => this.toggleSwap());

    for (const handle of $$('.col-resizer')) {
      const which = handle.dataset.resize;
      const container = () => (which === 'sidebar' ? $('#app') : $('#detail-body'));
      const limits = () => {
        const w = container().getBoundingClientRect().width;
        return which === 'sidebar' ? [300, Math.min(700, w - 480)] : [320, w - 327];
      };
      let startX = 0;
      let startW = 0;
      let dragging = false;
      const move = (e) => {
        if (!dragging) return;
        const [min, max] = limits();
        const w = clamp(startW + (e.clientX - startX), min, max);
        root.setProperty(which === 'sidebar' ? '--sidebar' : '--split', `${w}px`);
      };
      const end = () => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('active');
        document.body.classList.remove('resizing');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        const w = handle.getBoundingClientRect().left - container().getBoundingClientRect().left;
        if (which === 'sidebar') Store.sidebar = w; else Store.split = w;
        Thread._measureRoots();
      };
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic or unsupported */ }
        dragging = true;
        startX = e.clientX;
        startW = handle.getBoundingClientRect().left - container().getBoundingClientRect().left;
        handle.classList.add('active');
        document.body.classList.add('resizing');
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
      });
      handle.addEventListener('dblclick', () => {
        root.removeProperty(which === 'sidebar' ? '--sidebar' : '--split');
        if (which === 'sidebar') Store.sidebar = 0; else Store.split = 0;
      });
    }
  },

  toggleSwap() {
    const on = !Store.swapped;
    Store.swapped = on;
    $('#detail-body').classList.toggle('swapped', on);
    $('#btn-swap').classList.toggle('on', on);
    this.toast(on ? 'Comments on the left' : 'Article on the left');
  },

  // ---------------- Theme ----------------

  _initTheme() {
    this._applyThemeColor();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this._applyThemeColor());
  },

  isDark() {
    const t = Store.theme;
    if (t === 'auto') return matchMedia('(prefers-color-scheme: dark)').matches;
    return t === 'dark';
  },

  toggleTheme() {
    const next = this.isDark() ? 'light' : 'dark';
    Store.theme = next;
    document.documentElement.setAttribute('data-theme', next);
    this._applyThemeColor();
  },

  _applyThemeColor() {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#f6f1e8';
    for (const m of $$('meta[name="theme-color"]')) m.setAttribute('content', color);
  },

  // ---------------- Routing ----------------

  parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/');
    const id = Number(parts[1]);
    if (parts[0] === 'item' && id > 0) return { name: 'item', id, pane: 'comments' };
    if (parts[0] === 'read' && id > 0) return { name: 'item', id, pane: 'article' };
    if (parts[0] === 'search') {
      let q = '';
      try { q = decodeURIComponent(parts.slice(1).join('/')); } catch { q = parts.slice(1).join('/'); }
      return { name: 'search', q };
    }
    if (parts[0] === 'saved') return { name: 'feed', feed: 'saved' };
    if (API.FEEDS.includes(parts[0])) return { name: 'feed', feed: parts[0] };
    return { name: 'feed', feed: 'top' };
  },

  navigate(hash, { replace = false } = {}) {
    if (location.hash === hash) return this.handleRoute();
    if (replace) {
      this._replacing = true;
      location.replace(hash);
    } else {
      location.hash = hash;
    }
  },

  _trackDepth() {
    const st = history.state;
    if (st && typeof st.d === 'number') {
      this.state.depth = st.d;
    } else if (this._replacing) {
      history.replaceState({ d: this.state.depth }, '');
    } else if (this.state.route === null) {
      this.state.depth = 0;
      history.replaceState({ d: 0 }, '');
    } else {
      this.state.depth += 1;
      history.replaceState({ d: this.state.depth }, '');
    }
    this._replacing = false;
  },

  handleRoute() {
    this._applyLayout();
    this._trackDepth();
    const route = this.parseHash();
    const prev = this.state.route;
    this.state.route = route;

    if (route.name === 'feed') {
      this._closeSearchUi();
      this.setFeed(route.feed);
      if (this.state.layout === 'mobile') this.closeDetail();
    } else if (route.name === 'search') {
      this._openSearchUi(route.q);
      if (route.q) this.setFeed('search', route.q);
      if (this.state.layout === 'mobile') this.closeDetail();
    } else if (route.name === 'item') {
      // Feed behind the detail: make sure something is loaded for context on desktop.
      if (!prev && !Feed.stories.length) this.setFeed(Store.lastFeed);
      this.openItem(route.id, route.pane);
    }
  },

  goBack() {
    if (this.state.depth > 0) {
      history.back();
    } else {
      const feed = this.state.feed === 'search' ? Store.lastFeed : this.state.feed;
      this.navigate(`#/${feed}`, { replace: true });
    }
  },

  // ---------------- Feed ----------------

  async setFeed(feed, query = '') {
    const changed = feed !== this.state.feed || (feed === 'search' && query !== this.state.query) || !Feed.stories.length;
    this.state.feed = feed;
    this.state.query = query;
    if (feed !== 'search' && feed !== 'saved') Store.lastFeed = feed;
    this._syncTabs();
    if (!changed) return;
    this.state.page = 0;
    Feed.scroll.scrollTop = 0;
    await this.loadFeed();
  },

  _syncTabs() {
    for (const a of $$('[data-feed]')) a.classList.toggle('active', a.dataset.feed === this.state.feed);
    const names = { top: 'Top', new: 'New', best: 'Best', ask: 'Ask HN', show: 'Show HN', jobs: 'Jobs', saved: 'Saved', search: 'Search' };
    document.title = this.state.story ? `${this.state.story.title} — HN` : `${names[this.state.feed] || 'HN'} — HN`;
  },

  async loadFeed({ append = false, fresh = false } = {}) {
    if (this.state.loadingFeed) return;
    this.state.loadingFeed = true;
    const { feed, query, page } = this.state;
    const token = `${feed}|${query}|${page}|${Date.now()}`;
    this._feedToken = token;
    Feed.setStatus('');

    try {
      if (feed === 'saved') {
        const saved = Store.saved();
        if (!saved.length) Feed.setEmpty('Nothing saved yet.', 'Tap the bookmark on any story to keep it here.');
        else Feed.render(saved.map((s, i) => ({ ...s, rank: i + 1 })));
        Feed.setStatus(`<span>${pluralize(saved.length, 'saved story').replace('storys', 'stories')}</span>`);
        Feed.setLoadMore(false);
        return;
      }
      if (!append) Feed.renderSkeleton();
      else Feed.setLoadMore(true, true);

      const data = feed === 'search'
        ? await API.search(query, page)
        : await API.feed(feed, page, { fresh });
      if (this._feedToken !== token) return;

      if (!append && !data.stories.length) {
        Feed.setEmpty(feed === 'search' ? `No results for “${query}”.` : 'Nothing here right now.');
      } else {
        Feed.render(data.stories, { append, animate: !append });
      }
      if (feed === 'search') Feed.setStatus(`<span>${data.total.toLocaleString()} results for <b>${escapeHtml(query)}</b></span>`);
      this.state.hasMore = !!data.hasMore;
      Feed.setLoadMore(this.state.hasMore);
      Feed.setOffline(false);
    } catch (err) {
      if (this._feedToken !== token) return;
      if (!append) {
        Feed.setEmpty(navigator.onLine ? 'Could not load stories.' : 'You are offline.', '<button class="btn ghost" onclick="App.refresh()">Try again</button>');
      } else {
        Feed.setLoadMore(true);
        this.state.page = Math.max(0, this.state.page - 1);
        this.toast('Could not load more');
      }
      Feed.setOffline(!navigator.onLine);
    } finally {
      this.state.loadingFeed = false;
    }
  },

  async loadMore() {
    if (!this.state.hasMore || this.state.loadingFeed) return;
    this.state.page += 1;
    await this.loadFeed({ append: true });
  },

  async refresh({ silent = false } = {}) {
    if (this.state.feed === 'saved') return this.loadFeed();
    this.state.page = 0;
    const btn = $('#btn-refresh');
    btn.classList.add('spinning');
    try {
      await this.loadFeed({ fresh: true });
      if (!silent) this.toast('Refreshed');
    } finally {
      setTimeout(() => btn.classList.remove('spinning'), 400);
    }
    // Nudge the service worker to look for a new build.
    navigator.serviceWorker?.getRegistration().then((r) => r && r.update()).catch(() => {});
  },

  // ---------------- Detail ----------------

  async openItem(id, pane) {
    const same = this.state.selectedId === id;
    this.state.selectedId = id;
    this.state.pane = pane;
    Store.markRead(id);
    Feed.markRead(id);
    Feed.select(id, { scroll: this.state.layout !== 'mobile' });
    this.openDetail();
    this.setPane(pane);
    if (same) return;

    const token = ++this._itemToken;
    let story = Feed.storyById(id) || Store.saved().find((s) => s.id === id) || null;
    this.state.story = story;
    Reader.reset();
    Thread.reset();
    this._syncActions();

    if (story) {
      Reader.load(story);
      Thread.skeleton(story);
    } else {
      Thread.skeleton({ id, title: '…' });
      Reader.el.innerHTML = '';
    }

    const tree = await Thread.load(story || { id, title: '' });
    if (token !== this._itemToken) return;
    if (tree) {
      const slim = {
        id: tree.id, title: tree.title || '', url: tree.url || null, by: tree.by, time: tree.time,
        score: tree.score || 0, descendants: tree.descendants || 0, type: tree.type || 'story', text: !!tree.text
      };
      if (!story) {
        story = slim;
        this.state.story = story;
        Reader.load(story);
      } else {
        // Keep counts fresh.
        Object.assign(story, { descendants: slim.descendants, score: slim.score });
      }
      if (!story.url) Reader.renderText(tree);
      $('#seg-count').textContent = slim.descendants ? slim.descendants : '';
      this._syncActions();
    }
  },

  reloadItem() {
    const s = this.state.story;
    if (!s) return;
    Thread.load(s, { fresh: true }).then((tree) => {
      if (tree && !s.url) Reader.renderText(tree);
      if (tree) $('#seg-count').textContent = tree.descendants || '';
    });
  },

  openDetail() {
    const d = $('#detail');
    d.dataset.id = this.state.selectedId;
    d.setAttribute('aria-hidden', 'false');
    this.state.detailOpen = true;
    this._syncDetail();
  },

  closeDetail() {
    if (!this.state.detailOpen) return;
    this.state.detailOpen = false;
    this._syncDetail();
    if (this.state.layout === 'mobile') {
      // Deselect so reopening the same story reloads it fresh.
      this.state.selectedId = null;
      this.state.story = null;
      this._itemToken++;
      $('#detail').setAttribute('aria-hidden', 'true');
      this._syncTabs();
    }
  },

  _syncDetail() {
    const d = $('#detail');
    const open = this.state.detailOpen;
    d.classList.toggle('open', open);
    document.body.classList.toggle('detail-open', open && this.state.layout === 'mobile');
    if (!open && this.state.layout === 'mobile') {
      // After the slide-out completes, drop content so the overlay is inert.
      const onEnd = () => { if (!this.state.detailOpen) { delete d.dataset.id; } d.removeEventListener('transitionend', onEnd); };
      d.addEventListener('transitionend', onEnd);
    }
  },

  setPane(pane, { navigate = false } = {}) {
    this.state.pane = pane;
    $('#detail').dataset.pane = pane;
    for (const b of $$('.seg-btn')) {
      const on = b.dataset.pane === pane;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    Thread._updateJump();
    if (navigate && this.state.selectedId) {
      const hash = pane === 'article' ? `#/read/${this.state.selectedId}` : `#/item/${this.state.selectedId}`;
      if (location.hash !== hash) this.navigate(hash, { replace: true });
    }
  },

  _syncActions() {
    const s = this.state.story;
    const save = $('#btn-save');
    const open = $('#btn-open');
    if (!s) { save.classList.remove('on'); open.href = '#'; return; }
    save.classList.toggle('on', Store.isSaved(s.id));
    save.setAttribute('aria-pressed', Store.isSaved(s.id) ? 'true' : 'false');
    open.href = s.url || hnItemUrl(s.id);
    this._syncTabs();
  },

  toggleSave(story = this.state.story) {
    if (!story) return;
    const on = Store.toggleSaved(story);
    this._syncActions();
    this.toast(on ? 'Saved' : 'Removed from saved');
    haptic(6);
    if (this.state.feed === 'saved') this.loadFeed();
  },

  _initShare() {
    $('#btn-share').addEventListener('click', async () => {
      const s = this.state.story;
      if (!s) return;
      const url = s.url || hnItemUrl(s.id);
      if (navigator.share) {
        try { await navigator.share({ title: s.title, url }); } catch { /* cancelled */ }
      } else {
        try { await navigator.clipboard.writeText(url); this.toast('Link copied'); } catch { this.toast(url); }
      }
    });
  },

  // ---------------- Search ----------------

  _openSearchUi(q) {
    const form = $('#feed-search');
    const input = $('#search-input');
    form.hidden = false;
    if (input.value !== q) input.value = q;
    if (!q) input.focus();
  },

  _closeSearchUi() {
    $('#feed-search').hidden = true;
  },

  // ---------------- Events ----------------

  _bind() {
    $('#btn-back').addEventListener('click', () => this.goBack());
    $('#btn-refresh').addEventListener('click', () => this.refresh());
    $('#btn-theme').addEventListener('click', () => this.toggleTheme());
    $('#btn-save').addEventListener('click', () => this.toggleSave());
    $('#btn-saved').addEventListener('click', () => this.navigate('#/saved'));
    $('#btn-search').addEventListener('click', () => {
      if ($('#feed-search').hidden) this._openSearchUi(this.state.feed === 'search' ? this.state.query : '');
      else $('#search-input').focus();
    });
    $('#search-close').addEventListener('click', () => {
      this._closeSearchUi();
      if (this.state.feed === 'search') this.navigate(`#/${Store.lastFeed}`);
    });
    $('#feed-search').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#search-input').value.trim();
      if (q) this.navigate(`#/search/${encodeURIComponent(q)}`);
      $('#search-input').blur();
    });
    $('#seg').addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (b) this.setPane(b.dataset.pane, { navigate: true });
    });

    // Feed tab links: tapping the active tab scrolls to top / refreshes.
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-feed]');
      if (!a) return;
      if (a.dataset.feed === this.state.feed && this.state.route?.name === 'feed') {
        e.preventDefault();
        if (Feed.scroll.scrollTop > 0) Feed.scroll.scrollTo({ top: 0, behavior: 'smooth' });
        else this.refresh();
      }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => this._onKey(e));

    // iOS scrolls the document to reveal a focused input and can leave it shifted after the
    // keyboard closes (header under the status bar, tab bar floating). Snap it back.
    const resetViewport = () => {
      if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    };
    const input = $('#search-input');
    input.addEventListener('blur', () => { resetViewport(); setTimeout(resetViewport, 60); setTimeout(resetViewport, 350); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', debounce(() => {
        if (document.activeElement === input) return;
        resetViewport();
      }, 80));
    }
    window.addEventListener('scroll', () => { if (document.activeElement !== input) resetViewport(); }, { passive: true });

    // Online/offline
    window.addEventListener('online', () => { Feed.setOffline(false); if (!Feed.stories.length) this.refresh({ silent: true }); });
    window.addEventListener('offline', () => Feed.setOffline(true));
  },

  _onKey(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (typing) {
      if (e.key === 'Escape') { e.target.blur(); if (!$('#search-input').value) { this._closeSearchUi(); if (this.state.feed === 'search') this.navigate(`#/${Store.lastFeed}`); } }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const s = Feed.cursorStory() || this.state.story;
    switch (e.key) {
      case 'j': case 'ArrowDown': if (e.key === 'j' || this.state.layout !== 'mobile') { e.preventDefault(); Feed.moveCursor(1); } break;
      case 'k': case 'ArrowUp': if (e.key === 'k' || this.state.layout !== 'mobile') { e.preventDefault(); Feed.moveCursor(-1); } break;
      case 'Enter': if (s) { e.preventDefault(); this.navigate(`#/read/${s.id}`); } break;
      case 'c': if (s) { e.preventDefault(); this.navigate(`#/item/${s.id}`); } break;
      case 'o': if (s) { e.preventDefault(); window.open(s.url || hnItemUrl(s.id), '_blank', 'noopener'); } break;
      case 's': if (s) { e.preventDefault(); this.toggleSave(s); } break;
      case '/': e.preventDefault(); this._openSearchUi(this.state.feed === 'search' ? this.state.query : ''); $('#search-input').select(); break;
      case 'r': e.preventDefault(); this.refresh(); break;
      case 'x': if (this.state.layout === 'three') { e.preventDefault(); this.toggleSwap(); } break;
      case 'a': if (this.state.detailOpen) { e.preventDefault(); this.setPane(this.state.pane === 'article' ? 'comments' : 'article', { navigate: true }); } break;
      case 'n': if (this.state.detailOpen) { e.preventDefault(); Thread.jumpNext(); } break;
      case 'Escape': if (this.state.detailOpen && this.state.layout === 'mobile') this.goBack(); else if (!$('#feed-search').hidden) { this._closeSearchUi(); if (this.state.feed === 'search') this.navigate(`#/${Store.lastFeed}`); } break;
      case '1': case '2': case '3': case '4': case '5': case '6': {
        const f = ['top', 'new', 'best', 'ask', 'show', 'jobs'][Number(e.key) - 1];
        this.navigate(`#/${f}`);
        break;
      }
      default: return;
    }
  },

  _initVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.state.lastHidden = Date.now();
        return;
      }
      const away = Date.now() - (this.state.lastHidden || 0);
      const onFeed = this.state.route?.name === 'feed' && !(this.state.detailOpen && this.state.layout === 'mobile');
      if (this.state.lastHidden && away > 10 * 60 * 1000 && onFeed && Feed.scroll.scrollTop < 40) {
        this.refresh({ silent: true });
      }
    });
  },

  // ---------------- Toast ----------------

  _toastTimer: null,
  toast(msg, { action, onAction, duration = 2600 } = {}) {
    const t = $('#toast');
    const btn = $('#toast-btn');
    $('#toast-msg').textContent = msg;
    btn.hidden = !action;
    btn.textContent = action || '';
    btn.onclick = onAction || null;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(this._toastTimer);
    if (duration > 0) {
      this._toastTimer = setTimeout(() => this.hideToast(), duration);
    }
  },
  hideToast() {
    const t = $('#toast');
    t.classList.remove('show');
    setTimeout(() => { if (!t.classList.contains('show')) t.hidden = true; }, 250);
  },

  // ---------------- Service worker ----------------

  _initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Local dev serves fresh files; a cached shell there only gets in the way (opt in with ?sw=1).
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw=1/.test(location.search)) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        const promptUpdate = (worker) => {
          this.toast('A new version is ready', {
            action: 'Reload',
            duration: 0,
            onAction: () => worker.postMessage('SKIP_WAITING')
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(w);
          });
        });
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          location.reload();
        });
        // Check for updates when the app comes back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      } catch { /* SW is optional */ }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
