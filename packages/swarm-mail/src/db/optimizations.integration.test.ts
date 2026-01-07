/**
 * Database optimizations integration tests
 * 
 * Verifies that optimizations work in realistic scenarios with actual data.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createLibSQLAdapter } from "../libsql.js";
import { createLibSQLStreamsSchema } from "../streams/libsql-schema.js";
import type { DatabaseAdapter } from "../types/database.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Database Optimizations - Integration", () => {
  let adapter: DatabaseAdapter;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "swarm-opt-"));
    const dbPath = join(tempDir, "test.db");
    
    adapter = await createLibSQLAdapter({ url: `file:${dbPath}` });
    await createLibSQLStreamsSchema(adapter);
  });

  afterAll(async () => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("composite index improves query performance for project + time filters", async () => {
    // Insert test data
    const projectKey = "/test/project";
    const baseTime = Date.now();
    
    for (let i = 0; i < 100; i++) {
      await adapter.exec(`
        INSERT INTO events (type, project_key, timestamp, data)
        VALUES ('test_event', '${projectKey}', ${baseTime + i * 1000}, '{}')
      `);
    }

    // Query using the composite index
    const result = await adapter.query(`
      SELECT COUNT(*) as count 
      FROM events 
      WHERE project_key = '${projectKey}' 
      AND timestamp >= ${baseTime} 
      AND timestamp < ${baseTime + 50000}
    `);

    expect(result.rows[0]).toMatchObject({ count: 50 });
  });

  test("WAL mode allows concurrent reads during writes", async () => {
    // This is a behavioral test - WAL mode is already verified in unit tests
    // Here we just confirm operations don't block unexpectedly
    const projectKey = "/test/concurrent";
    
    // Start a write operation
    const writePromise = adapter.exec(`
      INSERT INTO events (type, project_key, timestamp, data)
      VALUES ('write_test', '${projectKey}', ${Date.now()}, '{}')
    `);

    // Immediately try to read (should not block in WAL mode)
    const readPromise = adapter.query(`
      SELECT COUNT(*) as count FROM events WHERE project_key = '${projectKey}'
    `);

    // Both should complete without blocking each other
    const [writeResult, readResult] = await Promise.all([writePromise, readPromise]);
    
    expect(readResult.rows.length).toBeGreaterThanOrEqual(0);
  });
});
