import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

/**
 * pino-pretty uses worker threads (thread-stream) which break when bundled
 * by Next.js/webpack. Only enable pretty transport in standalone scripts
 * (e.g. `npm run worker`) where NEXT_RUNTIME is not set.
 */
const isNextRuntime = Boolean(process.env.NEXT_RUNTIME);

export const logger = pino(
  isDev && !isNextRuntime
    ? {
        level,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }
    : { level }
);

export function logError(context: string, error: unknown, meta?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error({ context, err: message, ...meta }, `${context} failed`);
}
