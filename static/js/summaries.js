// summaries.js - Article extraction via Jina Reader, OpenAI summaries, caching

const Summaries = {
  CACHE_PREFIX: 'summary_',
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

  async generate(story) {
    // Check cache first
    const cached = this.getCached(story.id);
    if (cached) return cached;

    const apiKey = Settings.getApiKey();
    if (!apiKey) throw new Error('No API key configured');

    // Try to get article text
    let articleText = await this._extractArticle(story.url);

    // Fallback: use title + top comments
    if (!articleText || articleText.length < 200) {
      articleText = await this._buildCommentFallback(story);
    }

    // Truncate to 4000 chars for the API
    if (articleText.length > 4000) {
      articleText = articleText.slice(0, 4000);
    }

    const result = await this._callOpenAI(apiKey, story.title, articleText);
    this.setCache(story.id, result);
    return result;
  },

  async _extractArticle(url) {
    if (!url) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: { 'Accept': 'text/plain' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
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

  async _callOpenAI(apiKey, title, content) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You summarize articles. Return JSON with two fields: "short" (1-2 sentences, max 50 words) and "long" (2-3 sentences, max 100 words). Be factual and concise.'
          },
          {
            role: 'user',
            content: `Title: ${title}\n\nContent:\n${content}`
          }
        ]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI error ${res.status}`);
    }

    const data = await res.json();
    const text = data.choices[0].message.content;
    return JSON.parse(text);
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
