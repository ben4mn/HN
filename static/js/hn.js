// Dropdown management
let activeDropdown = null;

function toggleDropdown(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    if (activeDropdown && activeDropdown !== menu) {
        activeDropdown.classList.add('hidden');
    }
    menu.classList.toggle('hidden');
    activeDropdown = menu.classList.contains('hidden') ? null : menu;
}

document.addEventListener('click', function(e) {
    if (activeDropdown && !e.target.closest('.relative')) {
        activeDropdown.classList.add('hidden');
        activeDropdown = null;
    }
});

// URL hash state
function updateUrlHash(newParams) {
    var params = new URLSearchParams(window.location.hash.substring(1));
    for (var key in newParams) {
        var value = newParams[key];
        if (value !== null && value !== undefined && value !== '') {
            params.set(key, value);
        } else {
            params.delete(key);
        }
    }
    var newHash = params.toString();
    if (history.replaceState) {
        history.replaceState(null, null, '#' + newHash);
    } else {
        window.location.hash = newHash;
    }
}

// Sorting
var last_sort_by = 'rank';

function getArticleData(el, selector) {
    var found = el.querySelector(selector);
    return found ? found.textContent.trim() : '';
}

var comparators = {
    'rank': function(a, b) { return parseInt(a.dataset.rank) - parseInt(b.dataset.rank); },
    'score': function(a, b) {
        var s1 = parseInt(getArticleData(a, '.score') || '0');
        var s2 = parseInt(getArticleData(b, '.score') || '0');
        if (s1 === s2) return parseInt(a.dataset.rank) - parseInt(b.dataset.rank);
        return s1 - s2;
    },
    'comments': function(a, b) {
        var c1 = parseInt(getArticleData(a, '.comment-count') || '0');
        var c2 = parseInt(getArticleData(b, '.comment-count') || '0');
        if (c1 === c2) return parseInt(a.dataset.rank) - parseInt(b.dataset.rank);
        return c1 - c2;
    },
    'time': function(a, b) {
        var lu1 = a.querySelector('.last-updated');
        var lu2 = b.querySelector('.last-updated');
        var t1 = lu1 ? new Date(lu1.dataset.submitted) : new Date(0);
        var t2 = lu2 ? new Date(lu2.dataset.submitted) : new Date(0);
        if (t1.getTime() === t2.getTime()) return parseInt(a.dataset.rank) - parseInt(b.dataset.rank);
        return t2 - t1;
    }
};

function applyAndRenderSort(sortBy, sortOrder) {
    var comparator = comparators[sortBy];
    if (!comparator) return;

    var articles = Array.from(document.querySelectorAll('article.post-item'));
    var footer = document.querySelector('footer');

    articles.sort(function(a, b) {
        var result = comparator(a, b);
        return sortOrder === 'desc' ? -result : result;
    });

    articles.forEach(function(article) {
        footer.parentNode.insertBefore(article, footer);
    });

    updateUrlHash({sort: sortBy, order: sortOrder});
}

function applyAndRenderFilter(topN) {
    var articles = document.querySelectorAll('article.post-item');
    if (!topN || topN <= 0) {
        articles.forEach(function(a) { a.style.display = ''; });
        return;
    }

    var points = Array.from(articles).map(function(e) {
        return parseInt(getArticleData(e, '.score') || '0');
    }).sort(function(a, b) { return b - a; });

    var threshold = 0;
    if (topN < points.length) {
        threshold = points[topN - 1];
    }

    articles.forEach(function(article) {
        var scoreEl = article.querySelector('.score');
        if (!scoreEl) return;
        var point = parseInt(scoreEl.textContent.trim() || '0');
        article.style.display = point >= threshold ? '' : 'none';
    });
}

// Setup sort handlers
function setupSortHandlers() {
    var sortConfig = {
        'sort-by-hn-rank': {key: 'rank', internal: 'rank'},
        'sort-by-score': {key: 'score', internal: 'score'},
        'sort-by-comments': {key: 'comments', internal: 'comment'},
        'sort-by-submit-time': {key: 'time', internal: 'submit-time'}
    };

    for (var buttonId in sortConfig) {
        (function(id, cfg) {
            var btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                var sortOrder = (last_sort_by === cfg.internal) ? 'asc' : 'desc';
                applyAndRenderSort(cfg.key, sortOrder);
                last_sort_by = (sortOrder === 'desc') ? cfg.internal : '';
                var sortMenu = document.getElementById('sort-menu');
                if (sortMenu) sortMenu.classList.add('hidden');
                activeDropdown = null;
            });
        })(buttonId, sortConfig[buttonId]);
    }
}

// Setup filter handlers
function setupFilterHandlers() {
    document.querySelectorAll('.filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            var topN = parseInt(this.dataset.top);
            applyAndRenderFilter(topN);
            updateUrlHash({filter: topN === -1 ? '' : topN});
            var filterMenu = document.getElementById('filter-menu');
            if (filterMenu) filterMenu.classList.add('hidden');
            activeDropdown = null;
        });
    });
}

// Archive "More" button
function setupArchive() {
    var moreBtn = document.getElementById('more-daily-links');
    if (moreBtn) {
        moreBtn.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('#archive-menu .extra-link').forEach(function(el) {
                el.classList.remove('hidden');
            });
            this.parentNode.style.display = 'none';
        });
    }
}

// Scroll to top button
function setupScrollUp() {
    var btn = document.getElementById('scrollUp');
    if (!btn) return;
    window.addEventListener('scroll', function() {
        if (window.scrollY > 300) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });
}

// Time humanization
function humanizeTimes() {
    document.querySelectorAll('.last-updated').forEach(function(item) {
        var submitted = item.dataset.submitted;
        if (!submitted) return;
        var span = item.querySelector('span');
        if (span && typeof humanizeDuration === 'function') {
            span.textContent = humanizeDuration(new Date() - new Date(submitted), {
                largest: 1,
                round: true
            }) + ' ago';
        }
    });
}

// Image lightbox
function PreviewImage(src) {
    var modal = document.getElementById('img-preview-modal');
    if (!modal) return;
    modal.querySelector('img').src = src;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function setupImageLightbox() {
    document.querySelectorAll('.post-item .feature-image').forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            var img = this.querySelector('img');
            if (img) PreviewImage(img.src);
        });
    });
}

// Screenshot / QR code
function setupScreenshot() {
    document.querySelectorAll('.post-item').forEach(function(ele) {
        var shareIcon = ele.querySelector('.share-icon');
        if (!shareIcon) return;
        var permalink = shareIcon.getAttribute('href');
        if (permalink && typeof QRCode !== 'undefined') {
            var qrEl = ele.querySelector('.qrcode');
            if (qrEl) {
                new QRCode(qrEl, {
                    text: permalink,
                    width: 60,
                    height: 60,
                    correctLevel: QRCode.CorrectLevel.L
                });
            }
        }
    });

    document.querySelectorAll('.post-item .share-icon').forEach(function(icon) {
        icon.addEventListener('click', function(e) {
            e.preventDefault();
            var node = this.closest('.post-item');
            if (!node || typeof modernScreenshot === 'undefined') return;
            modernScreenshot.domToPng(node, {
                timeout: 3000,
                fetch: {
                    placeholderImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAMSURBVBhXY7h79y4ABTICmGnXPbMAAAAASUVORK5CYII=",
                },
                style: {
                    paddingTop: '5px',
                    paddingLeft: '10px',
                    paddingRight: '10px',
                },
                onCloneNode: function(cloned) {
                    var qr = cloned.querySelector(".qrcode");
                    if (qr) qr.style.display = "block";
                }
            }).then(function(dataUrl) {
                PreviewImage(dataUrl);
            });
        });
    });
}

// Lazy load images
function setupLazyLoad() {
    setTimeout(function() {
        document.querySelectorAll('.post-item img').forEach(function(img) {
            img.setAttribute('loading', 'eager');
        });
    }, 30 * 1000);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    setupSortHandlers();
    setupFilterHandlers();
    setupArchive();
    setupScrollUp();
    humanizeTimes();
    setupImageLightbox();
    setupLazyLoad();

    // Apply URL hash state
    var urlParams = new URLSearchParams(window.location.hash.substring(1));
    var filterBy = urlParams.get('filter');
    if (filterBy) applyAndRenderFilter(parseInt(filterBy));

    var sortBy = urlParams.get('sort');
    var sortOrder = urlParams.get('order') || 'desc';
    if (sortBy && comparators[sortBy]) {
        applyAndRenderSort(sortBy, sortOrder);
        var internalKeyMap = {
            'rank': 'rank', 'score': 'score', 'comments': 'comment', 'time': 'submit-time'
        };
        last_sort_by = (sortOrder === 'desc') ? internalKeyMap[sortBy] : '';
    }

    // Screenshot/QR setup after libs load
    setTimeout(setupScreenshot, 100);
});
