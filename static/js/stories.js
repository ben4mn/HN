// stories.js - Story list rendering, pagination, skeletons

const Stories = {
  renderSkeleton(count = 10) {
    const container = $('#story-list');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      container.appendChild(createElement('div', {
        className: 'px-4 py-3 border-b border-gray-100 dark:border-gray-800',
        innerHTML: `
          <div class="flex gap-3">
            <div class="skeleton bg-gray-200 dark:bg-gray-700 w-8 h-5 mt-0.5 shrink-0"></div>
            <div class="flex-1 space-y-2">
              <div class="skeleton bg-gray-200 dark:bg-gray-700 h-4 w-full"></div>
              <div class="skeleton bg-gray-200 dark:bg-gray-700 h-4 w-3/4"></div>
              <div class="skeleton bg-gray-200 dark:bg-gray-700 h-3 w-1/2"></div>
            </div>
          </div>`
      }));
    }
  },

  renderStory(story, rank) {
    const domain = extractDomain(story.url);
    const commentCount = story.descendants || 0;
    const hasUrl = !!story.url;
    const showSummary = typeof Settings !== 'undefined' && Settings.isEnabled();
    const cached = typeof Summaries !== 'undefined' ? Summaries.getCached(story.id) : null;

    const isRead = App.isRead(story.id);
    const row = createElement('div', {
      className: `story-row px-4 py-3 border-b border-gray-100 dark:border-gray-800${isRead ? ' story-read' : ''}`
    });

    row.innerHTML = `
      <div class="flex gap-3">
        <span class="text-gray-400 dark:text-gray-600 text-sm font-mono w-8 text-right shrink-0 pt-0.5">${rank}</span>
        <div class="flex-1 min-w-0">
          <div>
            <a href="${hasUrl ? `#/read/${story.id}` : `https://news.ycombinator.com/item?id=${story.id}`}"
               ${hasUrl ? '' : 'target="_blank" rel="noopener"'}
               class="story-title-link text-sm font-medium leading-snug hover:text-hn dark:hover:text-hn transition-colors">
              ${escapeHtml(story.title)}
            </a>
            ${domain ? `
            <span class="text-xs text-gray-400 dark:text-gray-500 ml-1">(${escapeHtml(domain)}</span><a href="${escapeHtml(story.url)}" target="_blank" rel="noopener" class="external-link-icon inline-flex items-center ml-0.5 text-gray-400 dark:text-gray-500 hover:text-hn dark:hover:text-hn transition-colors align-middle" aria-label="Open original"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a><span class="text-xs text-gray-400 dark:text-gray-500">)</span>` : ''}
          </div>
          <div class="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span>${story.score} pts</span>
            <span>${escapeHtml(story.by)}</span>
            <span>${timeAgo(story.time)}</span>
            ${hasUrl ? `
            <button class="read-btn flex items-center gap-1 px-2 py-0.5 rounded text-hn hover:bg-orange-50 dark:hover:bg-gray-800 transition-colors"
                    data-story-id="${story.id}">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
              <span class="font-medium">Read</span>
            </button>` : ''}
            <button class="summarize-btn ${hasUrl ? '' : 'ml-auto'} flex items-center gap-1 px-2 py-0.5 rounded text-hn hover:bg-orange-50 dark:hover:bg-gray-800 transition-colors ${showSummary ? '' : 'hidden'}"
                    data-story-id="${story.id}">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
              <span class="font-medium">TL;DR</span>
            </button>
            <button class="comment-btn ${!hasUrl && !showSummary ? 'ml-auto' : ''} flex items-center gap-1 px-2 py-1 -mr-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-target"
                    data-id="${story.id}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
              <span class="font-medium">${commentCount}</span>
            </button>
          </div>
          <div class="summary-container" data-story-id="${story.id}"></div>
        </div>
        ${hasUrl ? `<div class="thumbnail-container shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center self-center" data-url="${escapeHtml(story.url)}"></div>` : ''}
      </div>`;

    // Show cached summary
    if (cached) {
      const container = row.querySelector('.summary-container');
      container.appendChild(Summaries.renderSummary(cached.short));
      const btn = row.querySelector('.summarize-btn');
      if (btn) btn.classList.add('hidden');
    }

    // Title link handler for reader navigation (hash-based links handle themselves)
    const titleLink = row.querySelector('.story-title-link');
    if (hasUrl && titleLink) {
      titleLink.addEventListener('click', (e) => {
        e.preventDefault();
        App.showReader(story.id);
      });
    }

    // Read button handler
    const readBtn = row.querySelector('.read-btn');
    if (readBtn) {
      readBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        App.showReader(story.id);
      });
    }

    // Summarize button handler
    const sumBtn = row.querySelector('.summarize-btn');
    if (sumBtn) {
      sumBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const container = row.querySelector('.summary-container');
        sumBtn.classList.add('hidden');
        container.innerHTML = '';
        container.appendChild(Summaries.renderSkeleton());
        try {
          const result = await Summaries.generate(story);
          container.innerHTML = '';
          container.appendChild(Summaries.renderSummary(result.short));
        } catch (err) {
          container.innerHTML = `<div class="text-xs text-red-500 mt-1">${escapeHtml(err.message)}</div>`;
          sumBtn.classList.remove('hidden');
        }
      });
    }

    // Comment button handler
    const commentBtn = row.querySelector('.comment-btn');
    commentBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      App.showComments(story.id);
    });

    // Observe thumbnail for lazy loading
    const thumb = row.querySelector('.thumbnail-container');
    if (thumb && typeof Thumbnails !== 'undefined') {
      Thumbnails.observe(thumb);
    }

    return row;
  },

  renderStories(stories, startRank = 1) {
    const container = $('#story-list');
    stories.forEach((story, i) => {
      container.appendChild(this.renderStory(story, startRank + i));
    });
  },

  clear() {
    $('#story-list').innerHTML = '';
  },

  showLoadMore(show) {
    const wrap = $('#load-more-wrap');
    wrap.classList.toggle('hidden', !show);
  },

  renderEmpty() {
    $('#story-list').innerHTML = `
      <div class="p-8 text-center text-gray-500 dark:text-gray-400">
        <p class="text-sm">No stories found</p>
      </div>`;
  }
};
