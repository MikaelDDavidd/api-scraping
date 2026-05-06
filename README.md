<div align="center">

# Stickers Scraper

**Automated sticker pack scraper for sticker.ly with WhatsApp-ready output.**

A Node.js pipeline that discovers, downloads, processes, and uploads sticker packs to Supabase — fully compliant with WhatsApp's strict sticker requirements. Built to feed the Stickers & Memes app.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Storage%20%2B%20DB-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Sharp](https://img.shields.io/badge/Sharp-Image%20Processing-99CC00)](https://sharp.pixelplumbing.com)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

</div>

---

## Overview

Stickers Scraper is a backend job that pulls sticker packs from sticker.ly's public API, normalizes every image to WhatsApp's exact spec (dimensions, format, file size, transparency), enriches packs with auto-generated emojis, and persists everything to Supabase Storage and Postgres.

It runs as a one-shot CLI, a long-running container, or a scheduled cron job. Multiple ingestion modes (recommended packs, keyword search, full crawl) cover both cold-start population and continuous content refresh.

### Key Features

- **WhatsApp-Compliant Output** — Every sticker is converted to 512x512 WebP under 100KB; tray icons to 96x96 PNG under 50KB; pack sizes enforced between 3 and 30
- **Multi-Mode Scraping** — Pull recommended packs, search by keywords, or run a full crawl across locales
- **Multi-Locale Support** — pt-BR, en-US, es-ES, fr-FR out of the box
- **Smart Emoji Tagging** — Auto-associates relevant emojis to each sticker based on filename heuristics
- **Duplicate Detection** — Fast pre-check skips packs already in the database
- **Image Pipeline** — Sharp-powered conversion, resizing, transparency handling, and quality optimization
- **Resilient Networking** — Configurable rate limiting, retries, and graceful failure handling
- **Persistent State** — Resumable sessions with state stored between runs
- **Structured Logging** — Winston with daily-rotated files plus colorized console output
- **Production-Ready** — Dockerfile, Compose stack, and VPS deploy guide included

## Tech Stack

- **Runtime**: Node.js 18+
- **Storage & DB**: Supabase (Storage buckets + Postgres)
- **Image Processing**: Sharp, adm-zip
- **HTTP**: Axios with retry/backoff
- **Logging**: Winston + winston-daily-rotate-file, Chalk
- **Config**: dotenv
- **Packaging**: Docker, Docker Compose

## Getting Started

### Prerequisites

- Node.js 18 or higher
- A Supabase project with Storage enabled
- Tables: `packs`, `stickers`, `scraping_state`, `stats`

### Installation

```bash
git clone git@gitlab.com:mikaeldavidlopes/api-scraping.git
cd api-scraping
npm install
cp .env.example .env
# fill in your Supabase credentials
```

### Environment Variables

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
SUPABASE_BUCKET_NAME=stickers

MAX_PACKS_PER_RUN=50
DELAY_BETWEEN_REQUESTS=2000
MAX_RETRIES=3

LOG_LEVEL=info
```

### Running

```bash
# Default: full processing run
npm start

# Recommended packs only
node index.js recommended

# Keyword search
node index.js keywords memes funny love

# Full run with custom keywords
node index.js full work family friends

# Test mode (1 pack per locale)
node index.js test

# Show stats
node index.js stats

# Help
node index.js help
```

### Docker

```bash
docker compose up -d
```

See `DEPLOY-GUIDE.md` and `VPS-DEPLOY-FINAL.md` for production deployment notes.

## WhatsApp Compliance

The pipeline strictly follows WhatsApp's official sticker spec:

| Asset | Format | Dimensions | Max Size |
|---|---|---|---|
| Tray icon | PNG | 96 x 96 | 50 KB |
| Static sticker | WebP | 512 x 512 | 100 KB |
| Animated sticker | WebP (animated) | 512 x 512 | 500 KB |
| Pack | — | 3 to 30 stickers | — |

Transparency is preserved automatically, and every sticker is tagged with at least one emoji.

## Processing Flow

1. **Discover** — Query sticker.ly for recommended or keyword-matched packs
2. **Deduplicate** — Skip packs already present in Supabase
3. **Download** — Pull all sticker assets for the pack
4. **Process** — Convert, resize, and optimize via Sharp; build the tray icon
5. **Upload** — Push assets to Supabase Storage
6. **Persist** — Write pack and sticker metadata to Postgres
7. **Log** — Record outcomes with structured events for monitoring

## Project Structure

```
api-scraping/
├── config/
│   └── config.js                  # Centralized configuration
├── services/
│   ├── stickerlyClient.js         # sticker.ly API client
│   ├── optimizedStickerlyClient.js
│   ├── imageProcessor.js          # Sharp pipeline
│   ├── supabaseClient.js          # Supabase Storage + DB
│   ├── localStorageClient.js      # Local fallback
│   ├── packProcessor.js           # Main orchestrator
│   ├── enhancedPackProcessor.js
│   ├── optimizedPackProcessor.js
│   ├── fastDuplicateChecker.js
│   ├── persistentStateManager.js  # Resumable sessions
│   ├── searchCache.js
│   └── metricsLogger.js
├── utils/
│   ├── logger.js                  # Winston setup
│   ├── betterLogger.js
│   ├── sessionStats.js
│   └── whatsappExporter.js        # WhatsApp pack export
├── migrations/
│   └── add_emoji_column.sql
├── Dockerfile
├── docker-compose.yml
├── monitor.js                     # Live monitoring
├── index.js                       # Entry point
└── index_enhanced.js              # Alt entry with extra features
```

## Automation

Run on a schedule with cron:

```bash
# Daily at 2 AM
0 2 * * * cd /path/to/api-scraping && node index.js >> cron.log 2>&1
```

## Troubleshooting

- **Supabase auth errors** — verify keys in `.env` and confirm the service key has the right policies
- **Upload failures** — confirm the bucket exists and Storage policies allow writes
- **Rate limiting** — increase `DELAY_BETWEEN_REQUESTS` or lower `MAX_PACKS_PER_RUN`
- **Debug output** — `LOG_LEVEL=debug node index.js test`

## License

ISC. Part of the Stickers & Memes app ecosystem.

---

<div align="center">
Built by <a href="https://github.com/MikaelDDavidd">Mikael David</a>
</div>
