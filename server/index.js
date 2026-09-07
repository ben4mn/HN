// index.js - HN Reader server: static PWA + /api (feeds, comment trees, extraction, metadata)

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFeed, getTree, search, isFeed, PAGE_SIZE } from './hn.js';
import { extractArticle, getMeta } from './extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const VERSION = process.env.APP_VERSION || 'dev';

const app = express();
app.disable('x-powered-by');
app.set('etag', 'strong');

// ---- API ----
const api = express.Router();

api.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  next();
});

api.get('/health', (req, res) => {
  res.json({ ok: true, version: VERSION, pageSize: PAGE_SIZE, uptime: Math.round(process.uptime()) });
});

api.get('/feed/:type', async (req, res) => {
  const { type } = req.params;
  if (!isFeed(type)) return res.status(404).json({ error: 'unknown feed' });
  const page = Math.max(0, Math.min(20, parseInt(req.query.page, 10) || 0));
  try {
    const data = await getFeed(type, page);
    res.set('Cache-Control', 'public, max-age=30');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'upstream failed', detail: err.message });
  }
});

api.get('/item/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'bad id' });
  try {
    const tree = await getTree(id);
    if (!tree) return res.status(404).json({ error: 'not found' });
    res.set('Cache-Control', 'public, max-age=30');
    res.json(tree);
  } catch (err) {
    res.status(502).json({ error: 'upstream failed', detail: err.message });
  }
});

api.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (!q) return res.json({ stories: [], page: 0, hasMore: false, total: 0 });
  const page = Math.max(0, Math.min(20, parseInt(req.query.page, 10) || 0));
  try {
    res.set('Cache-Control', 'public, max-age=120');
    res.json(await search(q, page));
  } catch (err) {
    res.status(502).json({ error: 'search failed', detail: err.message });
  }
});

api.get('/extract', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ error: 'missing url' });
  try {
    const data = await extractArticle(url);
    if (data.error === 'invalid url') return res.status(400).json(data);
    res.set('Cache-Control', 'public, max-age=600');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'extract failed', detail: err.message });
  }
});

api.get('/meta', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ error: 'missing url' });
  try {
    const data = await getMeta(url);
    if (data.error === 'invalid url') return res.status(400).json(data);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'meta failed', detail: err.message });
  }
});

app.use('/api', api);

// ---- Static PWA ----
const staticOpts = {
  index: false,
  setHeaders(res, filePath) {
    if (/\.(woff2|png|ico|svg)$/.test(filePath)) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/sw\.js$|manifest\.webmanifest$/.test(filePath)) {
      res.set('Cache-Control', 'no-cache');
    } else {
      // JS/CSS revalidate on every load (ETag); the service worker owns offline caching.
      res.set('Cache-Control', 'no-cache');
    }
  }
};
app.use('/static', express.static(path.join(ROOT, 'static'), staticOpts));
app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.set('Service-Worker-Allowed', '/');
  res.sendFile(path.join(ROOT, 'sw.js'));
});
app.get('/manifest.webmanifest', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json');
  res.sendFile(path.join(ROOT, 'manifest.webmanifest'));
});
app.get(['/', '/index.html'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(ROOT, 'index.html'));
});
app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => {
  console.log(`hn-reader ${VERSION} listening on :${PORT}`);
});
