import Redis from 'ioredis';
import { logger } from '@/lib/logger';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!redis) {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    redis.on('error', (err) => logger.warn({ err: err.message }, 'Redis connection error'));
  }
  return redis;
}

export async function redisRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number } | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    if (client.status !== 'ready') {
      await client.connect();
    }

    const key = `ratelimit:${identifier}`;
    const count = await client.incr(key);

    if (count === 1) {
      await client.pexpire(key, windowMs);
    }

    const ttl = await client.pttl(key);
    const resetAt = Math.floor((Date.now() + (ttl > 0 ? ttl : windowMs)) / 1000);

    if (count > maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - count),
      resetAt,
    };
  } catch (error) {
    logger.warn({ err: error }, 'Redis rate limit failed, falling back to DB');
    return null;
  }
}
