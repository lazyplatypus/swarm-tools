# Swarm System Improvement Roadmap

**Date:** 2026-01-07  
**Synthesized From:** 4 audit reports (coordinator, worker, system health, learning system)  
**Status:** 🎯 Ready for Implementation

---

## Executive Summary

The swarm system is **operationally excellent** (99.6% coordinator compliance, 100% worker success) but has **critical infrastructure gaps** that prevent learning and create technical debt.

```
┌─────────────────────────────────────────────────────────────────┐
│                   SYSTEM HEALTH SCORECARD                       │
├─────────────────────────────────────────────────────────────────┤
│  Coordinator Discipline:    A  (99.6% compliance)               │
│  Worker Efficiency:         A  (100% success, 46s avg)          │
│  Database Health:          D  (98% bloat, broken timestamps)    │
│  Learning System:          F  (built but not wired)             │
│                                                                 │
│  OVERALL GRADE:            C+ (functional but not improving)    │
└─────────────────────────────────────────────────────────────────┘
```

**Impact of Gaps:**
- ❌ System doesn't learn from outcomes (feedback loop open)
- ❌ 1.35GB wasted storage (97% unused vector index)
- ❌ Cannot query events by time (timestamp format broken)
- ❌ Conflict hotspot in event-router.ts (9 overlaps)
- ❌ Pattern maturity never tracked (0 records)

**Cost of Inaction:**
- Database grows 77 MB/day → 8.3 GB in 90 days (unsustainable)
- Failed patterns persist indefinitely (no anti-pattern detection)
- Parallel swarms risk conflicts (no coordination on hot files)
- Manual analysis required forever (no self-improvement)

---

## Top 5 Highest-Impact Improvements

### 1. 🔴 CRITICAL: Close the Learning Feedback Loop

**Problem:** Feedback loop is incomplete - outcomes don't feed back into pattern weights or maturity tracking. `scoreOutcome()` function exists but is never called.

**Evidence:**
- 0 pattern maturity records (despite infrastructure existing)
- 0 feedback events stored
- 0 anti-patterns detected
- eval_records 83% incomplete (25/30 missing outcomes)

**Impact:** System accumulates knowledge but doesn't improve from experience. Bad patterns persist, good patterns aren't prioritized.

**Solution:**
1. Wire `swarm_complete` to call `scoreOutcome()` after every subtask
2. Store feedback events with helpful/harmful/neutral scores
3. Create pattern maturity records on first use
4. Update pattern maturity after each outcome
5. Apply weight multipliers (candidate: 0.5x, proven: 1.5x, deprecated: 0x)

**Implementation:**
```typescript
// In swarm_complete:
const outcome: OutcomeSignals = {
  bead_id: subtaskId,
  duration_ms: endTime - startTime,
  error_count: errors.length,
  retry_count: retries,
  success: exitCode === 0,
  files_touched: modifiedFiles,
  timestamp: new Date().toISOString(),
  strategy: decompositionStrategy
};

const scored = scoreOutcome(outcome, learningConfig);
await storage.storeFeedback({
  criterion: scored.signals.strategy,
  type: scored.type, // 'helpful' or 'harmful'
  bead_id: outcome.bead_id,
  raw_value: scored.decayed_value
});

await updatePatternMaturity(scored.signals.strategy, outcome);
```

**Effort:** 2-3 days  
**Benefit:** System learns from experience, improves decomposition quality over time  
**Blockers:** None  
**Cell Created:** See "Implementation Cells" section below

---

### 2. 🔴 CRITICAL: Drop Unused Vector Index (Reclaim 1.35GB)

**Problem:** Database is 1.4GB but 98% (1.35GB) is a single vector index (`idx_memories_embedding_shadow`) for a table that's EMPTY. Vector extension (`libsql_vector_idx`) not loaded.

**Evidence:**
- `memories` table: 0 rows
- Vector index: 1.35GB
- Database integrity check: FAILED (libsql_vector_idx function missing)
- Growth rate: 77 MB/day → 8.3 GB in 90 days

**Impact:** 
- Wasted 1.35GB storage (97% of database)
- Slow startup and high memory usage
- Unsustainable growth trajectory

**Solution:**
```sql
-- Option 1: Drop index if unused
DROP INDEX IF EXISTS idx_memories_embedding_shadow;
VACUUM;

-- Option 2: If memories are used elsewhere, rebuild properly
-- Check if embeddings are actually needed first
```

**Investigation Required:**
1. Confirm memories table is genuinely unused (check Hivemind integration)
2. If used: Fix vector extension loading OR migrate to alternative search
3. If unused: Drop index and reclaim 1.35GB

**Effort:** 4 hours (investigation + execution)  
**Benefit:** Database shrinks from 1.4GB → 30MB (97% reduction)  
**Blockers:** Need to verify memories table usage in Hivemind  
**Cell Created:** See "Implementation Cells" section below

---

### 3. 🟡 HIGH: Refactor event-router.ts (Reduce Conflict Hotspot)

**Problem:** `packages/core/src/world/event-router.ts` has 9 overlapping file reservations - highest conflict rate in codebase. Bottleneck for parallel swarms.

**Evidence:**
- 9 overlapping reservations (3x more than next file)
- World package has 17 total overlaps (merged-stream.ts: 5, sse.ts: 3)
- Overall conflict rate: 9.2% of files

**Impact:**
- Serial execution forced when parallel is possible
- Worker coordination overhead
- Risk of edit conflicts

**Solution:**
- Extract event routing logic into multiple files (by event type or domain)
- Consider event bus pattern with pub/sub to reduce central coordination
- Use lock-free data structures where possible

**Architecture Options:**
1. **File Split:** event-router.ts → {user-events.ts, world-events.ts, system-events.ts}
2. **Event Bus:** Replace centralized router with pub/sub pattern
3. **Lock-Free Queue:** Use concurrent data structures for event dispatch

**Effort:** 2-3 days (investigation + refactor + tests)  
**Benefit:** Enable true parallel work on World package, reduce coordination overhead  
**Blockers:** Need architectural review of event routing patterns  
**Cell Created:** See "Implementation Cells" section below

---

### 4. 🟡 HIGH: Fix Timestamp Format (Enable Time-Based Queries)

**Problem:** 70% of events (1,642/2,344) use `datetime('now')` string literal instead of numeric millisecond timestamp. This breaks time-based queries and indexes.

**Evidence:**
```sql
SELECT timestamp FROM events WHERE type='cell_created' LIMIT 5;
-- Returns: "datetime('now')", "datetime('now')", ...
-- Expected: 1736267511000, 1736267512000, ...
```

**Impact:**
- Cannot query events by time range
- Cannot calculate durations
- Breaks temporal analytics and dashboards
- Time-based indexes useless

**Solution:**
1. Fix event creation to use `Date.now()` instead of `datetime('now')`
2. Migrate existing records:
   ```sql
   UPDATE events 
   SET timestamp = strftime('%s', created_at) * 1000 
   WHERE timestamp = 'datetime(''now'')';
   ```
3. Add validation to prevent regression

**Code Locations:**
- Event creation in `packages/swarm-mail/src/event-store.ts`
- All calls to `storeEvent()` that pass timestamp

**Effort:** 1 day (fix + migration + validation)  
**Benefit:** Enables all time-based analytics, fixes 1,642 broken records  
**Blockers:** None  
**Cell Created:** See "Implementation Cells" section below

---

### 5. 🟢 MEDIUM: Expand Precedent Citation Beyond Strategy Selection

**Problem:** Precedent citation implemented but only used for strategy selection (3/182 decisions cite precedent). Worker spawns and reviews never cite past patterns.

**Evidence:**
- strategy_selection: 3/5 cite precedent (60%)
- worker_spawn: 0/109 cite precedent (0%)
- review_decision: 0/65 cite precedent (0%)

**Impact:** Missing opportunities to learn from past successes. Agents make decisions without context of what worked before.

**Solution:**
1. Worker spawn: Cite past successful file groupings
   ```typescript
   const precedent = await queryMemories({
     query: `successful worker spawn for ${files.join(", ")}`,
     limit: 3
   });
   ```

2. Review decisions: Cite past similar review outcomes
   ```typescript
   const precedent = await queryMemories({
     query: `review outcome for ${taskType} with ${filesCount} files`,
     limit: 3
   });
   ```

3. Scope changes: Cite past scope expansion outcomes

**Effort:** 2-3 days (expand citation logic + test)  
**Benefit:** Better decision-making through precedent, clearer audit trail  
**Blockers:** Depends on #1 (feedback loop) for meaningful precedents  
**Cell Created:** See "Implementation Cells" section below

---

## Quick Wins (< 1 Day Effort)

### 6. 🟢 Clean Test Sessions (Reclaim 3.3MB)

**Problem:** Test sessions not cleaned up - 6 files (0.7% of total) consume 43.8% of sessions storage.

**Files:**
- test-session.jsonl (2.4 MB)
- test.jsonl (719 KB)
- test-session-123.jsonl (190 KB)

**Solution:**
```bash
cd ~/.config/swarm-tools/sessions/
rm test*.jsonl
rm no-context*.jsonl
rm timing-test*.jsonl
```

**Effort:** 10 minutes  
**Benefit:** Reclaim 3.3MB (37% of sessions storage), cleaner metrics  
**Cell Created:** See "Implementation Cells" section below

---

### 7. 🟢 Add Missing Index for Project-Scoped Time Queries

**Problem:** Common query pattern `events(project_key, timestamp)` has no index - causes full table scans.

**Solution:**
```sql
CREATE INDEX idx_events_project_timestamp 
ON events(project_key, timestamp);
```

**Effort:** 5 minutes  
**Benefit:** 10-100x faster project-scoped time queries  
**Cell Created:** See "Implementation Cells" section below

---

### 8. 🟢 Enable Auto Vacuum

**Problem:** Deleted data doesn't reclaim space - requires manual `VACUUM`.

**Solution:**
```sql
PRAGMA auto_vacuum = INCREMENTAL;
VACUUM;  -- One-time rebuild
```

**Effort:** 15 minutes  
**Benefit:** Automatic space reclamation on DELETE operations  
**Cell Created:** See "Implementation Cells" section below

---

### 9. 🟢 Switch to WAL Journal Mode

**Problem:** Journal mode is DELETE - suboptimal write concurrency.

**Solution:**
```sql
PRAGMA journal_mode = WAL;
```

**Effort:** 5 minutes  
**Benefit:** Better write concurrency, faster commits  
**Cell Created:** See "Implementation Cells" section below

---

## Medium-Term Improvements (1-5 Days)

### 10. 🟡 Implement Anti-Pattern Auto-Deprecation

**Problem:** No automatic detection of failing patterns. Bad patterns persist indefinitely.

**Solution:**
1. Track failure rate per pattern
2. Auto-deprecate at >60% failure threshold
3. Generate anti-pattern warnings
4. Surface in decomposition prompts

**Example:**
```
Pattern: "Split by file type"
Outcomes: 8 failures, 2 successes
Failure Rate: 80%
→ AUTO-DEPRECATE

New Anti-Pattern:
"AVOID: Split by file type (80% failure rate in past 10 swarms)"
```

**Effort:** 2-3 days  
**Benefit:** System learns to avoid bad patterns automatically  
**Cell Created:** See "Implementation Cells" section below

---

### 11. 🟡 Fix Eval Records Incompleteness

**Problem:** 83% of eval_records (25/30) have NULL outcomes - missing duration, error_count, success flag.

**Investigation Needed:**
1. Check `storeEvalRecord()` implementation in `src/storage.ts`
2. Verify `swarm_complete` calls it with full data
3. Add error handling for failed writes

**Effort:** 1 day (investigation + fix)  
**Benefit:** Complete evaluation data for strategy comparison  
**Cell Created:** See "Implementation Cells" section below

---

### 12. 🟡 Normalize Large Event Data

**Problem:** `coordinator_compaction` events average 3.3KB (10x other events) - 8.8% of events consume 40.2% of storage.

**Solution:**
- Store large compaction data in separate `compaction_data` table with foreign key
- Event row stores just metadata, references full data by ID
- Reduces event table scan overhead

**Trade-off:** Adds join complexity but improves event query performance

**Effort:** 2 days (schema change + migration)  
**Benefit:** Faster event queries, cleaner event table  
**Cell Created:** See "Implementation Cells" section below

---

### 13. 🟡 Investigate Decay Curve Anomaly

**Problem:** 73% of memories (6,561) are <1 day old but already at 0.7 decay factor. Expected: fresh memories should be at 1.0.

**Hypothesis:** Bulk import with pre-calculated decay OR seeding issue

**Investigation:**
```sql
SELECT 
  json_extract(metadata, '$.imported_from') as source,
  COUNT(*) as count,
  AVG(decay_factor) as avg_decay
FROM memories
GROUP BY source;
```

**Effort:** 1 day (investigation + fix)  
**Benefit:** Correct decay curve, accurate memory confidence  
**Cell Created:** See "Implementation Cells" section below

---

## Architectural Changes Needed

### 14. 🔵 Event Bus Pattern for World Package

**Long-term:** Replace centralized event-router.ts with pub/sub event bus

**Benefits:**
- Eliminates coordination bottleneck
- Enables lock-free parallelism
- Better separation of concerns

**Considerations:**
- Requires World package architectural review
- May affect client code (event subscription patterns)
- Need migration path for existing code

**Effort:** 5+ days (design + implementation + migration)  
**Benefit:** True parallel execution, eliminates #3 hotspot permanently

---

### 15. 🔵 Session Retention Policy

**Problem:** 821 session files (8.8MB) with no archival strategy. Will grow unbounded.

**Proposal:**
- Keep latest 1000 sessions in hot storage
- Archive older sessions to compressed storage (gzip: 80-90% reduction)
- Query archived sessions on-demand

**Implementation:**
```bash
# Periodic job (weekly)
cd ~/.config/swarm-tools/sessions/
find . -name "*.jsonl" -mtime +90 -exec gzip {} \;
mv *.jsonl.gz archive/
```

**Effort:** 1 day (implement + test + cron job)  
**Benefit:** Bounded storage growth, faster queries on hot data

---

## Implementation Cells

The following cells have been created in priority order:

### Sprint 1: Critical Fixes (Week 1)

1. **opencode-swarm-monorepo-lf2p4u-improve-001** - Wire Learning Feedback Loop
   - Priority: 0 (CRITICAL)
   - Effort: 2-3 days
   - Files: swarm-orchestrate.ts, storage.ts, swarm-decompose.ts

2. **opencode-swarm-monorepo-lf2p4u-improve-002** - Drop Unused Vector Index
   - Priority: 0 (CRITICAL)
   - Effort: 4 hours
   - Files: Database maintenance, investigate memories table usage

3. **opencode-swarm-monorepo-lf2p4u-improve-003** - Fix Timestamp Format
   - Priority: 1 (HIGH)
   - Effort: 1 day
   - Files: event-store.ts, migration script

### Sprint 2: High Priority (Week 2)

4. **opencode-swarm-monorepo-lf2p4u-improve-004** - Refactor event-router.ts
   - Priority: 1 (HIGH)
   - Effort: 2-3 days
   - Files: packages/core/src/world/event-router.ts

5. **opencode-swarm-monorepo-lf2p4u-improve-005** - Expand Precedent Citation
   - Priority: 2 (MEDIUM)
   - Effort: 2-3 days
   - Files: swarm-decompose.ts, swarm-review.ts

6. **opencode-swarm-monorepo-lf2p4u-improve-006** - Implement Anti-Pattern Detection
   - Priority: 1 (HIGH)
   - Effort: 2-3 days
   - Files: pattern-maturity.ts, swarm-complete.ts

### Sprint 3: Quick Wins (Day 1 of Week 3)

7. **opencode-swarm-monorepo-lf2p4u-improve-007** - Clean Test Sessions
   - Priority: 2 (MEDIUM)
   - Effort: 10 minutes
   - Files: ~/.config/swarm-tools/sessions/

8. **opencode-swarm-monorepo-lf2p4u-improve-008** - Add Missing Index
   - Priority: 2 (MEDIUM)
   - Effort: 5 minutes
   - Files: Database migration

9. **opencode-swarm-monorepo-lf2p4u-improve-009** - Enable Auto Vacuum
   - Priority: 2 (MEDIUM)
   - Effort: 15 minutes
   - Files: Database configuration

10. **opencode-swarm-monorepo-lf2p4u-improve-010** - Switch to WAL Mode
    - Priority: 2 (MEDIUM)
    - Effort: 5 minutes
    - Files: Database configuration

### Sprint 4: Medium-Term (Week 3-4)

11. **opencode-swarm-monorepo-lf2p4u-improve-011** - Fix Eval Records
    - Priority: 2 (MEDIUM)
    - Effort: 1 day
    - Files: storage.ts, swarm-complete.ts

12. **opencode-swarm-monorepo-lf2p4u-improve-012** - Normalize Large Events
    - Priority: 2 (MEDIUM)
    - Effort: 2 days
    - Files: Schema migration, storage.ts

13. **opencode-swarm-monorepo-lf2p4u-improve-013** - Investigate Decay Anomaly
    - Priority: 2 (MEDIUM)
    - Effort: 1 day
    - Files: learning.ts, memory import logic

---

## Success Criteria

### System Health Improvement Targets

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| **Database Size** | 1.4 GB | <100 MB | `ls -lh swarm.db` |
| **Operational Growth** | 77 MB/day | <2 MB/day | Weekly size diff |
| **Feedback Recording** | 0% | >90% | feedback events / completions |
| **Pattern Maturity Tracking** | 0 records | >10 patterns | COUNT(*) FROM patterns |
| **Anti-Pattern Detection** | 0 detected | >0 in 100 runs | deprecated_count |
| **Timestamp Validity** | 30% valid | 100% valid | Invalid timestamp count = 0 |
| **Conflict Rate** | 9.2% | <5% | overlapping reservations / total |
| **Eval Completeness** | 17% | >90% | complete records / total |

### Learning System Effectiveness

**Current Score:** 2/6 ⚠️
- ✅ Confidence decay working
- ✅ Memory retrieval working
- ❌ Feedback recording missing
- ❌ Pattern maturity not tracked
- ❌ Anti-patterns not detected
- ❌ Precedent citation sparse

**Target Score:** 6/6 ✅
- ✅ 90%+ swarm completions record feedback
- ✅ Pattern maturity tracked for all strategies
- ✅ Anti-patterns auto-detected within 10 outcomes
- ✅ Precedent cited in >50% of decompositions
- ✅ Eval records 90%+ complete
- ✅ Real-time learning metrics dashboard

---

## Monitoring & Validation

### Weekly Health Check Script

```bash
#!/bin/bash
# Save as: ~/.config/swarm-tools/health-check.sh

echo "=== SWARM SYSTEM HEALTH CHECK ==="
echo "Date: $(date)"
echo ""

# Database size
echo "📊 DATABASE"
ls -lh ~/.config/swarm-tools/swarm.db | awk '{print "  Size: " $5}'

# Table sizes
sqlite3 ~/.config/swarm-tools/swarm.db << EOF
SELECT '  Top tables by size:';
SELECT '    ' || name || ': ' || ROUND(SUM(pgsize)/1024.0/1024.0, 2) || ' MB'
FROM dbstat 
WHERE aggregate=TRUE 
GROUP BY name 
ORDER BY 2 DESC 
LIMIT 5;
EOF

# Memory count
sqlite3 ~/.config/swarm-tools/swarm.db << EOF
SELECT '  Memories: ' || COUNT(*) FROM memories;
EOF

echo ""
echo "🎯 LEARNING SYSTEM"
sqlite3 ~/.config/swarm-tools/swarm.db << EOF
SELECT '  Feedback events: ' || COUNT(*) FROM events WHERE type='feedback_recorded';
SELECT '  Pattern maturity records: ' || COUNT(*) FROM patterns;
SELECT '  Deprecated patterns: ' || COUNT(*) FROM patterns WHERE state='deprecated';
EOF

echo ""
echo "📈 OPERATIONAL METRICS"
sqlite3 ~/.config/swarm-tools/swarm.db << EOF
SELECT '  Total events: ' || COUNT(*) FROM events;
SELECT '  Invalid timestamps: ' || COUNT(*) 
  FROM events WHERE timestamp = 'datetime(''now'')';
SELECT '  Eval completeness: ' || 
  ROUND(CAST(SUM(CASE WHEN overall_success IS NOT NULL THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 1) || '%'
  FROM eval_records;
EOF

echo ""
echo "⚠️  WARNINGS"
# Check for anomalies
sqlite3 ~/.config/swarm-tools/swarm.db << EOF
SELECT '  ' || COUNT(*) || ' stale reservations (>1hr old)' 
  FROM reservations 
  WHERE released_at IS NULL 
    AND created_at < datetime('now', '-1 hour');
EOF
```

---

## Cost-Benefit Analysis

### By Sprint

| Sprint | Effort | Storage Saved | Learning Gain | Risk Reduction |
|--------|--------|---------------|---------------|----------------|
| **Sprint 1** | 3-4 days | 1.35 GB (97%) | 🔴 HIGH (feedback loop) | 🔴 CRITICAL |
| **Sprint 2** | 5-6 days | Minimal | 🟡 MEDIUM (anti-patterns) | 🟡 HIGH |
| **Sprint 3** | 2 hours | 3.3 MB | None | 🟢 LOW |
| **Sprint 4** | 4-5 days | Minimal | 🟢 LOW (polish) | 🟢 MEDIUM |

### Total Investment

- **Total Effort:** 12-15 days (2-3 weeks for 1 developer)
- **Total Storage Saved:** 1.35 GB (97% reduction)
- **Learning System:** From F grade → A grade
- **Database Health:** From D grade → A grade
- **System Grade:** From C+ → A

---

## Rollout Strategy

### Phase 1: Foundation (Sprint 1 - Week 1)
**Goal:** Fix critical blockers

- Day 1-2: Wire feedback loop (#1)
- Day 3: Drop vector index (#2)
- Day 4-5: Fix timestamps (#3)

**Validation:** 
- Feedback events appear after every swarm_complete
- Database shrinks from 1.4GB → ~30MB
- All new events have valid numeric timestamps

### Phase 2: Enhancement (Sprint 2 - Week 2)
**Goal:** Add intelligence

- Day 1-2: Refactor event-router.ts (#4)
- Day 3-4: Expand precedent citation (#5)
- Day 5: Implement anti-pattern detection (#6)

**Validation:**
- Conflict rate drops below 5%
- Precedent cited in >50% of decompositions
- First anti-pattern detected and deprecated

### Phase 3: Polish (Sprint 3-4 - Week 3-4)
**Goal:** Clean up and optimize

- Quick wins: All completed in 2 hours (#7-#10)
- Medium-term: Pick 1-2 based on priority (#11-#13)

**Validation:**
- All quick wins metrics green
- Eval records >90% complete
- Learning system dashboard live

---

## Risks & Mitigations

### Risk 1: Vector Index Is Actually Used
**Likelihood:** Medium  
**Impact:** High (can't drop index)  
**Mitigation:** 
- Investigate Hivemind integration first
- If used, fix vector extension loading instead of dropping
- Fallback: Migrate to alternative search (FTS5)

### Risk 2: Timestamp Migration Breaks Existing Code
**Likelihood:** Low  
**Impact:** Medium  
**Mitigation:**
- Add timestamp validation tests
- Deploy migration in non-production first
- Keep rollback script ready

### Risk 3: Event Router Refactor Introduces Bugs
**Likelihood:** Medium  
**Impact:** High (core coordination)  
**Mitigation:**
- Comprehensive test coverage before refactor
- Incremental refactor with feature flags
- Monitor conflict rates post-deployment

### Risk 4: Feedback Loop Performance Impact
**Likelihood:** Low  
**Impact:** Medium  
**Mitigation:**
- Benchmark scoreOutcome() (should be <10ms)
- Async storage writes (don't block completion)
- Monitor swarm_complete latency

---

## Conclusion

The swarm system has **excellent operational discipline** (99.6% coordinator compliance, 100% worker success) but **critical infrastructure gaps** that prevent learning and create technical debt.

**Three-Week Investment:**
1. **Week 1:** Fix feedback loop + database bloat + timestamps (CRITICAL)
2. **Week 2:** Refactor hotspots + expand learning + anti-patterns (HIGH)
3. **Week 3:** Quick wins + polish + monitoring (MEDIUM)

**Expected Outcome:**
- Database: 1.4 GB → 30 MB (97% reduction)
- Learning: F grade → A grade (feedback loop closed)
- System Health: D grade → A grade (all metrics green)
- Self-Improvement: System learns from experience automatically

**ROI:** 2-3 weeks of work eliminates manual analysis forever and enables continuous improvement.

---

## Next Steps

1. ✅ Create hive cells for all improvements (done - see "Implementation Cells")
2. ⏳ Review roadmap with stakeholders
3. ⏳ Prioritize Sprint 1 tasks (items #1-#3)
4. ⏳ Assign developer to Sprint 1
5. ⏳ Set up monitoring dashboard for validation

**Recommended Start:** Begin with #2 (drop vector index) - 4 hours, immediate 1.35GB savings, unblocks other work.

---

**Report End**  
*Questions? Query the 4 source reports in `.hive/analysis/`*
