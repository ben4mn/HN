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

    const row = createElement('div', {
      className: 'story-row px-4 py-3 border-b border-gray-100 dark:border-gray-800'
    });

    row.innerHTML = `
      <div class="flex gap-3">
        <span class="text-gray-400 dark:text-gray-600 text-sm font-mono w-8 text-right shrink-0 pt-0.5">${rank}</span>
        <div class="flex-1 min-w-0">
          <div>
            <a href="${story.url || `https://news.ycombinator.com/item?id=${story.id}`}"
               target="_blank" rel="noopener"
               class="text-sm font-medium leading-snug hover:text-hn dark:hover:text-hn transition-colors">
              ${escapeHtml(story.title)}
            </a>
            ${domain ? `<span class="text-xs text-gray-400 dark:text-gray-500 ml-1">(${escapeHtml(domain)})</span>` : ''}
          </div>
          <div class="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span>${story.score} pts</span>
            <span>${escapeHtml(story.by)}</span>
            <span>${timeAgo(story.time)}</span>
            <button class="comment-btn ml-auto flex items-center gap-1 px-2 py-1 -mr-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-target"
                    data-id="${story.id}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
              <span class="font-medium">${commentCount}</span>
            </button>
          </div>
        </div>
      </div>`;

    const commentBtn = row.querySelector('.comment-btn');
    commentBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      App.showComments(story.id);
    });

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
