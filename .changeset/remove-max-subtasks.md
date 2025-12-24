---
"opencode-swarm-plugin": patch
---

## 🐝 Swarm Workers Unchained

Removed the vestigial `max_subtasks` parameter from decomposition tools. It was dead code - the prompts already say "as many as needed" and the replacement was doing nothing.

**What changed:**
- Removed `max_subtasks` arg from `swarm_decompose`, `swarm_plan_prompt`, `swarm_delegate_planning`
- Removed from `DecomposeArgsSchema`
- Renamed `max_subtasks` → `subtask_count` in eval capture (records actual count, not a limit)
- Cleaned up tests that were passing the unused parameter

**Why it matters:**
The LLM decides how many subtasks based on task complexity, not an arbitrary cap. "Plan aggressively" means spawn as many workers as the task needs.

**No functional change** - the parameter wasn't being used anyway.
