// utils.js - Small helpers shared by every module

function $(sel, parent = document) {
  return parent.querySelector(sel);
}

function $$(sel, parent = document) {
  return Array.from(parent.querySelectorAll(sel));
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timeAgo(unix) {
  if (!unix) return '';
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

function fullDate(unix) {
  if (!unix) return '';
  try {
    return new Date(unix * 1000).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function domainOf(url) {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return h;
  } catch {
    return null;
  }
}

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function hnItemUrl(id) {
  return `https://news.ycombinator.com/item?id=${id}`;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function readingMinutes(text) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 230));
}

/**
 * Sanitize untrusted HTML (HN comments, extracted articles) with an allowlist.
 * Returns a DocumentFragment ready to append.
 */
const SAFE_TAGS = new Set([
  'p', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'img', 'figure', 'figcaption', 'em', 'strong', 'b', 'i', 'u', 's', 'table', 'thead', 'tbody',
  'tfoot', 'tr', 'th', 'td', 'br', 'hr', 'span', 'div', 'sup', 'sub', 'small', 'cite', 'kbd',
  'dl', 'dt', 'dd', 'abbr', 'time', 'mark', 'section', 'article', 'aside', 'picture', 'source',
  'video', 'audio', 'del', 'ins', 'tt'
]);
const SAFE_ATTRS = new Set(['href', 'src', 'srcset', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'datetime', 'type', 'media', 'sizes', 'controls', 'poster', 'lang', 'start']);

function sanitizeHtml(html, { linkTarget = '_blank' } = {}) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const frag = document.createDocumentFragment();

  const walk = (node, out) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out.appendChild(document.createTextNode(child.textContent));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLowerCase();
      if (!SAFE_TAGS.has(tag)) {
        // Drop the element but keep its readable content.
        if (!['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math', 'noscript'].includes(tag)) {
          walk(child, out);
        }
        continue;
      }
      const el = document.createElement(tag);
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        if (!SAFE_ATTRS.has(name)) continue;
        const val = attr.value;
        if ((name === 'href' || name === 'src' || name === 'poster') && /^\s*(javascript|data|vbscript):/i.test(val)) continue;
        el.setAttribute(name, val);
      }
      if (tag === 'a') {
        el.setAttribute('target', linkTarget);
        el.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'img' || tag === 'video' || tag === 'audio') {
        el.setAttribute('loading', 'lazy');
        if (tag === 'img') el.setAttribute('decoding', 'async');
      }
      walk(child, el);
      out.appendChild(el);
    }
  };
  walk(doc.body, frag);
  return frag;
}

/** Fire-and-forget haptic tick where supported. */
function haptic(ms = 8) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* ignore */ }
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
