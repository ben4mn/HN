// Live update: fetch current scores, comment counts, and ranking from HN Firebase API
(function() {
    var HN_API_BASE = 'https://hacker-news.firebaseio.com/v0/';
    var CONCURRENCY_LIMIT = 15;

    function fetchJSON(url) {
        return fetch(url).then(function(r) { return r.json(); });
    }

    function fetchAllWithLimit(urls, limit) {
        var results = new Array(urls.length);
        var index = 0;
        var active = 0;

        return new Promise(function(resolve) {
            function next() {
                if (index >= urls.length && active === 0) {
                    resolve(results);
                    return;
                }
                while (active < limit && index < urls.length) {
                    (function(i) {
                        active++;
                        fetchJSON(urls[i]).then(function(data) {
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
            if (urls.length === 0) resolve(results);
            else next();
        });
    }

    function run() {
        var articles = document.querySelectorAll('article[data-hn-id]');
        if (articles.length === 0) return;

        // Build map of hn-id -> article element
        var articleMap = {};
        articles.forEach(function(el) {
            var id = el.getAttribute('data-hn-id');
            if (id) articleMap[id] = el;
        });

        var articleIds = Object.keys(articleMap);

        // Fetch top stories ranking
        fetchJSON(HN_API_BASE + 'topstories.json').then(function(topIds) {
            if (!topIds || !Array.isArray(topIds)) return;

            // Build rank lookup: id -> rank position (0-based)
            var rankMap = {};
            topIds.forEach(function(id, idx) {
                rankMap[String(id)] = idx;
            });

            // Fetch individual items for articles on the page
            var urls = articleIds.map(function(id) {
                return HN_API_BASE + 'item/' + id + '.json';
            });

            return fetchAllWithLimit(urls, CONCURRENCY_LIMIT).then(function(items) {
                // Update DOM for each article
                items.forEach(function(item, idx) {
                    if (!item) return;
                    var id = articleIds[idx];
                    var el = articleMap[id];
                    if (!el) return;

                    // Update score
                    if (item.score != null) {
                        var scoreEl = el.querySelector('.score');
                        if (scoreEl) scoreEl.textContent = item.score;
                    }

                    // Update comment count
                    if (item.descendants != null) {
                        var commentEl = el.querySelector('.comment-count');
                        if (commentEl) commentEl.textContent = item.descendants;
                    }

                    // Store live rank for sorting
                    if (rankMap[id] != null) {
                        el.setAttribute('data-live-rank', rankMap[id]);
                    } else {
                        // Not in top stories anymore — push to end
                        el.setAttribute('data-live-rank', 99999);
                    }
                });

                // Re-order articles in the DOM based on live HN ranking
                reorderArticles();

                // Show live indicator
                showLiveIndicator();
            });
        }).catch(function() {
            // Silently fail — page stays as-is from static build
        });
    }

    function reorderArticles() {
        var articles = Array.from(document.querySelectorAll('article[data-hn-id]'));
        if (articles.length === 0) return;

        // Sort by live rank (articles without live-rank keep original position)
        articles.sort(function(a, b) {
            var rankA = parseInt(a.getAttribute('data-live-rank')) || 0;
            var rankB = parseInt(b.getAttribute('data-live-rank')) || 0;
            return rankA - rankB;
        });

        // Re-insert into parent in new order
        var parent = articles[0].parentNode;
        articles.forEach(function(article) {
            parent.appendChild(article);
        });
    }

    function showLiveIndicator() {
        var indicator = document.getElementById('live-indicator');
        if (indicator) {
            indicator.classList.remove('hidden');
            indicator.classList.add('inline-flex');
        }
    }

    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
