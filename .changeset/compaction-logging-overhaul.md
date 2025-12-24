---
"opencode-swarm-plugin": minor
---

## 🔬 Compaction Hook: Now With X-Ray Vision

The compaction hook was logging to `console.log` like a caveman. Now it writes structured JSON logs to `~/.config/swarm-tools/logs/compaction.log` - visible via `swarm log compaction`.

**The Problem:**
- Plugin wrapper used `console.log` → stdout → invisible
- npm package had pino logging → but wrapper didn't use it
- Running `/compact` gave zero visibility into what happened

**The Fix:**
Added comprehensive file-based logging throughout the compaction flow:

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPACTION LOGGING                       │
├─────────────────────────────────────────────────────────────┤
│  compaction_hook_invoked     │ Full input/output objects    │
│  detect_swarm_*              │ CLI calls, cells, confidence │
│  query_swarm_state_*         │ Epic/subtask extraction      │
│  generate_compaction_prompt_*│ LLM timing, success/failure  │
│  context_injected_via_*      │ Which API used               │
│  compaction_complete_*       │ Final result + timing        │
└─────────────────────────────────────────────────────────────┘
```

**Also Enhanced:**
- SDK message scanning for precise swarm state extraction
- Merged scanned state (ground truth) with hive detection (heuristic)
- 9 new tests for `scanSessionMessages()` (32 total passing)

**To See It Work:**
```bash
swarm setup --reinstall  # Regenerate plugin wrapper
# Run /compact in OpenCode
swarm log compaction     # See what happened
```
