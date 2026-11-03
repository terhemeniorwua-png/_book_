import { createServer } from 'node:http';
import { createClient } from 'redis';
import RedisStore from 'rate-limit-redis';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { sequelize } from './db/client.js';

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
    void Promise.allSettled([
      sequelize.close(),
      redisClient?.quit() ?? Promise.resolve(),
    ]).then((results) => {
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length) {
        process.exitCode = 1;
        logger.error(
          { shutdownErrors: failed.length },
          'A dependency failed during shutdown',
        );
      }
      process.exit();
    });
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
