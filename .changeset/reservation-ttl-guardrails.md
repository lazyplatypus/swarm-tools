---
"opencode-swarm-plugin": minor
---

> "They can be applied again and again in similar situations to help you achieve your goals."
> — Principles: Life and Work

## Enforce reservation TTLs and release-all guardrails

Swarm reservations now require explicit `ttl_seconds` and release-on-done behavior via `swarm_complete()` to prevent stale locks.

**Impact**: Workers must pass `ttl_seconds` when reserving files and should rely on completion cleanup; `swarmmail_release_all` is restricted to coordinators for orphaned lock recovery.

**Compatibility**: Existing calls without `ttl_seconds` must be updated; other workflows are unaffected.
