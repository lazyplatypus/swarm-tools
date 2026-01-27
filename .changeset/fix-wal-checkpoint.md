---
"swarm-mail": patch
---

fix: implement WAL checkpoint to prevent hive cell loss across process restarts

LibSQLAdapter now implements `checkpoint()` (PRAGMA wal_checkpoint(TRUNCATE)) so `db.checkpoint?.()` calls are no longer no-ops. Also checkpoints on connection open to recover abandoned WAL frames from prior short-lived processes (e.g., `swarm tool` CLI invocations via clawdbot).
