---
"swarm-mail": minor
"opencode-swarm-plugin": minor
---

Rename beads → hive across the codebase

- `createBeadsAdapter` → `createHiveAdapter` (old name still exported as alias)
- `BeadsAdapter` type → `HiveAdapter` type
- All internal references updated to use hive terminology
- Backward compatible: old exports still work but are deprecated
