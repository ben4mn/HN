// reader.js - In-app article reader (Alien Blue "Optimal" style)

const Reader = {
  CACHE_PREFIX: 'reader_',
  CACHE_TTL: 30 * 60 * 1000, // 30 minutes

  getCached(storyId) {
    try {
      const raw = sessionStorage.getItem(this.CACHE_PREFIX + storyId);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > this.CACHE_TTL) {
        sessionStorage.removeItem(this.CACHE_PREFIX + storyId);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  setCache(storyId, data) {
    try {
      sessionStorage.setItem(this.CACHE_PREFIX + storyId, JSON.stringify({ data, ts: Date.now() }));
    } catch {
      // storage full
    }
  },

  async fetchArticle(url) {
    if (!url) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: { 'Accept': 'text/markdown' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const text = await res.text();
      return this._stripJinaPreamble(text);
    } catch {
      return null;
    }
  },

  _stripJinaPreamble(text) {
    // Jina prepends metadata like "Title: ...\nURL Source: ...\nMarkdown Content:\n"
    const marker = 'Markdown Content:';
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      return text.slice(idx + marker.length).trim();
    }
    return text;
  },

  estimateReadingTime(text) {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.round(words / 230));
  },

  renderMarkdown(markdown) {
    try {
      if (typeof marked !== 'undefined') {
        return marked.parse(markdown);
      }
    } catch {
      // fall through
    }
    return `<pre style="white-space:pre-wrap">${escapeHtml(markdown)}</pre>`;
  },

  async load(storyId) {
    const content = $('#reader-content');
    content.innerHTML = '';
    content.appendChild(this.renderSkeleton());

    try {
      // Fetch story metadata
      const story = await HNApi.getItem(storyId);
      if (!story) {
        content.innerHTML = '';
        content.appendChild(this.renderError('Story not found'));
        return;
      }

      if (!story.url) {
        // Text-only post (Ask HN, etc.) — show the text directly
        content.innerHTML = '';
        content.appendChild(this.renderArticle(story, story.text || '<em>No content</em>', 0, true));
        return;
      }

      // Check cache
      const cached = this.getCached(storyId);
      if (cached) {
        const readingTime = this.estimateReadingTime(cached);
        content.innerHTML = '';
        content.appendChild(this.renderArticle(story, cached, readingTime, false));
        return;
      }

      // Fetch article
      const markdown = await this.fetchArticle(story.url);
      if (!markdown || markdown.length < 100) {
        content.innerHTML = '';
        content.appendChild(this.renderError('Could not extract article content', story.url));
        return;
      }

      this.setCache(storyId, markdown);
      const readingTime = this.estimateReadingTime(markdown);
      content.innerHTML = '';
      content.appendChild(this.renderArticle(story, markdown, readingTime, false));
    } catch (err) {
      content.innerHTML = '';
      content.appendChild(this.renderError('Failed to load article'));
    }
  },

  renderArticle(story, markdown, readingTime, isHtml) {
    const domain = extractDomain(story.url);
    const el = createElement('div', { className: 'px-4 py-4' });

    const bodyHtml = isHtml ? markdown : this.renderMarkdown(markdown);
    const readingTimeStr = readingTime ? `${readingTime} min read` : '';

    el.innerHTML = `
      <header class="mb-4">
        <h1 class="text-xl font-bold leading-tight mb-2">${escapeHtml(story.title)}</h1>
        <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          ${domain ? `<span class="text-gray-400 dark:text-gray-500">${escapeHtml(domain)}</span>` : ''}
          <span>${story.score} pts</span>
          <span>by ${escapeHtml(story.by)}</span>
          <span>${timeAgo(story.time)}</span>
          ${readingTimeStr ? `<span class="text-hn font-medium">${readingTimeStr}</span>` : ''}
        </div>
      </header>
      <div class="flex items-center gap-2 mb-4">
        <button class="reader-comments-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                data-id="${story.id}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
          ${pluralize(story.descendants || 0, 'comment')}
        </button>
        ${story.url ? `
        <a href="${escapeHtml(story.url)}" target="_blank" rel="noopener"
           class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Open Original
        </a>` : ''}
      </div>
      <article class="reader-text">${bodyHtml}</article>
      <div class="flex items-center gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-800">
        <button class="reader-comments-btn-bottom flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                data-id="${story.id}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
          View Comments
        </button>
        ${story.url ? `
        <a href="${escapeHtml(story.url)}" target="_blank" rel="noopener"
           class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Open Original
        </a>` : ''}
      </div>`;

    // Bind comment buttons
    el.querySelector('.reader-comments-btn').addEventListener('click', () => {
      App.showCommentsFromReader(story.id);
    });
    const bottomBtn = el.querySelector('.reader-comments-btn-bottom');
    if (bottomBtn) {
      bottomBtn.addEventListener('click', () => {
        App.showCommentsFromReader(story.id);
      });
    }

    return el;
  },

  renderSkeleton() {
    return createElement('div', {
      className: 'px-4 py-4 space-y-4',
      innerHTML: `
        <div class="space-y-2">
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-6 w-full"></div>
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-6 w-3/4"></div>
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-4 w-1/2 mt-2"></div>
        </div>
        <div class="flex gap-2">
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-8 w-24 rounded-lg"></div>
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-8 w-28 rounded-lg"></div>
        </div>
        <div class="space-y-3">
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-4 w-full"></div>
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-4 w-full"></div>
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-4 w-5/6"></div>
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-4 w-full"></div>
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-4 w-4/5"></div>
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-4 w-full"></div>
          <div class="skeleton bg-gray-200 dark:bg-gray-700 h-4 w-3/4"></div>
        </div>`
    });
  },

  renderError(message, url) {
    const el = createElement('div', {
      className: 'p-8 text-center'
    });
    el.innerHTML = `
      <svg class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
      </svg>
      <p class="text-gray-500 dark:text-gray-400 text-sm mb-3">${escapeHtml(message)}</p>
      ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-sm text-hn font-medium hover:underline">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
        </svg>
        Open in Browser
      </a>` : ''}`;
    return el;
  }
};
