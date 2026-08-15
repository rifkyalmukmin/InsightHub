import { z } from 'zod';

/**
 * Shared Zod validation schemas for all API routes.
 * Centralizing schemas here keeps validation consistent and DRY.
 */

// ─── Articles ────────────────────────────────────────────────────────────────

export const articleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  query: z.string().trim().max(500).optional(),
  topic: z.string().trim().max(100).optional(),
  source: z.string().trim().max(100).optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export const articleIdSchema = z.object({
  id: z.string().min(1).max(100),
});

// ─── Sources ─────────────────────────────────────────────────────────────────

export const autoRefreshSchema = z.enum(['none', 'daily', 'weekly', 'monthly']);

export const createSourceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().min(1).max(253),
  url: z.string().url().max(2048),
  feedUrl: z.string().url().max(2048).optional(),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(100).optional(),
  autoRefresh: autoRefreshSchema.default('none'),
});

export const updateSourceSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  domain: z.string().trim().min(1).max(253).optional(),
  url: z.string().url().max(2048).optional(),
  feedUrl: z.string().url().max(2048).nullable().optional(),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'paused', 'error']).optional(),
  autoRefresh: autoRefreshSchema.optional(),
});

// ─── Bookmarks ───────────────────────────────────────────────────────────────

export const bookmarkQuerySchema = z.object({
  type: z.enum(['bookmark', 'favorite']).optional(),
  collection: z.string().trim().max(100).optional(),
});

export const createBookmarkSchema = z.object({
  articleId: z.string().min(1).max(100),
  type: z.enum(['bookmark', 'favorite']).default('bookmark'),
  collection: z.string().trim().max(100).optional(),
  note: z.string().trim().max(2000).optional(),
});

// ─── Topics ──────────────────────────────────────────────────────────────────

export const createTopicSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g. #3B82F6)')
    .optional(),
  icon: z.string().trim().max(50).optional(),
});

// ─── Crawl ───────────────────────────────────────────────────────────────────

export const crawlSchema = z.object({
  url: z.string().url().max(2048),
  sourceId: z.string().min(1).max(100).optional(),
  maxPages: z.number().int().min(1).max(100).default(10),
  depth: z.number().int().min(1).max(5).default(1),
});

// ─── Summarize ───────────────────────────────────────────────────────────────

export const summarizeSchema = z.object({
  articleId: z.string().min(1).max(100),
  model: z.enum(['gpt-4o', 'gpt-4o-mini']).optional(),
});

// ─── Digest ───────────────────────────────────────────────────────────────────

export const digestSchema = z.object({
  type: z.enum(['morning', 'evening', 'weekly', 'monthly']),
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const exportSchema = z.object({
  articleIds: z.array(z.string().min(1).max(100)).min(1).max(100),
  format: z.enum(['pdf', 'markdown', 'csv']),
});

// ─── Chat ────────────────────────────────────────────────────────────────────

export const chatSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  conversationId: z.string().min(1).max(100).optional(),
  topicId: z.string().min(1).max(100).optional(),
  model: z.enum(['gpt-4o', 'gpt-4o-mini']).optional(),
  stream: z.boolean().default(false),
});

// ─── Notifications ────────────────────────────────────────────────────────────

export const markAllReadSchema = z.object({
  markAllRead: z.literal(true),
});

// ─── Register (already exists, kept here for consistency) ────────────────────

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Safely parses a JSON request body against a Zod schema.
 * Returns `{ success: true, data }` or `{ success: false, error }`.
 *
 * The `data` type is the schema's *output* type, so fields with `.default()`
 * are inferred as present (not `| undefined`) — callers get the value the
 * schema actually produces after parsing.
 */
export function validateBody<Schema extends z.ZodTypeAny>(
  schema: Schema,
  body: unknown
): { success: true; data: z.output<Schema> } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.issues[0];
  return {
    success: false,
    error: firstError ? `${firstError.path.join('.')}: ${firstError.message}` : 'Invalid input',
  };
}

/**
 * Safely parses URL search params against a Zod schema.
 * Returns `{ success: true, data }` or `{ success: false, error }`.
 */
export function validateQuery<T>(
  schema: z.ZodSchema<T>,
  searchParams: URLSearchParams
): { success: true; data: T } | { success: false; error: string } {
  const obj: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    obj[key] = value;
  });
  return validateBody(schema, obj);
}
