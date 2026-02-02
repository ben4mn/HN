// AlienBlue-style comment system using HN Firebase API
(function() {
    var HN_API = 'https://hacker-news.firebaseio.com/v0/item/';
    var CONCURRENCY_LIMIT = 15;
    var MAX_AUTO_DEPTH = 3;
    var THREAD_COLORS = ['comment-thread-border-0', 'comment-thread-border-1', 'comment-thread-border-2',
                         'comment-thread-border-3', 'comment-thread-border-4', 'comment-thread-border-5'];
    var commentCache = {};
    var currentStoryAuthor = '';

    // Fetch a single HN item
    function fetchItem(id) {
        return fetch(HN_API + id + '.json').then(function(r) { return r.json(); });
    }

    // Fetch with concurrency limit
    function fetchAllWithLimit(ids, limit) {
        var results = new Array(ids.length);
        var index = 0;
        var active = 0;

        return new Promise(function(resolve) {
            function next() {
                if (index >= ids.length && active === 0) {
                    resolve(results);
                    return;
                }
                while (active < limit && index < ids.length) {
                    (function(i) {
                        active++;
                        fetchItem(ids[i]).then(function(data) {
                            results[i] = data;
                            active--;
                            next();
                        }).catch(function() {
                            results[i] = null;
                            active--;
                            next();
                        });
                    })(index);
                    index++;
                }
            }
            if (ids.length === 0) resolve(results);
            else next();
        });
    }

    // Render loading skeleton
    function renderSkeleton() {
        var html = '';
        for (var i = 0; i < 5; i++) {
            html += '<div class="mb-4 skeleton-pulse">' +
                '<div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>' +
                '<div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-1"></div>' +
                '<div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>' +
                '</div>';
        }
        return html;
    }

    // Render a single comment
    function renderComment(comment, depth, op) {
        if (!comment || comment.deleted || comment.dead) {
            return '';
        }

        var colorClass = THREAD_COLORS[depth % THREAD_COLORS.length];
        var isOp = op && comment.by === op;
        var time = comment.time ? humanizeDuration(Date.now() - comment.time * 1000, { largest: 1, round: true }) + ' ago' : '';

        var html = '<div class="comment-node pl-3 border-l-2 ' + colorClass + ' mb-3 ml-' + Math.min(depth * 2, 8) + '" data-id="' + comment.id + '">';

        // Header
        html += '<div class="flex items-center gap-2 mb-1 text-xs text-gray-500 dark:text-gray-400">';
        html += '<button class="collapse-toggle min-h-[44px] min-w-[44px] flex items-center justify-center -ml-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Collapse thread">';
        html += '<i class="fa-solid fa-minus text-[10px]"></i>';
        html += '</button>';
        html += '<a href="https://news.ycombinator.com/user?id=' + encodeURIComponent(comment.by || '') + '" target="_blank" class="font-semibold hover:text-hn">' + escapeHtml(comment.by || '[deleted]') + '</a>';
        if (isOp) {
            html += '<span class="bg-hn text-white text-[10px] font-bold px-1.5 py-0.5 rounded">OP</span>';
        }
        html += '<span>' + time + '</span>';
        html += '</div>';

        // Body
        html += '<div class="comment-body text-sm leading-relaxed dark:text-gray-300 mb-1 break-words">';
        html += comment.text || '<em class="text-gray-400">[deleted]</em>';
        html += '</div>';

        // Children
        if (comment.kids && comment.kids.length > 0) {
            html += '<div class="comment-children">';
            if (depth < MAX_AUTO_DEPTH) {
                html += '<div class="children-placeholder" data-kids="' + comment.kids.join(',') + '" data-depth="' + (depth + 1) + '" data-op="' + escapeHtml(op || '') + '">';
                html += '<div class="skeleton-pulse"><div class="h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/2 my-2"></div></div>';
                html += '</div>';
            } else {
                html += '<button class="load-more-replies text-xs text-hn hover:underline min-h-[44px] flex items-center" data-kids="' + comment.kids.join(',') + '" data-depth="' + (depth + 1) + '" data-op="' + escapeHtml(op || '') + '">';
                html += '<i class="fa-solid fa-chevron-down mr-1"></i> Load ' + comment.kids.length + ' repl' + (comment.kids.length === 1 ? 'y' : 'ies');
                html += '</button>';
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Load and render children for a placeholder
    function loadChildren(container, kids, depth, op) {
        return fetchAllWithLimit(kids, CONCURRENCY_LIMIT).then(function(comments) {
            var html = '';
            comments.forEach(function(c) {
                if (c) html += renderComment(c, depth, op);
            });
            container.innerHTML = html;

            // Recursively load auto-depth children
            var placeholders = container.querySelectorAll('.children-placeholder');
            var promises = [];
            placeholders.forEach(function(ph) {
                var childKids = ph.dataset.kids.split(',').filter(Boolean);
                var childDepth = parseInt(ph.dataset.depth);
                var childOp = ph.dataset.op;
                promises.push(loadChildren(ph, childKids, childDepth, childOp));
            });
            return Promise.all(promises);
        });
    }

    // Open comment panel for a story
    function openCommentPanel(hnId, commentUrl, author) {
        currentStoryAuthor = author || '';
        var panel = document.getElementById('comment-panel');
        var overlay = document.getElementById('comment-overlay');
        var body = document.getElementById('comment-panel-body');
        var hnLink = document.getElementById('comment-hn-link');
        var title = document.getElementById('comment-panel-title');

        if (hnLink) hnLink.href = commentUrl || ('https://news.ycombinator.com/item?id=' + hnId);
        if (title) title.textContent = 'Comments';
        body.innerHTML = renderSkeleton();

        // Show panel
        overlay.classList.remove('hidden');
        requestAnimationFrame(function() {
            overlay.classList.add('open');
            panel.classList.add('open');
        });
        document.body.style.overflow = 'hidden';

        // Check session cache
        var cacheKey = 'hn_comments_' + hnId;
        var cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            try {
                var data = JSON.parse(cached);
                renderStoryComments(data, body);
                return;
            } catch(e) { /* ignore, re-fetch */ }
        }

        // Fetch story
        fetchItem(hnId).then(function(story) {
            if (!story) {
                body.innerHTML = '<p class="text-gray-500 text-center py-8">Failed to load comments.</p>';
                return;
            }
            if (title) title.textContent = (story.descendants || 0) + ' Comments';
            if (story.by) currentStoryAuthor = story.by;

            // Cache
            try { sessionStorage.setItem(cacheKey, JSON.stringify(story)); } catch(e) {}

            renderStoryComments(story, body);
        }).catch(function() {
            body.innerHTML = '<p class="text-gray-500 text-center py-8">Failed to load comments.</p>';
        });
    }

    function renderStoryComments(story, body) {
        if (!story.kids || story.kids.length === 0) {
            body.innerHTML = '<p class="text-gray-500 text-center py-8">No comments yet.</p>';
            return;
        }

        var op = story.by || currentStoryAuthor;
        body.innerHTML = '<div class="comments-root"></div>';
        var root = body.querySelector('.comments-root');

        // Placeholder for loading
        root.innerHTML = '<div class="children-placeholder" data-kids="' + story.kids.join(',') + '" data-depth="0" data-op="' + escapeHtml(op) + '">' + renderSkeleton() + '</div>';

        var ph = root.querySelector('.children-placeholder');
        loadChildren(ph, story.kids, 0, op);
    }

    // Close comment panel
    window.closeCommentPanel = function() {
        var panel = document.getElementById('comment-panel');
        var overlay = document.getElementById('comment-overlay');
        panel.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        setTimeout(function() {
            overlay.classList.add('hidden');
        }, 300);
    };

    // Event delegation for comment interactions
    document.addEventListener('click', function(e) {
        // Comment trigger buttons
        var trigger = e.target.closest('.comment-trigger');
        if (trigger) {
            e.preventDefault();
            var hnId = trigger.dataset.hnId;
            var commentUrl = trigger.dataset.commentUrl;
            var author = trigger.dataset.author;
            if (hnId) openCommentPanel(hnId, commentUrl, author);
            return;
        }

        // Collapse toggle
        var collapseBtn = e.target.closest('.collapse-toggle');
        if (collapseBtn) {
            var commentNode = collapseBtn.closest('.comment-node');
            if (!commentNode) return;
            var bodyEl = commentNode.querySelector(':scope > .comment-body');
            var childrenEl = commentNode.querySelector(':scope > .comment-children');
            var icon = collapseBtn.querySelector('i');
            if (bodyEl) bodyEl.classList.toggle('hidden');
            if (childrenEl) childrenEl.classList.toggle('hidden');
            if (icon) {
                icon.classList.toggle('fa-minus');
                icon.classList.toggle('fa-plus');
            }
            return;
        }

        // Load more replies
        var loadMore = e.target.closest('.load-more-replies');
        if (loadMore) {
            var kids = loadMore.dataset.kids.split(',').filter(Boolean);
            var depth = parseInt(loadMore.dataset.depth);
            var op = loadMore.dataset.op;
            var container = loadMore.parentNode;
            loadMore.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading...';
            loadMore.disabled = true;
            loadChildren(container, kids, depth, op);
            return;
        }
    });

    // Swipe-to-collapse on touch devices
    var touchStartX = 0;
    var touchStartY = 0;
    var swipeTarget = null;

    document.addEventListener('touchstart', function(e) {
        var node = e.target.closest('.comment-node');
        if (!node || !document.getElementById('comment-panel').classList.contains('open')) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        swipeTarget = node;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (!swipeTarget) return;
        var endX = e.changedTouches[0].clientX;
        var endY = e.changedTouches[0].clientY;
        var diffX = endX - touchStartX;
        var diffY = Math.abs(endY - touchStartY);

        // Only count horizontal swipes
        if (Math.abs(diffX) > 50 && diffY < 30) {
            var bodyEl = swipeTarget.querySelector(':scope > .comment-body');
            var childrenEl = swipeTarget.querySelector(':scope > .comment-children');
            var icon = swipeTarget.querySelector(':scope > div .collapse-toggle i');

            if (diffX < 0) {
                // Swipe left: collapse
                if (bodyEl) bodyEl.classList.add('hidden');
                if (childrenEl) childrenEl.classList.add('hidden');
                if (icon) { icon.classList.remove('fa-minus'); icon.classList.add('fa-plus'); }
            } else {
                // Swipe right: expand
                if (bodyEl) bodyEl.classList.remove('hidden');
                if (childrenEl) childrenEl.classList.remove('hidden');
                if (icon) { icon.classList.remove('fa-plus'); icon.classList.add('fa-minus'); }
            }
        }
        swipeTarget = null;
    }, { passive: true });

    // Close panel on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeCommentPanel();
    });
})();
