---
"opencode-swarm-plugin": minor
---

feat: UserPromptSubmit hook now injects timestamp and semantic memory recall

- **Timestamp injection**: Every prompt now includes current date/time for temporal awareness
- **Semantic memory recall**: Automatically searches hivemind for relevant memories on each prompt
  - Queries with prompt text, returns top 3 matches
  - Filters to high-confidence matches (score > 0.5)
  - Injects up to 2 relevant memory snippets as context
- Uses local memory adapter wrapper for proper db type conversion
