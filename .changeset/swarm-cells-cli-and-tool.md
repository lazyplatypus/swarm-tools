---
"opencode-swarm-plugin": minor
---

## 🐝 `swarm cells` - Query Your Hive Like a Pro

New CLI command AND plugin tool for querying cells directly from the database.

### CLI: `swarm cells`

```bash
swarm cells                      # List all cells (table format)
swarm cells --status open        # Filter by status
swarm cells --type bug           # Filter by type  
swarm cells --ready              # Next unblocked cell
swarm cells mjkmd                # Partial ID lookup
swarm cells --json               # Raw JSON for scripting
```

**Replaces:** The awkward `swarm tool hive_query --json '{"status":"open"}'` pattern.

### Plugin Tool: `hive_cells`

```typescript
// Agents can now query cells directly
hive_cells({ status: "open", type: "task" })
hive_cells({ id: "mjkmd" })  // Partial ID works!
hive_cells({ ready: true })   // Next unblocked
```

**Why this matters:**
- Reads from DATABASE (fast, indexed) not JSONL files
- Partial ID resolution built-in
- Consistent JSON array output
- Rich descriptions encourage agentic use

### Also Fixed

- `swarm_review_feedback` tests updated for coordinator-driven retry architecture
- 425 tests passing
