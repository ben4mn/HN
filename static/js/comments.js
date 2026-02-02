// comments.js - Threaded comments, collapse/expand, swipe gestures

const THREAD_COLORS = ['thread-0', 'thread-1', 'thread-2', 'thread-3', 'thread-4', 'thread-5'];

const Comments = {
  async load(itemId) {
    const content = $('#comment-content');
    content.innerHTML = this.renderSkeleton();

    try {
      const story = await HNApi.getComments(itemId, 0, 3);
      if (!story) {
        content.innerHTML = '<div class="p-8 text-center text-gray-500">Story not found</div>';
        return;
      }
      content.innerHTML = '';
      content.appendChild(this.renderHeader(story));

      if (story._children && story._children.length > 0) {
        const tree = createElement('div', { className: 'comment-tree' });
        for (const child of story._children) {
          tree.appendChild(this.renderComment(child, 0));
        }
        content.appendChild(tree);
      } else if (!story.kids || story.kids.length === 0) {
        content.appendChild(createElement('div', {
          className: 'p-8 text-center text-gray-500 dark:text-gray-400 text-sm',
          textContent: 'No comments yet'
        }));
      }
    } catch (err) {
      content.innerHTML = `
        <div class="p-8 text-center">
          <p class="text-gray-500 dark:text-gray-400 text-sm mb-3">Failed to load comments</p>
          <button onclick="Comments.load(${itemId})" class="text-sm text-hn font-medium">Retry</button>
        </div>`;
    }
  },

  renderHeader(story) {
    const domain = extractDomain(story.url);
    const showSummary = typeof Settings !== 'undefined' && Settings.isEnabled();
    const cached = typeof Summaries !== 'undefined' ? Summaries.getCached(story.id) : null;

    const header = createElement('div', {
      className: 'px-4 py-3 border-b border-gray-200 dark:border-gray-800'
    });
    header.innerHTML = `
      <a href="${story.url || `https://news.ycombinator.com/item?id=${story.id}`}"
         target="_blank" rel="noopener"
         class="text-base font-semibold leading-snug hover:text-hn transition-colors">
        ${escapeHtml(story.title)}
      </a>
      ${domain ? `<span class="text-xs text-gray-400 dark:text-gray-500 ml-1">(${escapeHtml(domain)})</span>` : ''}
      <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        <span>${story.score} points</span>
        <span>by ${escapeHtml(story.by)}</span>
        <span>${timeAgo(story.time)}</span>
        <span>${pluralize(story.descendants || 0, 'comment')}</span>
      </div>
      ${story.text ? `<div class="comment-text mt-3 text-sm text-gray-700 dark:text-gray-300">${story.text}</div>` : ''}
      <div class="comment-summary-area mt-2 flex flex-wrap items-center gap-2"></div>
    `;

    const summaryArea = header.querySelector('.comment-summary-area');

    // Read article button (for stories with URLs)
    if (story.url) {
      const readBtn = createElement('button', {
        className: 'flex items-center gap-1.5 px-3 py-1.5 mt-1 mr-2 rounded-lg text-xs font-medium text-hn bg-orange-50 dark:bg-gray-800 hover:bg-orange-100 dark:hover:bg-gray-700 transition-colors',
        innerHTML: `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
          Read article`
      });
      readBtn.addEventListener('click', () => {
        App.showReader(story.id);
      });
      summaryArea.appendChild(readBtn);
    }

    if (cached) {
      summaryArea.appendChild(Summaries.renderSummary(cached.long));
    } else if (showSummary) {
      const btn = createElement('button', {
        className: 'summarize-btn flex items-center gap-1.5 px-3 py-1.5 mt-1 rounded-lg text-xs font-medium text-hn bg-orange-50 dark:bg-gray-800 hover:bg-orange-100 dark:hover:bg-gray-700 transition-colors',
        innerHTML: `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
          Summarize article`
      });
      btn.addEventListener('click', async () => {
        btn.remove();
        summaryArea.appendChild(Summaries.renderSkeleton());
        try {
          const result = await Summaries.generate(story);
          summaryArea.innerHTML = '';
          summaryArea.appendChild(Summaries.renderSummary(result.long));
        } catch (err) {
          summaryArea.innerHTML = `<div class="text-xs text-red-500 mt-1">${escapeHtml(err.message)}</div>`;
        }
      });
      summaryArea.appendChild(btn);
    }

    // Store story reference for summary generation
    header._story = story;
    return header;
  },

  renderComment(comment, depth) {
    if (!comment || comment.dead || comment.deleted) return document.createDocumentFragment();

    const colorClass = THREAD_COLORS[depth % THREAD_COLORS.length];
    const indent = Math.min(depth, 6);

    const wrapper = createElement('div', {
      className: 'comment-wrapper relative',
      'data-id': comment.id
    });

    const inner = createElement('div', {
      className: `border-l-2 ${colorClass}`,
      style: `margin-left: ${indent * 12}px`
    });

    // Comment header + body
    const headerDiv = createElement('div', {
      className: 'comment-header flex items-center gap-2 px-3 pt-2 pb-1 cursor-pointer touch-target select-none'
    });
    headerDiv.innerHTML = `
      <span class="text-xs font-medium text-hn">${escapeHtml(comment.by || '[deleted]')}</span>
      <span class="text-xs text-gray-400 dark:text-gray-500">${timeAgo(comment.time)}</span>
      <span class="collapse-indicator text-xs text-gray-400 ml-auto">[&ndash;]</span>
    `;

    const bodyDiv = createElement('div', {
      className: 'comment-body px-3 pb-2'
    });
    bodyDiv.innerHTML = `<div class="comment-text text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${comment.text || '<em class="text-gray-400">[deleted]</em>'}</div>`;

    // Children container
    const childrenDiv = createElement('div', { className: 'comment-children' });

    // Render loaded children
    if (comment._children && comment._children.length > 0) {
      for (const child of comment._children) {
        childrenDiv.appendChild(this.renderComment(child, depth + 1));
      }
    }

    // "Load N replies" button for unloaded deep children
    if (comment.kids && comment.kids.length > 0 && (!comment._children || comment._children.length === 0)) {
      const loadBtn = createElement('button', {
        className: 'text-xs text-hn font-medium px-3 py-2 hover:underline touch-target',
        style: `margin-left: ${(indent + 1) * 12}px`,
        textContent: `Load ${pluralize(comment.kids.length, 'reply')}`,
        onClick: async () => {
          loadBtn.textContent = 'Loading...';
          loadBtn.disabled = true;
          try {
            const full = await HNApi.getComments(comment.id, 0, 3);
            if (full._children) {
              loadBtn.remove();
              for (const child of full._children) {
                childrenDiv.appendChild(this.renderComment(child, depth + 1));
              }
            }
          } catch {
            loadBtn.textContent = `Load ${pluralize(comment.kids.length, 'reply')} (retry)`;
            loadBtn.disabled = false;
          }
        }
      });
      childrenDiv.appendChild(loadBtn);
    }

    // Collapse toggle
    let collapsed = false;
    headerDiv.addEventListener('click', () => {
      collapsed = !collapsed;
      bodyDiv.classList.toggle('collapsed', collapsed);
      childrenDiv.classList.toggle('hidden', collapsed);
      headerDiv.querySelector('.collapse-indicator').textContent = collapsed ? `[+${this.countChildren(comment)}]` : '[–]';
    });

    inner.appendChild(headerDiv);
    inner.appendChild(bodyDiv);
    inner.appendChild(childrenDiv);
    wrapper.appendChild(inner);

    // Swipe gestures
    this.addSwipeGesture(wrapper, headerDiv, () => {
      if (!collapsed) headerDiv.click(); // swipe left = collapse
    }, () => {
      if (collapsed) headerDiv.click(); // swipe right = expand
    });

    return wrapper;
  },

  countChildren(comment) {
    if (!comment._children) return comment.kids ? comment.kids.length : 0;
    let count = comment._children.length;
    for (const child of comment._children) {
      count += this.countChildren(child);
    }
    return count;
  },

  addSwipeGesture(el, header, onSwipeLeft, onSwipeRight) {
    let startX = 0;
    let startY = 0;
    let swiping = false;

    el.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      swiping = false;
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        swiping = true;
      }
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      if (!swiping) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (dx < -50) onSwipeLeft();
      else if (dx > 50) onSwipeRight();
    }, { passive: true });
  },

  renderSkeleton() {
    let html = `
      <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-800 space-y-2">
        <div class="skeleton bg-gray-200 dark:bg-gray-700 h-5 w-full"></div>
        <div class="skeleton bg-gray-200 dark:bg-gray-700 h-5 w-3/4"></div>
        <div class="skeleton bg-gray-200 dark:bg-gray-700 h-3 w-1/2 mt-2"></div>
      </div>`;
    for (let i = 0; i < 5; i++) {
      const ml = (i % 3) * 12;
      html += `
        <div class="px-3 py-2" style="margin-left:${ml}px">
          <div class="border-l-2 border-gray-200 dark:border-gray-700 pl-3 space-y-2">
            <div class="skeleton bg-gray-200 dark:bg-gray-700 h-3 w-24"></div>
            <div class="skeleton bg-gray-200 dark:bg-gray-700 h-3 w-full"></div>
            <div class="skeleton bg-gray-200 dark:bg-gray-700 h-3 w-5/6"></div>
          </div>
        </div>`;
    }
    return html;
  }
};
