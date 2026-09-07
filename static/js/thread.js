// thread.js - Comments pane: full tree render, robust collapse, jump-to-next-root

const Thread = {
  el: null,
  storyId: null,
  tree: null,
  collapsed: new Set(),
  _token: 0,
  _rootTops: [],

  init() {
    this.el = $('#comments-scroll');

    // One delegated handler for the whole tree.
    this.el.addEventListener('click', (e) => {
      const rail = e.target.closest('.c-rail');
      const head = e.target.closest('.c-head');
      // On touch screens a tap on the comment text collapses it too (links still open).
      const body = isTouch() ? e.target.closest('.c-body') : null;
      if (rail || head || body) {
        if (e.target.closest('a, pre, code')) return;
        if (body && String(window.getSelection && window.getSelection()).length) return;
        const li = e.target.closest('.c');
        if (li) this.toggle(Number(li.dataset.id), li);
        return;
      }
      const act = e.target.closest('[data-thread-action]');
      if (act) {
        const a = act.dataset.threadAction;
        if (a === 'collapse-all') this.collapseAll();
        else if (a === 'expand-all') this.expandAll();
        else if (a === 'refresh') App.reloadItem();
        else if (a === 'article') App.setPane('article', { navigate: true });
        return;
      }
      // In-app links to other HN items.
      const a = e.target.closest('a[href]');
      if (a) {
        const m = /news\.ycombinator\.com\/item\?id=(\d+)/.exec(a.href);
        if (m) {
          e.preventDefault();
          App.navigate(`#/item/${m[1]}`);
        }
      }
    });

    $('#btn-jump').addEventListener('click', () => this.jumpNext());
    this.el.addEventListener('scroll', () => this._updateJump(), { passive: true });
  },

  reset() {
    this._token++;
    this.storyId = null;
    this.tree = null;
    this.el.innerHTML = '';
    this.el.scrollTop = 0;
    $('#btn-jump').hidden = true;
  },

  skeleton(story) {
    this.el.innerHTML = `
      ${this._head(story, { loading: true })}
      <ol class="comments">
        ${[0, 1, 1, 0, 2, 0].map((d) => `
          <li class="c c-skel" style="--d:${d}">
            <div class="c-rail"></div>
            <div class="skel skel-line thin" style="width:120px"></div>
            <div class="skel skel-line" style="width:96%"></div>
            <div class="skel skel-line" style="width:${60 + d * 10}%"></div>
          </li>`).join('')}
      </ol>`;
  },

  async load(story, { fresh = false } = {}) {
    const token = ++this._token;
    this.storyId = story.id;
    this.collapsed = Store.collapsed(story.id);
    this.el.scrollTop = 0;
    this.skeleton(story);

    let tree;
    try {
      tree = await API.item(story.id, { fresh });
    } catch (err) {
      if (token !== this._token) return null;
      this.el.innerHTML = `${this._head(story)}<div class="thread-notice"><p>Couldn't load comments${navigator.onLine ? '' : ' — you are offline'}.</p><button class="btn ghost" data-thread-action="refresh">Retry</button></div>`;
      return null;
    }
    if (token !== this._token) return null;
    if (!tree) {
      this.el.innerHTML = `${this._head(story)}<div class="thread-notice"><p>Story not found.</p></div>`;
      return null;
    }
    this.tree = tree;
    this.render(tree);
    return tree;
  },

  render(tree) {
    const total = this._count(tree);
    const html = `
      ${this._head(tree, { total })}
      ${tree.kids && tree.kids.length
        ? `<ol class="comments">${tree.kids.map((k) => this._comment(k, 0, tree.by)).join('')}</ol>`
        : '<div class="thread-notice"><p>No comments yet.</p></div>'}
      <div class="thread-end">${total ? `<span>${pluralize(total, 'comment')}</span>` : ''}<a class="btn ghost" href="${hnItemUrl(tree.id)}" target="_blank" rel="noopener noreferrer">Reply on HN ↗</a></div>`;
    this.el.innerHTML = html;
    // Restore collapsed state.
    for (const id of this.collapsed) {
      const li = this.el.querySelector(`.c[data-id="${id}"]`);
      if (li) li.classList.add('collapsed');
    }
    this._measureRoots();
    this._updateJump();
  },

  _head(story, { total, loading } = {}) {
    const n = total ?? story.descendants ?? 0;
    return `
      <header class="thread-head">
        <a class="thread-title" href="#/read/${story.id}" data-thread-action="article">${escapeHtml(story.title || '')}</a>
        <div class="thread-meta">
          <span class="story-pts"><svg viewBox="0 0 12 12"><path d="M6 2l4.5 7h-9z"/></svg>${story.score ?? 0}</span>
          <span>${escapeHtml(story.by || '')}</span>
          <time title="${escapeHtml(fullDate(story.time))}">${timeAgo(story.time)}</time>
          <span class="thread-count">${loading ? 'loading…' : pluralize(n, 'comment')}</span>
        </div>
        ${n > 0 && !loading ? `
        <div class="thread-tools">
          <button class="chip" data-thread-action="collapse-all">Collapse all</button>
          <button class="chip" data-thread-action="expand-all">Expand all</button>
          <button class="chip" data-thread-action="refresh" title="Reload comments">↻</button>
        </div>` : ''}
      </header>`;
  },

  _count(node) {
    if (!node.kids) return 0;
    return node.kids.reduce((n, k) => n + 1 + this._count(k), 0);
  },

  _comment(node, depth, opBy) {
    const kidsCount = this._count(node);
    const isOp = opBy && node.by === opBy;
    const deep = depth >= 7;
    return `
      <li class="c${deep ? ' c-deep' : ''}" data-id="${node.id}" data-depth="${depth}" style="--d:${Math.min(depth, 7)}">
        <button class="c-rail" aria-label="Collapse thread" tabindex="-1"></button>
        <div class="c-head">
          <span class="c-by${isOp ? ' is-op' : ''}">${escapeHtml(node.by || '[deleted]')}${isOp ? '<span class="op">OP</span>' : ''}</span>
          <time class="c-time" title="${escapeHtml(fullDate(node.time))}">${timeAgo(node.time)}</time>
          ${kidsCount ? `<span class="c-count" aria-label="${kidsCount} replies">${kidsCount}</span>` : ''}
          <span class="c-more">[+${kidsCount + 1}]</span>
        </div>
        <div class="c-body">${node.text ? this._safe(node.text) : '<p class="muted">[deleted]</p>'}</div>
        ${node.kids && node.kids.length ? `<ol class="c-kids">${node.kids.map((k) => this._comment(k, depth + 1, opBy)).join('')}</ol>` : ''}
      </li>`;
  },

  // HN comment HTML is small; sanitize to a string through the shared allowlist.
  _safe(html) {
    const frag = sanitizeHtml(html);
    const div = document.createElement('div');
    div.appendChild(frag);
    // HN omits the opening <p> on the first paragraph; wrap loose text.
    if (div.firstChild && div.firstChild.nodeType === Node.TEXT_NODE) {
      const p = document.createElement('p');
      while (div.firstChild && !(div.firstChild.nodeType === 1 && div.firstChild.tagName === 'P')) {
        p.appendChild(div.firstChild);
      }
      div.prepend(p);
    }
    return div.innerHTML;
  },

  toggle(id, li) {
    li = li || this.el.querySelector(`.c[data-id="${id}"]`);
    if (!li) return;
    const nowCollapsed = li.classList.toggle('collapsed');
    if (nowCollapsed) this.collapsed.add(id); else this.collapsed.delete(id);
    Store.setCollapsed(this.storyId, this.collapsed);
    haptic(6);
    // Keep the header of the thread we just collapsed in view.
    const top = li.getBoundingClientRect().top - this.el.getBoundingClientRect().top;
    if (nowCollapsed && top < 0) {
      this.el.scrollTop += top - 8;
    }
    this._measureRoots();
    this._updateJump();
  },

  collapseAll() {
    for (const li of $$('.c[data-depth="0"]', this.el)) {
      li.classList.add('collapsed');
      this.collapsed.add(Number(li.dataset.id));
    }
    Store.setCollapsed(this.storyId, this.collapsed);
    this.el.scrollTop = 0;
    this._measureRoots();
    this._updateJump();
  },

  expandAll() {
    for (const li of $$('.c.collapsed', this.el)) li.classList.remove('collapsed');
    this.collapsed.clear();
    Store.setCollapsed(this.storyId, this.collapsed);
    this._measureRoots();
    this._updateJump();
  },

  // ---- jump to next top-level comment ----
  _measureRoots() {
    // Measurements taken while the pane is display:none are all zero; remember that.
    this._measuredVisible = this.el.clientHeight > 0;
    const base = this.el.getBoundingClientRect().top;
    this._rootTops = $$('.c[data-depth="0"]', this.el).map((li) => ({
      li, top: li.getBoundingClientRect().top - base + this.el.scrollTop
    }));
  },

  _updateJump() {
    const btn = $('#btn-jump');
    if (!this._measuredVisible && this.el.clientHeight > 0) this._measureRoots();
    const roots = this._rootTops;
    const show = roots.length > 2 && App.state.layout === 'mobile' && App.state.pane === 'comments';
    if (!show) { btn.hidden = true; return; }
    const y = this.el.scrollTop + 12;
    const hasNext = roots.some((r) => r.top > y + 40);
    btn.hidden = !hasNext;
  },

  jumpNext() {
    if (!this._rootTops.length || !this._measuredVisible) this._measureRoots();
    const y = this.el.scrollTop + 12;
    const next = this._rootTops.find((r) => r.top > y + 40);
    if (!next) return;
    this.el.scrollTo({ top: next.top - 6, behavior: 'smooth' });
    haptic(6);
  }
};
