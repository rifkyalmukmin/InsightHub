import { rateLimit as rateLimitPrisma, withRateLimit as withRateLimitPrisma } from './rateLimit-prisma';

export const rateLimit = rateLimitPrisma;
export const withRateLimit = withRateLimitPrisma;
