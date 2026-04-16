import IORedis from "ioredis";
import { getEnv } from "@/lib/env";

const env = getEnv();

export const redis = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null
});
