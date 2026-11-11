# DestinyTheory

AI-assisted Zi Wei Dou Shu (紫微斗数) chart generation, interpretation and reasoning. Charts are computed locally; with your explicit consent, the model you choose interprets them and answers follow-up questions.

[中文](./README.md) · **English**

## Features

- **Charting engine** (`lib/ziwei/`): 14 major stars, auxiliary and minor stars, natal / decade / annual Four Transformations, twelve spirits, decade and annual periods, pattern detection.
- **Configurable conventions**: leap-month handling, late-Zi day rollover, star-brightness schools; China DST (1986–1991) is detected but never silently subtracted.
- **Birth input**: solar or lunar calendar (including leap months); exact time, a fuzzy `[start, end)` range, or unknown. Ranges produce every candidate chart instead of inventing a birth minute. See [docs/BIRTH-INPUT.md](./docs/BIRTH-INPUT.md) (Chinese).
- **AI interpretation and follow-up**: streaming, stop and retry, reader-aware scrolling. The server rebuilds the chart from birth parameters and sends only chart structure — never names, raw dates or places.
- **Multiple model providers**: reuse Pi's GitHub Copilot login, sign in to ChatGPT, Claude, xAI, Kimi Code or OpenRouter from the web UI, or save API keys for DeepSeek, Gemini and others, then pick from that provider's live model catalog. See [docs/AI-PROVIDERS.md](./docs/AI-PROVIDERS.md).
- **Classics**: public-domain texts with full-text search.

## Quick start

Requires Node.js 22.19+.

```bash
git clone https://github.com/yqForge/DestinyTheory.git
cd DestinyTheory
npm ci
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open <http://127.0.0.1:3000/chart>. Charting needs no keys. For AI, click **“登录 / 模型”** (Login / Model) in the interpretation pane.

## Verify

```bash
npm run typecheck
npm test          # engine, birth-input and AI regressions (mocked, no real model calls)
npm run build
npm run test:ui   # browser regressions; start the dev server and install Chrome/Chromium first
```

## Security

The AI routes accept only same-origin loopback requests and have no user accounts or rate limiting. **Do not expose this app to the internet or your LAN**: others could spend your logged-in account quota. Web-saved credentials live in `~/.destiny-theory/` (0700/0600), separate from Pi, and are never returned to the browser.

## Scope

This is a Zi Wei tool, not a BaZi strength/useful-god engine. Longitude correction is local mean solar time only (no equation of time, no automatic historical DST). Synastry AI (`/api/heming`) is not implemented. Output is for cultural study only, not medical, financial, legal or major-decision advice.

## License

Code: [MIT](./LICENSE). Classical texts: public domain. Third-party notices: [NOTICE.md](./NOTICE.md).
