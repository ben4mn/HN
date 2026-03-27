# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Static PWA Hacker News reader — no build tools, no package.json. All JS loaded via `<script>` tags, styling via Tailwind CDN. Deployed to GitHub Pages at `https://ben4mn.github.io/HN/`.

## Development

```bash
# Serve locally (must serve from parent directory so /HN/ path works)
python3 -m http.server 8080 --directory /Users/ben/Documents/1_Projects
# Then open http://localhost:8080/HN/

# Or use npx serve from the parent directory
cd .. && npx serve -l 8080
```

All paths assume `/HN/` base (set via `<base href="/HN/">` in index.html). The service worker registers at `/HN/sw.js`.

## Architecture

**Singleton module pattern** — each JS file exposes a global object (e.g., `App`, `HNApi`, `Stories`, `Reader`). No module bundler; load order in `index.html` matters:

```
utils.js → api.js → thumbnails.js → summaries.js → settings.js → reader.js → stories.js → comments.js → app.js
```

**`App` (app.js)** orchestrates everything: hash-based routing, view transitions, state management. Three overlay views slide in/out:
- Feed (`#/top`, `#/new`, `#/best`) — rendered by `Stories`
- Reader (`#/read/{id}`) — rendered by `Reader`
- Comments (`#/item/{id}`) — rendered by `Comments`

**`HNApi` (api.js)** wraps the Firebase HN API with sessionStorage caching (2min for lists, 5min for items). Fetches comments recursively up to 3 levels deep with max 15 concurrent requests.

**`Reader` (reader.js)** fetches articles via Jina Reader API (`r.jina.ai/{url}` with `Accept: text/markdown`), strips Jina metadata preamble, renders markdown with `marked.js`. Caches extracted articles in sessionStorage (30min TTL).

**`Summaries` (summaries.js)** extracts article text via Jina Reader (plain text mode), then generates extractive summaries client-side using TextRank (`extractive.js`). Falls back to title + top 5 comments if article extraction fails. No API keys required — fully offline-capable once text is extracted.

## External APIs

| Service | Used By | Purpose |
|---------|---------|---------|
| `hacker-news.firebaseio.com/v0` | api.js | Story data and comments |
| `r.jina.ai/{url}` | reader.js (markdown), summaries.js (plain text) | Article extraction |
| `api.microlink.io` | thumbnails.js | OG image extraction |

## Service Worker (sw.js)

Cache versioned as `hn-v1`. Strategies:
- **Static assets** (`/HN/static/`): cache-first
- **HN API**: network-first with cache fallback (enables offline)
- **CDN scripts** (Tailwind, marked.js): stale-while-revalidate
- **Third-party APIs** (Jina, Microlink): network-only

Bump `CACHE_VERSION` in sw.js when updating cached assets to force a refresh.

## Conventions

- All DOM queries use `$()` and `$$()` helpers from utils.js (not `document.querySelector`)
- Elements created via `createElement(tag, attrs, children)` helper
- Caching: sessionStorage with `{data, ts}` JSON pattern and TTL checks
- Dark mode: `.dark` class on `<html>`, persisted in localStorage as `hn_dark`
- Tailwind config extends with `hn: '#ff6600'` color
- Touch targets: minimum 44x44px via `.touch-target` class
- View transitions: `.view-enter` (slideIn) and `.view-exit` (slideOut) CSS classes
