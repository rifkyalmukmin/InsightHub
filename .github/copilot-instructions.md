# .github/copilot-instructions.md

## Project Overview

InsightHub is an AI-powered news summarizer built with Next.js 15 App Router, TypeScript, Tailwind CSS, and OpenAI. It crawls news websites using Firecrawl, summarizes articles with GPT-4.1, and provides a modern analytics dashboard.

## Tech Stack

- **Framework**: Next.js 15 (App Router, Server Components)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS with shadcn/ui components
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: NextAuth.js (Google, GitHub, Credentials)
- **AI**: OpenAI GPT-4.1, GPT-4o-mini
- **Crawling**: Firecrawl API
- **State**: TanStack Query (React Query)
- **Charts**: Recharts
- **Animations**: Framer Motion

## Key Conventions

1. **File Naming**: Use kebab-case for files (e.g., `article-card.tsx`)
2. **Components**: Export default function components
3. **API Routes**: Use Next.js App Router API routes in `app/api/`
4. **Database**: Use Prisma client singleton from `@/lib/db/prisma`
5. **Styling**: Use Tailwind CSS classes; prefer utility classes over custom CSS
6. **Types**: Define interfaces in `types/index.ts`; use TypeScript strictly
7. **Error Handling**: Return proper HTTP status codes; use try-catch in API routes
8. **Rate Limiting**: Apply rate limiting to all API routes using `lib/utils/rateLimit.ts`

## Component Patterns

```tsx
'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';

export default function MyComponent() {
  // hooks...
  return <Card>...</Card>;
}
```

## API Route Patterns

```ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export async function GET() {
  try {
    const data = await prisma.model.findMany();
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

## Database Schema Location

`prisma/schema.prisma` contains all models with relations, indexes, and cascading deletes.

## Environment Variables

Required variables are documented in `.env.example`:
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `OPENAI_API_KEY`
- `FIRECRAWL_API_KEY`
- OAuth credentials (optional)

## Running the Project

```bash
npm install
npx prisma migrate dev
npx prisma generate
npm run dev
```

Open http://localhost:3000

## Important Notes

- Always use the Prisma singleton to avoid connection issues in development
- Server components by default; use 'use client' for interactive components
- Use TanStack Query for all client-side data fetching
- Implement proper loading and error states with Skeleton components
- Support dark mode using next-themes
- Ensure responsive design (mobile-first approach)
