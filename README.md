# InsightHub - AI News Summarizer

A production-ready AI-powered news aggregator that collects articles from various websites using Firecrawl, summarizes them with OpenAI GPT-4.1, categorizes by topic, and provides a modern analytics dashboard.

## Features

### Core Features
- **🔍 AI News Aggregation**: Automatically crawl and extract articles from configured news sources
- **🤖 Smart Summarization**: Generate concise summaries using GPT-4.1 with key takeaways
- **📊 Analytics Dashboard**: Track reading patterns, popular topics, and source statistics
- **💬 AI Chat Assistant**: Ask questions about your crawled articles using natural language
- **🔖 Bookmarks & Collections**: Save and organize articles for later reading
- **🏷️ Auto-Tagging**: Automatic topic classification using AI
- **📧 Daily Digest**: Personalized news digest delivered to your inbox
- **🔒 Multi-Provider Auth**: Sign in with Google, GitHub, or email/password

### Technical Features
- **Next.js 15 App Router**: Latest React Server Components architecture
- **TypeScript**: Full type safety across the entire stack
- **Tailwind CSS**: Beautiful, responsive UI with dark mode support
- **Prisma ORM**: Type-safe database access with PostgreSQL
- **TanStack Query**: Efficient client-side data fetching and caching
- **Framer Motion**: Smooth animations and transitions
- **Recharts**: Interactive data visualizations
- **shadcn/ui**: Beautiful, accessible component library

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui + Radix UI |
| Animations | Framer Motion |
| Charts | Recharts |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | NextAuth.js |
| AI | OpenAI GPT-4.1 / GPT-4o-mini |
| Crawling | Firecrawl API |
| State | TanStack Query |

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- OpenAI API key
- Firecrawl API key
- (Optional) Google/GitHub OAuth credentials

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/insighthub.git
   cd insighthub
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and add your API keys:
   ```env
   # Database
   DATABASE_URL="postgresql://user:password@localhost:5432/insighthub"
   
   # NextAuth
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret-key-here"
   
   # OpenAI
   OPENAI_API_KEY="sk-your-openai-key"
   
   # Firecrawl
   FIRECRAWL_API_KEY="fc-your-firecrawl-key"
   
   # OAuth (Optional)
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   GITHUB_CLIENT_ID="your-github-client-id"
   GITHUB_CLIENT_SECRET="your-github-client-secret"
   ```

4. **Set up the database**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open [http://localhost:3000](http://localhost:3000)**

## Project Structure

```
insighthub/
├── app/
│   ├── (dashboard)/          # Protected dashboard pages
│   │   ├── dashboard/        # Main dashboard
│   │   ├── news/             # News feed & article detail
│   │   ├── sources/          # Source management
│   │   ├── bookmarks/        # Saved articles
│   │   ├── topics/           # Topic browser
│   │   ├── chat/             # AI chat assistant
│   │   ├── analytics/        # Analytics dashboard
│   │   └── settings/         # User settings
│   ├── api/                  # API routes
│   └── sign-in/              # Auth pages
├── components/
│   ├── ui/                   # Base UI components
│   ├── layout/               # Layout components
│   └── features/             # Feature-specific components
├── lib/
│   ├── db/                   # Database client
│   └── utils/                # Utility functions
├── services/                 # Business logic services
├── prisma/                   # Database schema
└── types/                    # TypeScript types
```

## Deployment

### Docker

```bash
docker-compose up -d
```

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

## License

MIT License - feel free to use this project for learning or production.

---

Built with ❤️ using Next.js 15, TypeScript, and OpenAI
