# InsightHub - AI News Summarizer

AI-powered news aggregator that crawls articles via Firecrawl, summarizes them with OpenAI, and provides an analytics dashboard.

## Features

- **AI News Aggregation** — Crawl and extract articles from configured sources
- **Smart Summarization** — GPT-powered summaries with key takeaways
- **Analytics Dashboard** — Track topics, sources, and reading patterns
- **AI Chat Assistant** — Ask questions about your crawled articles
- **Bookmarks** — Save and organize articles
- **Multi-Provider Auth** — Google, GitHub, or email/password

## Tech Stack

Next.js 15 · TypeScript · Tailwind CSS · Prisma · PostgreSQL · NextAuth · OpenAI · Firecrawl

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 16+
- OpenAI API key
- Firecrawl API key
- (Optional) Google/GitHub OAuth credentials

### Installation

```bash
git clone https://github.com/yourusername/insighthub.git
cd insighthub
npm install
cp .env.example .env.local
# Edit .env.local with your API keys
```

### Database

```bash
# Start PostgreSQL (Docker)
npm run docker:up

# Run migrations
npx prisma migrate dev
npx prisma generate
```

### Development

```bash
# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — Background crawl worker (required for crawling)
npx tsx scripts/worker.ts
```

Open [http://localhost:3000](http://localhost:3000)

### Testing

```bash
npm test          # Unit tests (Jest)
npm run test:e2e  # E2E tests (Playwright)
npm run lint      # ESLint
npm run build     # Production build
```

### Optional Services

| Service | Env Variable | Purpose |
|---------|-------------|---------|
| Redis | `REDIS_URL` | Faster rate limiting (falls back to PostgreSQL) |
| SMTP | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Email digest delivery |

### Background Crawl Worker

Crawling is processed by the worker (`npm run worker`) — the API only enqueues a job and returns immediately, so the worker must be running for crawls to complete. If a worker/serverless process dies mid-crawl, the job is automatically recovered: after `JOB_STALE_TIMEOUT_MS` (default `900000`, 15 min) a stuck `running` job is reclaimed as a retry, and once `maxAttempts` (default 3) are exhausted it is marked failed.

| Env Variable | Default | Meaning |
|--------------|---------|---------|
| `WORKER_POLL_INTERVAL_MS` | `5000` | How often the worker polls for jobs |
| `WORKER_MAX_CONCURRENT` | `3` | Max jobs processed at once |
| `JOB_STALE_TIMEOUT_MS` | `900000` | Stuck `running` job recovery timeout (ms) |

### Daily Usage Quotas

Summarize, crawl, chat, and digest calls hit paid APIs (OpenAI / Firecrawl), so each user gets a **daily per-user quota** enforced before the API is called (HTTP 429 when exceeded):

| Env Variable | Default | Meaning |
|--------------|---------|---------|
| `USAGE_DAILY_LIMIT_SUMMARIZE` | `20` | AI summaries per user per day |
| `USAGE_DAILY_LIMIT_CRAWL` | `5` | Crawls per user per day |
| `USAGE_DAILY_LIMIT_CHAT` | `100` | Chat messages per user per day |
| `USAGE_DAILY_LIMIT_DIGEST` | `10` | Digest generations per user per day |
| `USAGE_GLOBAL_DAILY_BUDGET` | `0` | Hard cap on total paid calls/day across all users (`0` = disabled) |
| `USAGE_ALERT_THRESHOLD` | `0.8` | Log a warning at this fraction of the limit |
| `USAGE_RETENTION_DAYS` | `7` | Usage history kept (pruned lazily) |

Set a limit to `0` to make that type unlimited. The `Usage` table is created by running `npx prisma migrate deploy`.

## Docker (Full Stack)

```bash
# Set required env vars in .env or shell
export NEXTAUTH_SECRET="$(openssl rand -base64 32)"
export OPENAI_API_KEY="sk-..."
export FIRECRAWL_API_KEY="fc-..."

docker-compose up -d
```

> `NEXTAUTH_SECRET` is **required** (no default) — `docker-compose` will refuse to build and start without it. It is passed as a build arg (the Next.js build evaluates the auth route module, which fails fast without a valid secret) and as a runtime env var for the app container.

This starts:
- **postgres** — Database on port 5432
- **app** — Next.js on port 3000
- **worker** — Background crawl processor

## Project Structure

```
app/
├── (dashboard)/     # Protected pages (shared layout)
├── api/             # API routes
└── sign-in/         # Auth pages
components/
├── ui/              # Base UI components
├── layout/          # Shell, sidebar, header
└── features/        # Feature components
lib/                 # Auth, db, utils, validations
services/            # Business logic (crawl, openai, analytics)
prisma/              # Schema & migrations
scripts/worker.ts    # Background crawl worker
tests/               # Jest tests
```

## Environment Variables

See `.env.example` for all variables. Required:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Session encryption key (min 32 chars) |
| `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000`) |
| `OPENAI_API_KEY` | OpenAI API key |
| `FIRECRAWL_API_KEY` | Firecrawl API key |

## Deployment

### Vercel

1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy
5. Run crawl worker separately (e.g. Railway, Fly.io, or cron)

### Docker

See [Docker (Full Stack)](#docker-full-stack) above.

## License

MIT
