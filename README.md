# HN Reader

A fast, clean Hacker News client built as a static PWA. No frameworks, no build step, no nonsense — just vanilla JS and Tailwind CDN.

**[Try it live](https://ben4mn.github.io/HN/)**

## Features

- **Three feeds** — Top, New, and Best stories with pull-to-refresh
- **Built-in reader** — Read articles without leaving the app (via Jina Reader)
- **AI summaries** — Optional GPT-4o-mini summaries (bring your own API key)
- **Threaded comments** — Collapsible comment trees, 3 levels deep
- **Thumbnails** — OG image previews pulled from Microlink
- **Dark mode** — Because obviously
- **Offline support** — Service worker caches stories for reading on the go
- **Installable** — Add to home screen on iOS/Android for a native feel

## Stack

```
HTML + Tailwind CDN + vanilla JS
├── No build tools
├── No package.json
├── No node_modules
└── Just vibes
```

## Run locally

```bash
# Serve from parent directory (base path is /HN/)
python3 -m http.server 8080 --directory ..
# Open http://localhost:8080/HN/
```

## Architecture

Singleton module pattern — each JS file exposes a global object. Load order matters:

```
utils.js → api.js → thumbnails.js → summaries.js → settings.js → reader.js → stories.js → comments.js → app.js
```

`App` handles hash-based routing between three views: Feed, Reader, and Comments. Everything caches aggressively in sessionStorage with TTLs.

## APIs

| Service | Purpose |
|---------|---------|
| HN Firebase API | Stories and comments |
| Jina Reader | Article extraction |
| OpenAI | AI summaries (optional, user API key) |
| Microlink | Thumbnail previews |
