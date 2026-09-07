// feed.js - Story list: rendering, selection, lazy thumbnails/blurbs, keyboard cursor

const Feed = {
  list: null,
  scroll: null,
  stories: [],
  _observer: null,
  _cursor: -1,

  init() {
    this.list = $('#story-list');
    this.scroll = $('#feed-scroll');
    this._observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        this._observer.unobserve(e.target);
        this._hydrate(e.target);
      }
    }, { root: this.scroll, rootMargin: '300px 0px' });

    // Delegated clicks: a tap anywhere on a row that is not a link opens the story.
    this.list.addEventListener('click', (e) => {
      const row = e.target.closest('.story');
      if (!row) return;
      if (e.target.closest('a, button')) return;
      const id = Number(row.dataset.id);
      App.navigate(`#/read/${id}`);
    });

    // Favicon lookups 404 for some domains; fall back to a glyph instead of a broken image.
    this.list.addEventListener('error', (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      const thumb = img.closest('.story-thumb');
      if (!thumb) return;
      if (img.classList.contains('thumb-ico')) {
        const glyph = document.createElement('span');
        glyph.className = 'thumb-glyph';
        glyph.textContent = '¶';
        img.replaceWith(glyph);
      }
    }, true);

    $('#btn-more').addEventListener('click', () => App.loadMore());
  },

  storyById(id) {
    return this.stories.find((s) => s.id === id) || null;
  },

  clear() {
    this.stories = [];
    this._cursor = -1;
    this.list.innerHTML = '';
  },

  renderSkeleton(count = 12) {
    this.clear();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const li = document.createElement('li');
      li.className = 'story story-skel';
      li.style.setProperty('--i', i);
      li.innerHTML = `
        <div class="story-rank skel"></div>
        <div class="story-main">
          <div class="skel skel-line" style="width:${70 + ((i * 13) % 28)}%"></div>
          <div class="skel skel-line" style="width:${40 + ((i * 7) % 30)}%"></div>
          <div class="skel skel-line thin" style="width:42%"></div>
        </div>
        <div class="story-thumb skel"></div>`;
      frag.appendChild(li);
    }
    this.list.appendChild(frag);
  },

  render(stories, { append = false, animate = true } = {}) {
    if (!append) this.clear();
    const startIdx = this.stories.length;
    this.stories.push(...stories);
    const frag = document.createDocumentFragment();
    stories.forEach((s, i) => {
      const li = this._row(s, startIdx + i, animate);
      frag.appendChild(li);
      if (s.url) this._observer.observe(li);
    });
    this.list.appendChild(frag);
    if (App.state.selectedId) this.select(App.state.selectedId, { scroll: false });
  },

  _row(story, idx, animate) {
    const li = document.createElement('li');
    const domain = domainOf(story.url);
    const read = Store.isRead(story.id);
    const isJob = story.type === 'job';
    li.className = `story${read ? ' is-read' : ''}${animate ? ' story-in' : ''}`;
    li.dataset.id = story.id;
    li.dataset.idx = idx;
    if (animate) li.style.setProperty('--i', Math.min(idx % 30, 14));
    const readHref = `#/read/${story.id}`;
    const commentsHref = `#/item/${story.id}`;
    const favicon = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '';

    li.innerHTML = `
      <div class="story-rank">${story.rank || idx + 1}</div>
      <div class="story-main">
        <h3 class="story-title">
          <a class="story-link" href="${readHref}">${escapeHtml(story.title)}</a>
          ${domain ? `<a class="story-domain" href="${escapeHtml(story.url)}" target="_blank" rel="noopener noreferrer" title="Open on ${escapeHtml(domain)}">${escapeHtml(domain)}</a>` : ''}
        </h3>
        <p class="story-blurb" hidden></p>
        <div class="story-meta">
          <span class="story-pts" title="${story.score} points"><svg viewBox="0 0 12 12"><path d="M6 2l4.5 7h-9z"/></svg>${story.score}</span>
          <span class="story-by">${escapeHtml(story.by)}</span>
          <time class="story-time" title="${escapeHtml(fullDate(story.time))}">${timeAgo(story.time)}</time>
          ${isJob ? '<span class="story-job">job</span>' : `<a class="story-comments" href="${commentsHref}"><svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>${story.descendants || 0}</a>`}
        </div>
      </div>
      <a class="story-thumb" href="${readHref}" tabindex="-1" aria-hidden="true">${favicon ? `<img class="thumb-ico" src="${favicon}" alt="" loading="lazy" decoding="async">` : `<span class="thumb-glyph">${story.type === 'job' ? '⚑' : (story.title || '').startsWith('Ask HN') ? '?' : '¶'}</span>`}</a>`;
    return li;
  },

  async _hydrate(li) {
    const story = this.storyById(Number(li.dataset.id));
    if (!story || !story.url) return;
    const meta = await API.meta(story.url);
    if (!meta || !li.isConnected) return;

    if (meta.image) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const thumb = li.querySelector('.story-thumb');
        if (!thumb) return;
        img.className = 'thumb-img';
        img.alt = '';
        thumb.replaceChildren(img);
        thumb.classList.add('has-img');
      };
      img.src = meta.image;
    }
    if (Store.blurbs && meta.description) {
      const blurb = this._cleanBlurb(meta.description, story.title);
      if (blurb) {
        const p = li.querySelector('.story-blurb');
        p.textContent = blurb;
        p.hidden = false;
      }
    }
  },

  _cleanBlurb(desc, title) {
    let d = String(desc).replace(/\s+/g, ' ').trim();
    if (d.length < 30) return null;
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const nd = norm(d);
    const nt = norm(title);
    if (nd === nt || nd.startsWith(nt) && nd.length < nt.length + 20) return null;
    if (/^(sign in|log in|subscribe|the latest)/i.test(d)) return null;
    if (d.length > 220) d = d.slice(0, 217).replace(/\s+\S*$/, '') + '…';
    return d;
  },

  select(id, { scroll = true } = {}) {
    $$('.story.selected', this.list).forEach((el) => el.classList.remove('selected'));
    const row = this.list.querySelector(`.story[data-id="${id}"]`);
    if (!row) return;
    row.classList.add('selected');
    this._cursor = Number(row.dataset.idx);
    if (scroll) row.scrollIntoView({ block: 'nearest' });
  },

  markRead(id) {
    const row = this.list.querySelector(`.story[data-id="${id}"]`);
    if (row) row.classList.add('is-read');
  },

  // ---- keyboard cursor ----
  moveCursor(delta) {
    if (!this.stories.length) return null;
    const next = clamp(this._cursor + delta, 0, this.stories.length - 1);
    this._cursor = next;
    const story = this.stories[next];
    $$('.story.selected', this.list).forEach((el) => el.classList.remove('selected'));
    const row = this.list.querySelector(`.story[data-idx="${next}"]`);
    if (row) {
      row.classList.add('selected');
      row.scrollIntoView({ block: 'nearest' });
    }
    return story;
  },

  cursorStory() {
    return this._cursor >= 0 ? this.stories[this._cursor] : null;
  },

  setLoadMore(show, loading = false) {
    const foot = $('#feed-foot');
    foot.hidden = !show;
    const btn = $('#btn-more');
    btn.disabled = loading;
    btn.textContent = loading ? 'Loading…' : 'Load more';
  },

  setEmpty(message, hint = '') {
    this.clear();
    this.list.innerHTML = `<li class="feed-empty"><p>${escapeHtml(message)}</p>${hint ? `<p class="hint">${hint}</p>` : ''}</li>`;
  },

  setStatus(html) {
    const el = $('#feed-status');
    if (!html) {
      el.hidden = true;
      el.innerHTML = '';
    } else {
      el.hidden = false;
      el.innerHTML = html;
    }
  },

  setOffline(show) {
    $('#feed-offline').hidden = !show;
  }
};
