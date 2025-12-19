---
"swarm-mail": minor
"opencode-swarm-plugin": minor
---

## Smart ID Resolution: Git-Style Partial Hashes for Hive

```
┌─────────────────────────────────────────────────────────────┐
│  BEFORE: hive_close(id="opencode-swarm-monorepo-lf2p4u-mjcadqq3fb9")  │
│  AFTER:  hive_close(id="mjcadqq3fb9")                                 │
└─────────────────────────────────────────────────────────────┘
```

Cell IDs got long. Now you can use just the hash portion.

**What changed:**

### swarm-mail
- Added `resolvePartialId(adapter, partialId)` to resolve partial hashes to full cell IDs
- Supports exact match, prefix match, suffix match, and substring match
- Returns helpful error messages for ambiguous matches ("Found 3 cells matching 'abc': ...")
- 36 new tests covering all resolution scenarios

### opencode-swarm-plugin
- `hive_update`, `hive_close`, `hive_start` now accept partial IDs
- Resolution happens transparently - full ID returned in response
- Backward compatible - full IDs still work

**JSONL Fix (bonus):**
- `serializeToJSONL()` now adds trailing newline for POSIX compliance
- Prevents parse errors when appending to existing files

**Why it matters:**
- Less typing, fewer copy-paste errors
- Matches git's partial SHA workflow (muscle memory)
- Ambiguous matches fail fast with actionable error messages

> "The best interface is no interface" - Golden Krishna
> (But if you must have one, make it forgive typos)

---

## Auto-Sync at Key Events

```
┌─────────────────────────────────────────┐
│  hive_create_epic  →  auto-sync         │
│  swarm_complete    →  auto-sync         │
│  process.exit      →  safety net sync   │
└─────────────────────────────────────────┘
```

Cells no longer get lost when processes exit unexpectedly.

**What changed:**
- `hive_create_epic` syncs after creating epic + subtasks (workers can see them immediately)
- `swarm_complete` syncs before worker exits (completed work persists)
- `process.on('beforeExit')` hook catches any remaining dirty cells

**Why it matters:**
- Spawned workers couldn't see cells created by coordinator (race condition)
- Worker crashes could lose completed work
- Now the lazy-write pattern has strategic checkpoints

---

## Removed Arbitrary Subtask Limits

```
BEFORE: max_subtasks capped at 10 (why tho?)
AFTER:  no limit - LLM decides based on task complexity
```

**What changed:**
- Removed `.max(10)` from `swarm_decompose` and `swarm_plan_prompt`
- `max_subtasks` is now optional with no default
- Prompt says "as many as needed" instead of "2-10"

**Why it matters:**
- Complex epics need more than 10 subtasks
- Arbitrary limits force awkward decomposition
- Trust the coordinator to make good decisions
