# Event Capture Implementation Notes

## Summary

Implemented 1 of 3 missing event captures in this session:

✅ **COMPACTION.prompt_generated** - Wired to compaction-hook.ts (COMPLETE)
📝 **OUTCOME.epic_complete** - Needs wiring to hive_close() (OUT OF SCOPE - different file)
📝 **OUTCOME.subtask_retry** - Needs wiring to swarm_review_feedback() (OUT OF SCOPE - different file)

## Completed: prompt_generated

**File Modified:** `packages/opencode-swarm-plugin/src/compaction-hook.ts`

**Changes:**
1. Added import: `import { captureCompactionEvent } from "./eval-capture"`
2. Extract epicId variable after detection (line 1077)
3. Added `detection_complete` event capture after detection phase (lines 1078-1090)
4. Added `prompt_generated` event capture after full context injection (lines 1124-1135)
5. Added `prompt_generated` event capture after fallback context injection (lines 1167-1176)

**Event Payload:**
```typescript
{
  session_id: string,
  epic_id: string,
  compaction_type: "prompt_generated",
  payload: {
    prompt_length: number,
    full_prompt: string,  // FULL content, not truncated - used for eval scoring
    context_type: "full" | "fallback",
    confidence: "high" | "medium" | "low",
  }
}
```

**Test Coverage:**
- File: `packages/opencode-swarm-plugin/src/compaction-event-capture.test.ts`
- 6 tests written (TDD - RED, GREEN)
- All pass ✅
- Existing compaction-hook.test.ts still passes (46 tests)

**Why Full Prompt?**
The eval pipeline (compaction-prompt.eval.ts) scores prompt quality based on:
- ID specificity (does it mention epic_id?)
- Actionability (does it list concrete next steps?)
- Coordinator identity (does it emphasize orchestration role?)

Truncating the prompt would break these scorers.

---

## Remaining: epic_complete

**Where to Wire:** `packages/opencode-swarm-plugin/src/hive.ts` (or wherever `hive_close` is implemented)

**Trigger:** When closing a cell with `issue_type === "epic"` and all subtasks are closed

**Implementation Pattern:**
```typescript
// In hive_close() function
if (cell.type === "epic") {
  // Check if all child cells are closed
  const children = await adapter.queryCells(projectPath, { parent_id: cellId });
  const allClosed = children.every(c => c.status === "closed");
  
  if (allClosed) {
    await captureCoordinatorEvent({
      session_id: getCurrentSessionId(), // May need to pass this in
      epic_id: cellId,
      timestamp: new Date().toISOString(),
      event_type: "OUTCOME",
      outcome_type: "epic_complete",
      payload: {
        total_duration_ms: children.reduce((sum, c) => sum + (c.duration_ms || 0), 0),
        subtask_count: children.length,
        all_files_touched: Array.from(new Set(children.flatMap(c => c.files_touched || []))),
      },
    });
  }
}
```

**Blocker:** Need to determine how to get `session_id` in hive_close context. Options:
1. Thread it through from caller (swarm_complete → hive_close)
2. Store in global state (risky)
3. Make it optional in schema (session_id? - breaks eval expectations)

**Test File:** `packages/opencode-swarm-plugin/src/hive.test.ts` (or new file for epic events)

---

## Remaining: subtask_retry

**Where to Wire:** Wherever `swarm_review_feedback` is implemented (likely `src/swarm-review.ts` or `src/swarm-coordination.ts`)

**Trigger:** When `status === "needs_changes"` in swarm_review_feedback

**Implementation Pattern:**
```typescript
// In swarm_review_feedback() function
export async function swarmReviewFeedback(params: {
  project_key: string;
  task_id: string;
  worker_id: string;
  status: "approved" | "needs_changes";
  issues?: string;
}) {
  // ... existing logic ...
  
  if (params.status === "needs_changes") {
    // Track retry count (may need to query existing events or track in metadata)
    const retryCount = await getRetryCount(params.task_id); // Implement this
    
    await captureCoordinatorEvent({
      session_id: getCurrentSessionId(), // Same session_id problem
      epic_id: params.epic_id, // Need to pass epic_id in params
      timestamp: new Date().toISOString(),
      event_type: "OUTCOME",
      outcome_type: "subtask_retry",
      payload: {
        task_id: params.task_id,
        worker_id: params.worker_id,
        retry_count: retryCount + 1,
        issues: params.issues,
      },
    });
  }
}
```

**Blockers:**
1. Same session_id problem as epic_complete
2. Need to track retry_count per subtask (could query coordinator_outcome events for prior subtask_retry events)
3. Need epic_id in swarm_review_feedback signature

**Test File:** `packages/opencode-swarm-plugin/src/swarm-review.test.ts` (or wherever review logic tests live)

---

## General Pattern for Event Captures

**Setup:**
```typescript
import { captureCoordinatorEvent } from "./eval-capture";
// OR for compaction-specific:
import { captureCompactionEvent } from "./eval-capture";
```

**Capture:**
```typescript
await captureCoordinatorEvent({
  session_id: string,
  epic_id: string,
  timestamp: new Date().toISOString(),
  event_type: "DECISION" | "VIOLATION" | "OUTCOME" | "COMPACTION",
  [decision_type | violation_type | outcome_type | compaction_type]: string,
  payload: any,
});
```

**Storage:**
- Events go to libSQL via `swarmMail.appendEvent()`
- Fallback to JSONL if libSQL fails (for tests/migration period)
- Queryable via observability-tools.ts

**Testing:**
```typescript
import { spyOn } from "bun:test";
import * as evalCapture from "./eval-capture";

const spy = spyOn(evalCapture, "captureCoordinatorEvent").mockResolvedValue(undefined);
// ... run code that should emit event ...
expect(spy).toHaveBeenCalledWith(expect.objectContaining({
  event_type: "OUTCOME",
  outcome_type: "epic_complete",
}));
```

---

## Next Steps (for other workers)

1. **epic_complete:**
   - Find where hive_close is implemented
   - Add event capture after verifying all subtasks closed
   - Thread session_id through call chain OR make it optional in schema
   - Write tests

2. **subtask_retry:**
   - Find where swarm_review_feedback is implemented
   - Add event capture when status="needs_changes"
   - Track retry_count (query existing events or add to metadata)
   - Thread session_id and epic_id through params
   - Write tests

3. **Integration Testing:**
   - Run full eval suite to verify events are captured correctly
   - Check that compaction-prompt.eval.ts gets the data it needs
   - Verify event ordering (detection_complete before prompt_generated, etc.)
