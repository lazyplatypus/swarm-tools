---
"opencode-swarm-plugin": minor
---

> "Smart defaults can help people answer questions by putting default selections in place that serve the interests of most people."
> — Web Form Design: Filling in the Blanks

## Default model switch to openai/gpt-5.2-codex

Opencode now defaults to `openai/gpt-5.2-codex` for swarm coordination instead of the previous model. The goal is a more consistent out-of-the-box baseline for OpenCode users, aligned with current model availability and performance.

**Impact**: New sessions that do not explicitly set a model will start with `openai/gpt-5.2-codex` as the default.

**Compatibility**: Any existing configuration that pins a different model continues to take precedence; no migration is required.
