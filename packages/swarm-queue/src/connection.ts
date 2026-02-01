/**
 * Redis connection management with retry logic and graceful shutdown
 */

import Redis from "ioredis";
import type { QueueConfig } from "./types";

/**
 * Create Redis connection with retry logic
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection state logging
 * - Lazy connect to avoid hanging on init
 * - Graceful shutdown handling
 */
export function createConnection(
  config: QueueConfig["connection"]
): Redis {
  const connection = new Redis({
    host: config?.host || "localhost",
    port: config?.port || 6379,
    password: config?.password,
    db: config?.db || 0,
    // Lazy connect - don't block on connection
    lazyConnect: true,
    // Retry strategy with exponential backoff
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
  });

  // Connection lifecycle logging
  connection.on("connect", () => {
    console.log("[swarm-queue] Redis connecting...");
  });

  connection.on("ready", () => {
    console.log("[swarm-queue] Redis ready");
  });

  connection.on("error", (err) => {
    console.error("[swarm-queue] Redis error:", err.message);
  });

  connection.on("close", () => {
    console.log("[swarm-queue] Redis connection closed");
  });

  connection.on("reconnecting", (delay: number) => {
    console.log(`[swarm-queue] Redis reconnecting in ${delay}ms...`);
  });

  return connection;
}

/**
 * Gracefully close Redis connection
 *
 * Waits for pending commands to complete before closing
 */
export async function closeConnection(connection: Redis): Promise<void> {
  try {
    // Quit gracefully - waits for pending commands
    // This is safe to call even if already closed
    await connection.quit();
  } catch (err) {
    // Connection might already be closed - that's ok
    // Only force disconnect if we get an error for other reasons
    try {
      connection.disconnect();
    } catch {
      // Already disconnected - ignore
    }
  }
}
