import IORedis, { type Redis } from "ioredis";
import { getEnv } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/**
 * Shared ioredis connection for BullMQ. Using a single process-wide connection
 * avoids exhausting Redis when Next.js hot-reloads in dev.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ workers.
 */
export const redis: Redis =
  globalForRedis.redis ??
  new IORedis(getEnv().redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
