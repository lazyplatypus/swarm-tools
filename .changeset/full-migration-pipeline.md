---
"opencode-swarm-plugin": minor
---

Add full beads→hive migration pipeline with JSONL import to PGLite

- Add `mergeHistoricBeads()` to merge beads.base.jsonl into issues.jsonl
- Add `importJsonlToPGLite()` to import JSONL records into PGLite database
- Wire both functions into `swarm setup` migration flow
- Fix closed_at constraint issue when importing closed cells
- TDD: 12 new integration tests for migration functions
