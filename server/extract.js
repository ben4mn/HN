// extract.js - Article extraction (Readability) and page metadata (OG image, description)

import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import createDOMPurify from 'dompurify';
import { TTLCache } from './cache.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const META_HTML_BYTES = 256 * 1024;

const articleCache = new TTLCache({ max: 400 });
const metaCache = new TTLCache({ max: 3000 });

const purifyWindow = new JSDOM('').window;
const DOMPurify = createDOMPurify(purifyWindow);
const PURIFY_OPTS = {
  ALLOWED_TAGS: [
    'p', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'img', 'figure', 'figcaption', 'em', 'strong', 'b', 'i', 'u', 's', 'table', 'thead', 'tbody',
    'tfoot', 'tr', 'th', 'td', 'br', 'hr', 'span', 'div', 'sup', 'sub', 'small', 'cite', 'kbd',
    'dl', 'dt', 'dd', 'abbr', 'time', 'mark', 'section', 'article', 'aside', 'picture', 'source', 'video', 'audio'
  ],
  ALLOWED_ATTR: ['href', 'src', 'srcset', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'datetime', 'type', 'media', 'sizes', 'controls', 'poster', 'lang', 'start'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button', 'svg', 'math'],
  KEEP_CONTENT: true
};

function isPublicHttpUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  // Block obvious private ranges; the box sits on a LAN we never want to proxy into.
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host === '[::1]' || host.startsWith('[fc') || host.startsWith('[fd') || host.startsWith('[fe80')) return false;
  return true;
}

async function fetchHtml(url, { limit, timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9'
      }
    });
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status, finalUrl: res.url };
    if (!/text\/html|application\/xhtml|application\/xml|text\/xml/.test(type)) {
      return { unsupported: true, contentType: type.split(';')[0], finalUrl: res.url };
    }
    // Read up to `limit` bytes then stop.
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= limit) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const charset = /charset=([\w-]+)/i.exec(type)?.[1];
    let html;
    try {
      html = new TextDecoder(charset || 'utf-8', { fatal: false }).decode(buf);
    } catch {
      html = buf.toString('utf8');
    }
    return { html, finalUrl: res.url, contentType: type.split(';')[0] };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(t);
  }
}

function quietDom(html, url) {
  const vc = new VirtualConsole();
  vc.on('error', () => {});
  return new JSDOM(html, { url, virtualConsole: vc });
}

function absolutize(doc, base) {
  for (const el of doc.querySelectorAll('a[href]')) {
    try { el.setAttribute('href', new URL(el.getAttribute('href'), base).href); } catch { /* leave */ }
  }
  for (const el of doc.querySelectorAll('img[src], source[src], video[src], audio[src], video[poster]')) {
    for (const attr of ['src', 'poster']) {
      const v = el.getAttribute(attr);
      if (v) { try { el.setAttribute(attr, new URL(v, base).href); } catch { /* leave */ } }
    }
    const ss = el.getAttribute('srcset');
    if (ss) {
      const fixed = ss.split(',').map((part) => {
        const [u, d] = part.trim().split(/\s+/);
        try { return [new URL(u, base).href, d].filter(Boolean).join(' '); } catch { return part; }
      }).join(', ');
      el.setAttribute('srcset', fixed);
    }
  }
  // Lazy-loaded images often hide the real src in data-src.
  for (const el of doc.querySelectorAll('img[data-src], img[data-lazy-src], img[data-original]')) {
    const v = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
    if (v && !/^data:/.test(el.getAttribute('src') || '')) continue;
    if (v) { try { el.setAttribute('src', new URL(v, base).href); } catch { /* leave */ } }
  }
}

function readMeta(doc) {
  const pick = (...sels) => {
    for (const s of sels) {
      const el = doc.querySelector(s);
      const v = el?.getAttribute('content') || el?.getAttribute('href') || el?.textContent;
      if (v && v.trim()) return v.trim();
    }
    return null;
  };
  const base = doc.baseURI;
  const abs = (v) => { if (!v) return null; try { return new URL(v, base).href; } catch { return null; } };
  return {
    title: pick('meta[property="og:title"]', 'meta[name="twitter:title"]', 'title'),
    description: pick('meta[property="og:description"]', 'meta[name="twitter:description"]', 'meta[name="description"]'),
    image: abs(pick('meta[property="og:image:secure_url"]', 'meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]', 'link[rel="image_src"]')),
    icon: abs(pick('link[rel="apple-touch-icon"]', 'link[rel="apple-touch-icon-precomposed"]', 'link[rel="icon"]', 'link[rel="shortcut icon"]')),
    siteName: pick('meta[property="og:site_name"]', 'meta[name="application-name"]')
  };
}

/** Lightweight metadata for feed rows: thumbnail + one-line blurb. */
export async function getMeta(url) {
  if (!isPublicHttpUrl(url)) return { error: 'invalid url' };
  return metaCache.wrap(`meta:${url}`, 6 * 60 * 60 * 1000, async () => {
    const r = await fetchHtml(url, { limit: META_HTML_BYTES, timeoutMs: 8000 });
    if (r.error || r.unsupported) {
      return { url, image: null, icon: null, description: null, error: r.error || 'unsupported', contentType: r.contentType || null };
    }
    const dom = quietDom(r.html, r.finalUrl || url);
    const meta = readMeta(dom.window.document);
    dom.window.close();
    return { url, ...meta, error: null };
  });
}

async function jinaFallback(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: ctrl.signal,
      headers: { accept: 'text/html', 'x-return-format': 'html' }
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html || html.length < 200) return null;
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Full article extraction. */
export async function extractArticle(url) {
  if (!isPublicHttpUrl(url)) return { error: 'invalid url' };
  return articleCache.wrap(`article:${url}`, 60 * 60 * 1000, async () => {
    const r = await fetchHtml(url, { limit: MAX_HTML_BYTES });
    if (r.unsupported) {
      return { url, unsupported: true, contentType: r.contentType, error: null };
    }
    let html = r.html;
    let via = 'direct';
    if (!html) {
      html = await jinaFallback(url);
      via = 'jina';
      if (!html) return { url, error: r.error || 'fetch failed', content: null };
    }

    let result = runReadability(html, r.finalUrl || url);
    // Paywall / bot wall / JS-only pages: retry through Jina once.
    if ((!result || result.length < 400) && via === 'direct') {
      const alt = await jinaFallback(url);
      if (alt) {
        const r2 = runReadability(alt, r.finalUrl || url);
        if (r2 && r2.length > (result?.length || 0)) { result = r2; via = 'jina'; }
      }
    }
    if (!result) return { url, error: 'no readable content', content: null };
    return { url, finalUrl: r.finalUrl || url, via, error: null, ...result };
  });
}

function runReadability(html, url) {
  let dom;
  try {
    dom = quietDom(html, url);
  } catch {
    return null;
  }
  try {
    const doc = dom.window.document;
    const meta = readMeta(doc);
    absolutize(doc, url);
    const readerable = isProbablyReaderable(doc, { minContentLength: 140, minScore: 20 });
    const article = new Readability(doc, { charThreshold: 250, keepClasses: false }).parse();
    if (!article || !article.content) return null;
    const content = DOMPurify.sanitize(article.content, PURIFY_OPTS);
    const textContent = (article.textContent || '').replace(/\s+/g, ' ').trim();
    if (textContent.length < 100 && !readerable) return null;
    return {
      title: article.title || meta.title,
      byline: article.byline || null,
      siteName: article.siteName || meta.siteName || null,
      excerpt: article.excerpt || meta.description || null,
      image: meta.image,
      lang: article.lang || null,
      length: textContent.length,
      content,
      textContent
    };
  } catch {
    return null;
  } finally {
    dom.window.close();
  }
}
