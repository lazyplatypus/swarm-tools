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
