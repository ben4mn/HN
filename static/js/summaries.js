// summaries.js - Article extraction via Jina Reader, extractive summaries (TextRank), caching

const Summaries = {
  CACHE_PREFIX: 'summary_',
  CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours

  _autoGenController: null,
  _autoGenRunning: false,

  getCached(storyId) {
    try {
      const raw = localStorage.getItem(this.CACHE_PREFIX + storyId);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > this.CACHE_TTL) {
        localStorage.removeItem(this.CACHE_PREFIX + storyId);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  setCache(storyId, data) {
    try {
      localStorage.setItem(this.CACHE_PREFIX + storyId, JSON.stringify({ data, ts: Date.now() }));
    } catch {
      // storage full — prune old entries and retry
      this.cleanOldCache();
      try {
        localStorage.setItem(this.CACHE_PREFIX + storyId, JSON.stringify({ data, ts: Date.now() }));
      } catch {
        // still full, give up
      }
    }
  },

  cleanOldCache() {
    const now = Date.now();
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.CACHE_PREFIX)) {
        try {
          const { ts } = JSON.parse(localStorage.getItem(key));
          if (now - ts > this.CACHE_TTL) {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  },

  // --- Auto-generation ---

  async autoGenerate(stories) {
    if (!Settings.isEnabled()) return;

    this.cancelAutoGenerate();
    this._autoGenController = new AbortController();
    this._autoGenRunning = true;

    const queue = stories.filter(s => s.url && !this.getCached(s.id));

    for (const story of queue) {
      if (this._autoGenController.signal.aborted) break;

      try {
        const result = await this._generateWithSignal(story, this._autoGenController.signal);
        this.setCache(story.id, result);
        this.injectSummary(story.id, result);
      } catch (err) {
        if (err.name === 'AbortError') break;
        // Skip this story on error (rate limit, network, etc.) and continue
      }
    }

    this._autoGenRunning = false;
  },

  cancelAutoGenerate() {
    if (this._autoGenController) {
      this._autoGenController.abort();
      this._autoGenController = null;
    }
    this._autoGenRunning = false;
  },

  injectSummary(storyId, summaryData) {
    const container = $(`.summary-container[data-story-id="${storyId}"]`);
    if (!container || container.querySelector('.summary-text')) return;

    container.innerHTML = '';
    const el = this.renderSummary(summaryData.short);
    el.style.opacity = '0';
    container.appendChild(el);
    // Trigger fade-in
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.3s ease';
      el.style.opacity = '1';
    });
  },

  async _generateWithSignal(story, signal) {
    let articleText = await this._extractArticleWithSignal(story.url, signal);

    if (!articleText || articleText.length < 200) {
      articleText = await this._buildCommentFallback(story);
    }

    if (articleText.length > 4000) {
      articleText = articleText.slice(0, 4000);
    }

    return ExtractiveSummarizer.summarize(articleText, story.title);
  },

  async _extractArticleWithSignal(url, signal) {
    if (!url) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      // Abort if parent signal fires
      const onAbort = () => controller.abort();
      signal.addEventListener('abort', onAbort);
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: { 'Accept': 'text/plain' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  },

  async generate(story) {
    // Check cache first
    const cached = this.getCached(story.id);
    if (cached) return cached;

    const result = await this._generateWithSignal(story, (new AbortController()).signal);
    this.setCache(story.id, result);
    return result;
  },

  async _buildCommentFallback(story) {
    let text = `Title: ${story.title}\n`;
    if (story.text) text += `Post text: ${story.text}\n`;
    try {
      const full = await HNApi.getComments(story.id, 0, 1);
      if (full && full._children) {
        const topComments = full._children.slice(0, 5);
        topComments.forEach((c, i) => {
          if (c.text) {
            const plain = c.text.replace(/<[^>]*>/g, '');
            text += `\nComment ${i + 1} by ${c.by}: ${plain}`;
          }
        });
      }
    } catch {
      // just use title
    }
    return text;
  },

  renderSummary(text) {
    const el = createElement('div', {
      className: 'summary-text text-xs text-gray-600 dark:text-gray-400 mt-1.5 leading-relaxed summary-fade'
    });
    el.textContent = text;
    return el;
  },

  renderSkeleton() {
    return createElement('div', {
      className: 'mt-1.5 space-y-1',
      innerHTML: `
        <div class="skeleton bg-gray-200 dark:bg-gray-700 h-3 w-full"></div>
        <div class="skeleton bg-gray-200 dark:bg-gray-700 h-3 w-3/4"></div>`
    });
  }
};
