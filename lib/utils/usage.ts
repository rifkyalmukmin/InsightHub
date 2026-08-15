import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

/**
 * Daily per-user usage quotas for paid operations (OpenAI / Firecrawl).
 *
 * Each user+type+day gets a row in the `Usage` table. Every call to
 * `consumeUsage` atomically increments the counter and returns whether the
 * call is still within quota. Enforce the check BEFORE calling the paid API
 * so a single user (or a script) cannot burn an unbounded bill.
 *
 * Config (env):
 *   USAGE_DAILY_LIMIT_SUMMARIZE  — default 20
 *   USAGE_DAILY_LIMIT_CRAWL      — default 5
 *   USAGE_DAILY_LIMIT_CHAT       — default 100
 *   USAGE_DAILY_LIMIT_DIGEST     — default 10
 *   USAGE_GLOBAL_DAILY_BUDGET    — default 0 (disabled). Total paid calls per
 *                                  day across ALL users; acts as a hard stop
 *                                  when per-user limits are bypassed.
 *   USAGE_ALERT_THRESHOLD        — default 0.8. Fraction of the limit at which
 *                                  a warning is logged (budget alert).
 *   USAGE_RETENTION_DAYS         — default 7. Old rows are pruned lazily.
 *
 * A limit of 0 means "unlimited" for that type (no row is written).
 */

export type UsageType = 'summarize' | 'crawl' | 'chat' | 'digest';

const DEFAULT_LIMITS: Record<UsageType, number> = {
  summarize: 20,
  crawl: 5,
  chat: 100,
  digest: 10,
};

const DEFAULT_ALERT_THRESHOLD = 0.8;
const DEFAULT_RETENTION_DAYS = 7;

export interface UsageCheck {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** ISO timestamp when the daily quota resets. */
  resetAt: string;
}

function parseEnvInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseEnvFloat(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getDailyLimit(type: UsageType): number {
  return parseEnvInt(`USAGE_DAILY_LIMIT_${type.toUpperCase()}`, DEFAULT_LIMITS[type]);
}

export function getGlobalDailyBudget(): number {
  return parseEnvInt('USAGE_GLOBAL_DAILY_BUDGET', 0);
}

function getAlertThreshold(): number {
  return Math.min(1, parseEnvFloat('USAGE_ALERT_THRESHOLD', DEFAULT_ALERT_THRESHOLD));
}

/** UTC date bucket, e.g. "2026-08-15". */
export function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** ISO timestamp of the next UTC midnight. */
export function nextResetAt(date: Date = new Date()): string {
  const reset = new Date(date);
  reset.setUTCHours(24, 0, 0, 0);
  return reset.toISOString();
}

/** Lazily prune old usage rows (mirrors the rate-limit cleanup pattern). */
async function maybeCleanupOldUsage(): Promise<void> {
  const retentionDays = parseEnvInt('USAGE_RETENTION_DAYS', DEFAULT_RETENTION_DAYS);
  if (retentionDays <= 0 || Math.random() >= 0.01) return;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  try {
    await prisma.usage.deleteMany({ where: { date: { lt: todayKey(cutoff) } } });
  } catch (error) {
    logger.warn({ err: error }, 'Usage cleanup failed');
  }
}

/**
 * Atomically consumes one unit of the user's daily quota for `type`.
 * Returns `allowed: false` (with 429 semantics for the caller) when either the
 * per-user limit or the global daily budget is exceeded.
 *
 * Fails open (logs an error, allows the call) if the Usage table is missing or
 * the database errors — the app keeps working and ops sees the log.
 */
export async function consumeUsage(
  userId: string,
  type: UsageType
): Promise<UsageCheck> {
  const limit = getDailyLimit(type);
  const resetAt = nextResetAt();

  // 0 = unlimited for this type
  if (limit <= 0) {
    return { allowed: true, remaining: Infinity, limit: 0, resetAt };
  }

  const date = todayKey();
  const globalBudget = getGlobalDailyBudget();

  try {
    const { row, globalTotal } = await prisma.$transaction(async (tx) => {
      const row = await tx.usage.upsert({
        where: { userId_type_date: { userId, type, date } },
        create: { userId, type, date, count: 1 },
        update: { count: { increment: 1 } },
      });

      let globalTotal = 0;
      if (globalBudget > 0) {
        const agg = await tx.usage.aggregate({
          where: { date },
          _sum: { count: true },
        });
        globalTotal = agg._sum.count ?? 0;
      }

      return { row, globalTotal };
    });

    // Per-user daily limit exceeded
    if (row.count > limit) {
      logger.warn(
        { userId, type, count: row.count, limit, date },
        'Daily usage quota exceeded — blocking paid call'
      );
      return { allowed: false, remaining: 0, limit, resetAt };
    }

    // Global daily budget exceeded (safety valve across all users)
    if (globalBudget > 0 && globalTotal > globalBudget) {
      logger.warn(
        { userId, type, globalTotal, globalBudget, date },
        'Global daily budget exceeded — blocking paid call'
      );
      return { allowed: false, remaining: 0, limit: globalBudget, resetAt };
    }

    // Budget alert: warn as the quota approaches its limit (once per level).
    const alertAt = Math.max(1, Math.ceil(limit * getAlertThreshold()));
    if (row.count === alertAt) {
      logger.warn(
        { userId, type, count: row.count, limit, date },
        'Daily usage quota approaching limit'
      );
    }

    await maybeCleanupOldUsage();

    return { allowed: true, remaining: Math.max(0, limit - row.count), limit, resetAt };
  } catch (error) {
    logger.error(
      { err: error, userId, type, date },
      'Usage quota check failed — failing open'
    );
    return { allowed: true, remaining: Infinity, limit: 0, resetAt };
  }
}
