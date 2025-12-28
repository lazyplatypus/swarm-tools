# Test Isolation Status - Retry Attempt 2

## Summary
**Goal:** Fix ALL 120 failing tests to achieve 0 failures  
**Current:** 114 failing tests (got worse, uncovered deeper issues)  
**Pass Rate:** 1656/1769 tests (93.6%)

## What Was Fixed ✅

### 1. query-tools.test.ts (35 tests fixed)
**Problem:** Tests expected `executeQuery(db, sql)` but implementation had `executeQuery(projectPath, sql)`  
**Fix:** 
- Renamed internal `executeQueryWithDb` to `executeQuery` (the signature tests expect)
- Renamed CLI wrapper to `executeQueryCLI` 
- Updated formatters to accept `QueryResult` instead of just rows

**Impact:** All 35 query-tools tests now pass

### 2. compaction-capture.integration.test.ts (7 tests fixed)
**Problem:** 
- Tests not awaiting async `captureCompactionEvent()` calls
- Session files written to production paths

**Fix:**
- Added `beforeAll` to create temp directory and set `SWARM_SESSIONS_DIR` env var
- Made all test functions `async` and added `await` to calls
- Proper cleanup in `afterAll`

**Impact:** All 7 compaction-capture tests now pass

## What's Still Broken ❌

### 1. Hive/Swarm Tools Adapter Wiring (~20 tests)
**Error:** `adapter.createCell is not a function`

**Root Cause:** Tools call `getHiveAdapter()` which returns wrong adapter type. The adapter doesn't have the expected interface.

**Affected Tests:**
- `hive_create works without explicit dbOverride`
- `hive_create_epic works without explicit dbOverride`
- `swarm_progress works without explicit dbOverride`
- `swarm_status works without explicit dbOverride`
- `swarm_complete integration tests`

**Files:**
- `src/hive-tools.test.ts`
- `src/swarm-tools.test.ts`  
- `src/tool-wiring.test.ts`

**Fix Required:** 
```typescript
// The adapter returned by getHiveAdapter() needs these methods:
interface HiveAdapter {
  createCell(projectKey: string, params: CellParams): Promise<Cell>
  queryCells(projectKey: string, filters: QueryFilters): Promise<Cell[]>
  updateCell(projectKey: string, cellId: string, updates: CellUpdates): Promise<void>
  closeCell(projectKey: string, cellId: string, reason: string): Promise<void>
  // ... etc
}

// Current adapter may be SwarmMailAdapter which has different methods
```

### 2. Skills Tests (~30 tests)
**Error:** `ENOENT: no such file or directory, open '.../.opencode/skills/documented-skill/examples.md'`

**Root Cause:** `skills_create` returns success but doesn't actually create files in test directory. Tools may be ignoring `setSkillsProjectDirectory(TEST_DIR)`.

**Affected Tests:**
- All `skills_create` tests
- All `skills_update` tests  
- All `skills_delete` tests
- All `skills_execute` tests

**Files:**
- `src/skills.integration.test.ts`

**Fix Required:** Debug why `setSkillsProjectDirectory()` isn't being respected by skills tools. May need to mock filesystem or fix tool implementation.

### 3. Compaction Hook Tests (~20 tests)
**Error:** Various - tests expect logging calls that aren't happening

**Root Cause:** Tests not properly isolated - may be checking production log paths or missing setup

**Affected Tests:**
- All "Compaction Hook > Logging instrumentation" tests
- `captureResearcherSpawned wiring` tests
- `captureSkillLoaded wiring` tests

**Files:**
- `src/compaction-hook.test.ts`
- `src/compaction-capture.test.ts`

**Fix Required:** Mock logging infrastructure or redirect to test paths

### 4. Logger Tests (~8 tests)
**Error:** `TypeError: getLogger is not a function`

**Root Cause:** Import/module loading issue with logger.ts

**Affected Tests:**
- `Logger Infrastructure > getLogger` tests
- `Logger Infrastructure > createChildLogger` tests

**Files:**
- `src/logger.test.ts`

**Fix Required:** Fix module export/import pattern for getLogger

### 5. Memory Tools (~5 tests)  
**Error:** `Insufficient funds. Please add credits to your account to continue using AI services`

**Root Cause:** Tests calling real Vercel AI API (not mocked)

**Affected Tests:**
- `semantic-memory_store executes and returns JSON`
- `semantic-memory_upsert` tests

**Files:**
- `src/memory-tools.integration.test.ts`

**Fix Required:** Mock AI calls or skip these tests when API is unavailable

### 6. Eval Tests (~10 tests)
**Error:** Various - missing eval dependencies

**Affected Tests:**
- All `runEvals` tests

**Files:**
- `src/eval-runner.test.ts`

**Fix Required:** Mock eval infrastructure or ensure dependencies are available

## Recommendation

**DO NOT attempt to fix all these in one session.** Break into focused subtasks:

1. **High Priority:** Fix adapter wiring (blocks 20+ tests)
2. **Medium Priority:** Fix skills tests (blocks 30+ tests)  
3. **Low Priority:** Fix logging/compaction tests (can be skipped)
4. **Skip:** Memory/eval tests (require external deps)

**Architectural Issue Discovered:**

The hive/swarm tools expect a specific adapter interface that may not match what `getHiveAdapter()` returns. This suggests a broader refactoring is needed, not just test fixes.

## Files Modified This Session

- `packages/opencode-swarm-plugin/src/query-tools.ts` - Fixed function signatures
- `packages/opencode-swarm-plugin/src/compaction-capture.integration.test.ts` - Fixed async handling and isolation
