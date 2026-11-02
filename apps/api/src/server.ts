import { createServer } from 'node:http';
import { createClient } from 'redis';
import RedisStore from 'rate-limit-redis';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logger.js';

const redisClient = env.REDIS_URL
  ? createClient({ url: env.REDIS_URL })
  : undefined;
if (redisClient) {
  redisClient.on('error', (error) =>
    logger.error({ err: error }, 'Redis client error'),
  );
  try {
    await redisClient.connect();
  } catch (error) {
    logger.fatal(
      { err: error },
      'Configured Redis connection failed; API startup aborted',
    );
    process.exit(1);
  }
}

const app = createApp(
  env,
  redisClient
    ? (prefix) =>
        new RedisStore({
          prefix,
          sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        })
    : undefined,
);
const server = createServer(app);
server.listen(env.PORT, () =>
  logger.info({ port: env.PORT }, 'API server listening'),
);

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'HTTP server shutdown failed');
      process.exitCode = 1;
    }
    void redisClient
      ?.quit()
      .catch((shutdownError) =>
        logger.error(
          {
            errorName:
              shutdownError instanceof Error
                ? shutdownError.name
                : 'UnknownError',
          },
          'Redis shutdown failed',
        ),
      )
      .finally(() => process.exit());
    if (!redisClient) process.exit();
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
