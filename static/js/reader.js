// reader.js - Article pane: extraction, typography, TL;DR, reading progress

const Reader = {
  el: null,
  _token: 0,
  _story: null,

  init() {
    this.el = $('#article-scroll');
    this.applyFontScale();
    this.el.addEventListener('scroll', () => this._progress(), { passive: true });

    $('#font-ctl').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-font]');
      if (!btn) return;
      Store.fontScale = Store.fontScale + Number(btn.dataset.font) * 0.08;
      this.applyFontScale();
    });

    // Links inside articles open externally; internal HN item links open in-app.
    this.el.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const m = /news\.ycombinator\.com\/item\?id=(\d+)/.exec(a.href);
      if (m) {
        e.preventDefault();
        App.navigate(`#/item/${m[1]}`);
        return;
      }
      if (a.dataset.action === 'comments') {
        e.preventDefault();
        App.setPane('comments', { navigate: true });
      }
    });
  },

  applyFontScale() {
    document.documentElement.style.setProperty('--reader-scale', Store.fontScale.toFixed(2));
  },

  reset() {
    this._token++;
    this._story = null;
    this.el.innerHTML = '';
    this.el.scrollTop = 0;
    this._progress();
  },

  /** story: slim story (needs id, title, url). Resolves once rendered. */
  async load(story) {
    const token = ++this._token;
    this._story = story;
    this.el.scrollTop = 0;
    this.el.innerHTML = '';
    this.el.appendChild(this._skeleton(story));

    if (!story.url) {
      // Ask HN / text post: the post body is the article. Wait for the thread to bring the text.
      return;
    }
    let data;
    try {
      data = await API.extract(story.url);
    } catch (err) {
      data = { error: err.message || 'failed' };
    }
    if (token !== this._token) return;
    this.el.innerHTML = '';
    if (data && data.content && !data.error) {
      this.el.appendChild(this._article(story, data));
    } else if (data && data.unsupported) {
      this.el.appendChild(this._unsupported(story, data));
    } else {
      this.el.appendChild(this._error(story, data && data.error));
    }
    this._progress();
  },

  /** Called by Thread once the full item (with text) arrives, for text posts. */
  renderText(item) {
    if (!this._story || this._story.id !== item.id || this._story.url) return;
    this.el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'article';
    wrap.innerHTML = `
      ${this._head(item, { kicker: item.type === 'job' ? 'Job' : 'Text post', readMin: readingMinutes(item.text ? item.text.replace(/<[^>]+>/g, ' ') : '') })}
      <div class="prose prose-text"></div>
      ${this._foot(item)}`;
    const body = wrap.querySelector('.prose');
    if (item.text) body.appendChild(sanitizeHtml(item.text));
    else body.innerHTML = '<p class="muted">No text — this post only has comments.</p>';
    this.el.appendChild(wrap);
  },

  _head(story, { kicker, readMin, via } = {}) {
    const domain = domainOf(story.url);
    const bits = [];
    if (domain) bits.push(`<a class="kick-domain" href="${escapeHtml(story.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(domain)}</a>`);
    if (kicker) bits.push(escapeHtml(kicker));
    if (readMin) bits.push(`${readMin} min read`);
    if (via === 'jina') bits.push('via reader proxy');
    return `
      <header class="article-head">
        <div class="kicker">${bits.join('<span class="dot">·</span>')}</div>
        <h1 class="article-title">${escapeHtml(story.title)}</h1>
        <div class="article-meta">
          <span class="story-pts"><svg viewBox="0 0 12 12"><path d="M6 2l4.5 7h-9z"/></svg>${story.score ?? 0}</span>
          <span>${escapeHtml(story.by || '')}</span>
          <time title="${escapeHtml(fullDate(story.time))}">${timeAgo(story.time)}</time>
          <a href="#/item/${story.id}" data-action="comments" class="meta-comments">${pluralize(story.descendants || 0, 'comment')}</a>
        </div>
      </header>`;
  },

  _foot(story) {
    return `
      <footer class="article-foot">
        ${story.url ? `<a class="btn" href="${escapeHtml(story.url)}" target="_blank" rel="noopener noreferrer">Open original ↗</a>` : ''}
        <a class="btn ghost" href="#/item/${story.id}" data-action="comments">${pluralize(story.descendants || 0, 'comment')}</a>
        <a class="btn ghost" href="${hnItemUrl(story.id)}" target="_blank" rel="noopener noreferrer">On HN ↗</a>
      </footer>`;
  },

  _article(story, data) {
    const wrap = document.createElement('div');
    wrap.className = 'article';
    const text = data.textContent || '';
    const readMin = readingMinutes(text);
    const titleDiffers = data.title && data.title.trim() && data.title.trim().toLowerCase() !== (story.title || '').trim().toLowerCase();

    wrap.innerHTML = `
      ${this._head(story, { readMin, via: data.via })}
      ${titleDiffers ? `<p class="article-alt-title">${escapeHtml(data.title)}${data.byline ? `<span class="byline"> — ${escapeHtml(data.byline)}</span>` : ''}</p>` : (data.byline ? `<p class="article-alt-title byline">${escapeHtml(data.byline)}</p>` : '')}
      <div class="tldr-slot"></div>
      <div class="prose"></div>
      ${this._foot(story)}`;

    wrap.querySelector('.prose').appendChild(sanitizeHtml(data.content));
    this._tidyProse(wrap.querySelector('.prose'), data.image, { byline: data.byline, siteName: data.siteName, title: data.title || story.title });

    // TL;DR: extractive summary from the prose only (no code blocks, captions, or tables).
    if (text.length > 1400 && typeof ExtractiveSummarizer !== 'undefined') {
      try {
        const clone = wrap.querySelector('.prose').cloneNode(true);
        for (const el of $$('pre, code, figcaption, table, h1, h2, h3, h4, h5, h6', clone)) el.remove();
        const proseText = $$('p, li, blockquote', clone).map((el) => el.textContent.trim()).filter((t) => t.length > 40).join(' ');
        const sum = ExtractiveSummarizer.summarize(proseText.length > 800 ? proseText : text, story.title);
        const long = (sum.long || '').trim();
        if (long && long.length > 80 && long.toLowerCase() !== story.title.toLowerCase()) {
          const d = document.createElement('details');
          d.className = 'tldr';
          d.open = true;
          d.innerHTML = `<summary>TL;DR</summary><p></p>`;
          d.querySelector('p').textContent = long;
          wrap.querySelector('.tldr-slot').replaceWith(d);
        }
      } catch { /* summary is optional */ }
    }
    return wrap;
  },

  _tidyProse(prose, heroImage, { byline, siteName, title } = {}) {
    // Drop empty paragraphs.
    for (const p of $$('p', prose)) {
      if (!p.textContent.trim() && !p.querySelector('img,video')) p.remove();
    }
    // Unwrap a lone top-level wrapper div so the leading-chrome pass sees real content.
    while (prose.children.length === 1 && prose.firstElementChild.tagName === 'DIV') {
      const wrap = prose.firstElementChild;
      prose.replaceChildren(...wrap.childNodes);
    }
    // Strip site chrome Readability sometimes keeps at the top: rules, the author/site name,
    // a repeated title, or a wrapper that only contains those.
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const junk = new Set([norm(byline), norm(siteName), norm(title)].filter(Boolean));
    const isChrome = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'HR' || tag === 'BR') return true;
      if (el.querySelector('img,video,pre,table')) return false;
      const text = norm(el.textContent);
      if (!text) return true;
      if (junk.has(text)) return true;
      if (/^h[1-6]$/i.test(tag) && junk.has(text)) return true;
      if (tag === 'DIV' || tag === 'SECTION') {
        const kids = Array.from(el.children);
        return kids.length > 0 && kids.length <= 4 && kids.every((k) => isChrome(k) || (k.tagName === 'P' && norm(k.textContent).length < 40 && (junk.has(norm(k.textContent)) || /tools for people|^by |^posted|^published/i.test(k.textContent))));
      }
      return false;
    };
    let guard = 8;
    while (guard-- > 0 && prose.firstElementChild && isChrome(prose.firstElementChild)) {
      prose.firstElementChild.remove();
    }
    // A leading <small> date line is fine, but not a leading <hr> after it.
    const firstH1 = prose.querySelector('h1');
    if (firstH1 && firstH1 === prose.firstElementChild) firstH1.remove();
    // Tiny tracking pixels / icons are noise in a reader.
    for (const img of $$('img', prose)) {
      const w = Number(img.getAttribute('width'));
      const h = Number(img.getAttribute('height'));
      if ((w && w < 40) || (h && h < 40)) img.remove();
      img.addEventListener('error', () => img.remove(), { once: true });
    }
    // Lead with the OG image when the article body has no images of its own.
    if (heroImage && !prose.querySelector('img') && prose.textContent.length > 1500) {
      const fig = document.createElement('figure');
      fig.className = 'hero';
      const img = document.createElement('img');
      img.src = heroImage;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => fig.remove(), { once: true });
      fig.appendChild(img);
      prose.prepend(fig);
    }
  },

  _unsupported(story, data) {
    const wrap = document.createElement('div');
    wrap.className = 'article';
    const type = (data.contentType || '').split('/').pop() || 'file';
    wrap.innerHTML = `
      ${this._head(story, { kicker: type.toUpperCase() })}
      <div class="article-notice">
        <p>This link is a <strong>${escapeHtml(type)}</strong>, which the reader can't render inline.</p>
      </div>
      ${this._foot(story)}`;
    return wrap;
  },

  _error(story, reason) {
    const wrap = document.createElement('div');
    wrap.className = 'article';
    const why = reason === 'timeout' ? 'The site took too long to respond.'
      : /403|401/.test(reason || '') ? 'The site refused the reader (paywall or bot wall).'
      : /404/.test(reason || '') ? 'The page is gone (404).'
      : 'Could not extract readable text.';
    wrap.innerHTML = `
      ${this._head(story)}
      <div class="article-notice">
        <p>${escapeHtml(why)}</p>
        <button class="btn ghost" data-retry>Try again</button>
      </div>
      ${this._foot(story)}`;
    wrap.querySelector('[data-retry]').addEventListener('click', () => {
      API._mem.delete(`article:${story.url}`);
      this.load(story);
    });
    return wrap;
  },

  _skeleton(story) {
    const wrap = document.createElement('div');
    wrap.className = 'article';
    wrap.innerHTML = `
      ${this._head(story)}
      <div class="skel-block">
        ${[92, 100, 86, 100, 70, 0, 96, 100, 88, 64].map((w) => w ? `<div class="skel skel-line" style="width:${w}%"></div>` : '<div class="skel-gap"></div>').join('')}
      </div>`;
    return wrap;
  },

  _progress() {
    const bar = $('#read-progress');
    if (!bar) return;
    const max = this.el.scrollHeight - this.el.clientHeight;
    const pct = max > 0 ? clamp(this.el.scrollTop / max, 0, 1) : 0;
    bar.style.transform = `scaleX(${pct})`;
  }
};
