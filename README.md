# HN — Hacker News reader

A fast, readable Hacker News client. Articles and comments side by side on a desktop, a native-feeling stacked app on a phone. Installable as a PWA.

**Live:** [hn.4mn.org](https://hn.4mn.org) · static fallback at [ben4mn.github.io/HN](https://ben4mn.github.io/HN/)

## What it does

- **Feeds** — Top, New, Best, Ask, Show, Jobs, plus Saved and full-text search (Algolia).
- **Reader** — server-side Readability extraction with a Jina fallback, TL;DR (client-side TextRank), reading time, reading progress, adjustable type size.
- **Comments** — whole tree in one request, tap-to-collapse with counts, OP badges, collapse/expand all, "next top-level comment" jump on mobile, collapse state remembered per story.
- **Layouts** — three panes (feed | article | comments) above 1180px, two panes above 768px, single stack with a bottom tab bar below that.
- **PWA** — versioned shell precache, offline reading of anything already fetched, update toast, edge-swipe back, pull to refresh, safe-area aware, branded maskable icons.
- **Desktop columns** — drag the dividers to resize (double-click resets), swap article and comments with the ⇄ button or `x`.
- **Keyboard** — `j`/`k` move, `↵` open, `c` comments, `o` original, `s` save, `/` search, `r` refresh, `a` toggle pane, `x` swap panes, `n` next root comment, `1`–`6` feeds.

## Stack

```
index.html + static/            vanilla JS, no build step, self-hosted Figtree
server/                         Node 22 + Express: feeds, comment trees, Readability, page metadata
Dockerfile / docker-compose.yml container on the Debian box, host port 3026
```

The client prefers the bundled backend (`/api/*`). When it is hosted as plain static files (GitHub Pages), it detects the missing API and talks to Firebase, Algolia, and Jina directly, with thumbnails and blurbs disabled.

## Run locally

```bash
cd server && npm install && cd ..
PORT=3099 node server/index.js      # http://localhost:3099
```

The service worker is skipped on `localhost` so edits show up on reload (`?sw=1` opts back in).

## Deploy

```bash
ssh debian
cd ~/HN && git pull
APP_VERSION=$(git rev-parse --short HEAD) docker compose up -d --build
```

`APP_VERSION` is stamped into `sw.js` at build time so every deploy invalidates the cached shell on clients.
