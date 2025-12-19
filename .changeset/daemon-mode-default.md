---
"swarm-mail": major
---

## 🐝 The Daemon Awakens: Multi-Process Safety by Default

PGlite is single-connection. Multiple processes = corruption. We learned this the hard way.

**Now it just works.**

### What Changed

**Daemon mode is the default.** When you call `getSwarmMail()`, we:
1. Start an in-process `PGLiteSocketServer` (no external binary!)
2. All connections go through this server
3. Multiple processes? No problem. They all talk to the same daemon.

```typescript
// Before: Each process creates its own PGlite → 💥 corruption
const swarmMail = await getSwarmMail('/project')

// After: First process starts daemon, others connect → ✅ safe
const swarmMail = await getSwarmMail('/project')
```

### Opt-Out (if you must)

```bash
# Single-process mode (embedded PGlite)
SWARM_MAIL_SOCKET=false
```

⚠️ Only use embedded mode when you're **certain** only one process accesses the database.

### Bonus: 9x Faster Tests

We added a shared test server pattern. Instead of creating a new PGlite instance per test (~500ms WASM startup), tests share one instance and TRUNCATE between runs.

| Metric | Before | After |
|--------|--------|-------|
| adapter.test.ts | 8.63s | 0.96s |
| Per-test average | 345ms | 38ms |

### Breaking Change

If you were relying on embedded mode being the default, set `SWARM_MAIL_SOCKET=false`.

### The Architecture

```
┌─────────────────────────────────────────┐
│  Process 1      Process 2      ...      │
│      │              │                   │
│      └──────┬───────┘                   │
│             ▼                           │
│   ┌───────────────────┐                 │
│   │ PGLiteSocketServer │ (in-process)   │
│   │      + PGlite      │                │
│   └───────────────────┘                 │
│             │                           │
│             ▼                           │
│   ┌───────────────────┐                 │
│   │   Your Data 🍯    │                 │
│   └───────────────────┘                 │
└─────────────────────────────────────────┘
```

No external binaries. No global installs. Just safety.
