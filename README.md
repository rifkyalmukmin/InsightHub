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

## Docker (Full Stack)

```bash
# Set required env vars in .env or shell
export NEXTAUTH_SECRET="your-secret-min-32-chars"
export OPENAI_API_KEY="sk-..."
export FIRECRAWL_API_KEY="fc-..."

docker-compose up -d
```

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
