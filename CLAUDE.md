# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview

Hacker News reader PWA. Vanilla JS front end with no build step, plus a small Node/Express backend that does the heavy lifting (feed assembly, full comment trees, Readability extraction, OG metadata). Deployed in Docker on the Debian box at `hn.4mn.org` (host port 3026). Also served as pure static files on GitHub Pages, where the client falls back to public APIs.

## Development

```bash
cd server && npm install            # once
PORT=3099 node server/index.js      # serves the static app + /api on :3099
```

- Static files live at the repo root (`index.html`, `sw.js`, `manifest.webmanifest`, `static/`). All URLs are relative so the app works at `/` and at `/HN/`.
- The service worker is not registered on `localhost` (append `?sw=1` to test it). When testing SW changes, unregister and clear caches between reloads.
- No test suite. Verify in the browser at three widths: <768 (mobile), 768–1179 (two-pane), ≥1180 (three-pane).

## Architecture

Singleton modules, loaded in order from `index.html`:

```
utils.js → store.js → extractive.js → api.js → feed.js → reader.js → thread.js → gestures.js → app.js
```

- **`App` (app.js)** — hash router, layout detection (`body[data-layout]`), detail pane open/close, history depth tracking for a correct Back button, keyboard shortcuts, theme, toasts, SW update prompt.
- **`Feed` (feed.js)** — story list rendering, keyboard cursor, lazy thumbnails/blurbs via `/api/meta`.
- **`Reader` (reader.js)** — article pane: `/api/extract` → sanitized HTML, leading site-chrome stripping, TL;DR from prose text, reading progress.
- **`Thread` (thread.js)** — comments pane: renders the whole tree as one HTML string, delegated click handling, collapse state in `sessionStorage`, jump-to-next-root.
- **`API` (api.js)** — server-first with in-memory caching; `Direct` fallback hits Firebase/Algolia/Jina when `/api` is absent (404 or network error flips `API.mode`).
- **`Store` (store.js)** — localStorage prefs: theme, font scale, read ids, saved stories, last feed.
- **`Gestures` (gestures.js)** — pull-to-refresh on the feed scroller, edge-swipe back on the mobile overlay.

Routes: `#/top|new|best|ask|show|jobs|saved`, `#/search/<q>`, `#/read/<id>` (article pane), `#/item/<id>` (comments pane). Pane switches use `location.replace` so Back returns to the feed.

Layout: each pane is its own scroll container, so feed scroll position survives opening a story without any save/restore code. On mobile the detail section is a fixed overlay that slides in; on desktop it sits in the grid.

## Server (`server/`)

- `index.js` — Express routes: `/api/feed/:type`, `/api/item/:id`, `/api/search`, `/api/extract`, `/api/meta`, `/api/health`; static serving with `no-cache` for HTML/JS/CSS and immutable for fonts/icons.
- `hn.js` — Firebase for feed ids/items; Algolia `items/:id` for full trees with a Firebase recursive fallback when Algolia lags (new stories).
- `extract.js` — fetch with a browser UA (private-network URLs blocked), Readability + DOMPurify, Jina fallback for bot walls, `getMeta` for OG image/description.
- `cache.js` — TTL + LRU cache with in-flight dedupe. Everything is in memory; a restart just re-warms.

## Service worker (`sw.js`)

`VERSION` names the shell cache. Docker builds append the git SHA (`APP_VERSION`) so every deploy invalidates the shell; bump `VERSION` by hand when shipping to GitHub Pages. Precache uses `cache: 'reload'`. API responses are cached at runtime (network-first) for offline reading; `/api/meta` is stale-while-revalidate. Updates are not auto-applied — the page shows a "new version" toast and the SW skips waiting on request.

## Conventions

- DOM helpers `$`/`$$` from utils.js; render lists as HTML strings and use event delegation (thread trees can be 1000+ nodes).
- All untrusted HTML (comments, articles) goes through `sanitizeHtml` in utils.js even though the server already sanitizes.
- Styling is hand-written CSS in `static/css/app.css` with design tokens in `:root`; light and dark both defined, dark via `prefers-color-scheme` or `html[data-theme]`. Serif (Newsreader) for content, mono (IBM Plex Mono) for metadata and controls. Keep the single orange accent sparse.
- Icons are generated from `static/icons/icon.svg`; the PNGs were rasterized with headless Chrome (maskable variants scale the mark into the 80% safe zone).

## Deploy

```bash
ssh debian 'cd ~/HN && git pull && APP_VERSION=$(git rev-parse --short HEAD) docker compose up -d --build'
```

Cloudflare tunnel ingress for `hn.4mn.org → localhost:3026` lives in `/etc/cloudflared/config.yml` on the box; editing it needs no sudo, restarting `cloudflared` does.
