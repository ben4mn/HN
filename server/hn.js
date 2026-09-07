// hn.js - Hacker News data: Firebase for feeds, Algolia for full comment trees

import { TTLCache } from './cache.js';

const FIREBASE = 'https://hacker-news.firebaseio.com/v0';
const ALGOLIA = 'https://hn.algolia.com/api/v1';

const FEEDS = {
  top: 'topstories',
  new: 'newstories',
  best: 'beststories',
  ask: 'askstories',
  show: 'showstories',
  jobs: 'jobstories'
};

export const PAGE_SIZE = 30;

const idsCache = new TTLCache({ max: 20 });
const itemCache = new TTLCache({ max: 5000 });
const treeCache = new TTLCache({ max: 500 });
const searchCache = new TTLCache({ max: 200 });

async function getJSON(url, { timeoutMs = 10000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export function isFeed(type) {
  return Object.prototype.hasOwnProperty.call(FEEDS, type);
}

export async function getFeedIds(type) {
  return idsCache.wrap(type, 60 * 1000, () => getJSON(`${FIREBASE}/${FEEDS[type]}.json`));
}

export async function getItem(id) {
  return itemCache.wrap(`item:${id}`, 5 * 60 * 1000, () => getJSON(`${FIREBASE}/item/${id}.json`));
}

/** Slim story shape for feed lists. */
export function slimStory(item, rank) {
  if (!item) return null;
  return {
    id: item.id,
    rank,
    title: item.title || '',
    url: item.url || null,
    by: item.by || '',
    time: item.time || 0,
    score: item.score || 0,
    descendants: item.descendants || 0,
    type: item.type || 'story',
    text: item.text ? true : false
  };
}

export async function getFeed(type, page = 0) {
  const ids = await getFeedIds(type);
  const start = page * PAGE_SIZE;
  const slice = ids.slice(start, start + PAGE_SIZE);
  const items = await Promise.all(slice.map((id) => getItem(id).catch(() => null)));
  const stories = items
    .map((it, i) => slimStory(it, start + i + 1))
    .filter((s) => s && !s.deleted && !s.dead);
  return { stories, page, hasMore: start + PAGE_SIZE < ids.length, total: ids.length };
}

// ---- Comment trees ----

function fromAlgolia(node, depth = 0) {
  if (!node) return null;
  const kids = (node.children || [])
    .filter((c) => c && (c.text || (c.children && c.children.length)))
    .map((c) => fromAlgolia(c, depth + 1))
    .filter(Boolean);
  return {
    id: node.id,
    by: node.author || '',
    time: node.created_at_i || 0,
    text: node.text || '',
    title: node.title || undefined,
    url: node.url || undefined,
    score: node.points ?? undefined,
    type: node.type || (depth === 0 ? 'story' : 'comment'),
    kids
  };
}

function countKids(node) {
  return node.kids.reduce((n, k) => n + 1 + countKids(k), 0);
}

async function firebaseTree(id, depth = 0, budget = { left: 600 }) {
  const item = await getItem(id);
  if (!item || item.deleted || item.dead) return null;
  const node = {
    id: item.id,
    by: item.by || '',
    time: item.time || 0,
    text: item.text || '',
    title: item.title,
    url: item.url,
    score: item.score,
    type: item.type,
    kids: []
  };
  if (item.kids && item.kids.length && budget.left > 0) {
    const take = item.kids.slice(0, budget.left);
    budget.left -= take.length;
    const kids = await Promise.all(take.map((k) => firebaseTree(k, depth + 1, budget).catch(() => null)));
    node.kids = kids.filter(Boolean);
  }
  return node;
}

export async function getTree(id) {
  return treeCache.wrap(`tree:${id}`, 90 * 1000, async () => {
    // Firebase story metadata is the source of truth for score/descendants.
    const meta = await getItem(id).catch(() => null);
    let tree = null;
    try {
      const raw = await getJSON(`${ALGOLIA}/items/${id}`, { timeoutMs: 8000 });
      tree = fromAlgolia(raw);
    } catch {
      tree = null;
    }
    // Algolia lags behind on brand-new stories; fall back to Firebase if it is clearly stale.
    const loaded = tree ? countKids(tree) : 0;
    const expected = meta?.descendants || 0;
    if (!tree || (expected > 0 && loaded < Math.min(expected, 5) / 2)) {
      tree = await firebaseTree(id);
      if (tree) tree._source = 'firebase';
    }
    if (!tree) return null;
    if (meta) {
      tree.title = meta.title ?? tree.title;
      tree.url = meta.url ?? tree.url;
      tree.score = meta.score ?? tree.score;
      tree.by = meta.by ?? tree.by;
      tree.time = meta.time ?? tree.time;
      tree.descendants = meta.descendants ?? loaded;
      tree.type = meta.type ?? tree.type;
      if (meta.text) tree.text = meta.text;
    } else {
      tree.descendants = countKids(tree);
    }
    return tree;
  });
}

// ---- Search ----

export async function search(q, page = 0) {
  const key = `${q}|${page}`;
  return searchCache.wrap(key, 5 * 60 * 1000, async () => {
    const url = `${ALGOLIA}/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${PAGE_SIZE}&page=${page}`;
    const data = await getJSON(url, { timeoutMs: 8000 });
    const stories = (data.hits || []).map((h, i) => ({
      id: Number(h.objectID),
      rank: page * PAGE_SIZE + i + 1,
      title: h.title || '',
      url: h.url || null,
      by: h.author || '',
      time: h.created_at_i || 0,
      score: h.points || 0,
      descendants: h.num_comments || 0,
      type: 'story',
      text: !!h.story_text
    }));
    return { stories, page, hasMore: page + 1 < (data.nbPages || 0), total: data.nbHits || 0 };
  });
}
