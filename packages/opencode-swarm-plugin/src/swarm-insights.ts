/**
 * Swarm Insights Data Layer
 *
 * Aggregates insights from swarm coordination for prompt injection.
 * Provides concise, context-efficient summaries for coordinators and workers.
 *
 * Data sources:
 * - Event store (subtask_outcome, eval_finalized)
 * - Semantic memory (file-specific learnings)
 * - Anti-pattern registry
 */

import type { SwarmMailAdapter } from "swarm-mail";

// ============================================================================
// Types
// ============================================================================

export interface StrategyInsight {
	strategy: string;
	successRate: number;
	totalAttempts: number;
	recommendation: string;
}

export interface FileInsight {
	file: string;
	failureCount: number;
	lastFailure: string | null;
	gotchas: string[];
}

export interface PatternInsight {
	pattern: string;
	frequency: number;
	recommendation: string;
}

export interface InsightsBundle {
	strategies?: StrategyInsight[];
	files?: FileInsight[];
	patterns?: PatternInsight[];
}

export interface FormatOptions {
	maxTokens?: number;
}

// ============================================================================
// Strategy Insights
// ============================================================================

/**
 * Get strategy success rates and recommendations for a task.
 *
 * Queries the event store for subtask_outcome events and calculates
 * success rates by strategy. Returns recommendations based on historical data.
 *
 * @param swarmMail - SwarmMail adapter for database access
 * @param _task - Task description (currently unused, reserved for future filtering)
 * @returns Promise resolving to array of strategy insights with success rates and recommendations
 *
 * @example
 * ```typescript
 * const insights = await getStrategyInsights(swarmMail, "Add authentication");
 * // Returns: [
 * //   { strategy: "file-based", successRate: 85.5, totalAttempts: 12, recommendation: "..." },
 * //   { strategy: "feature-based", successRate: 65.0, totalAttempts: 8, recommendation: "..." }
 * // ]
 * ```
 */
export async function getStrategyInsights(
	swarmMail: SwarmMailAdapter,
	_task: string,
): Promise<StrategyInsight[]> {
	const db = await swarmMail.getDatabase();

	const query = `
		SELECT 
			json_extract(data, '$.strategy') as strategy,
			COUNT(*) as total_attempts,
			SUM(CASE WHEN json_extract(data, '$.success') = 'true' THEN 1 ELSE 0 END) as successes
		FROM events
		WHERE type = 'subtask_outcome'
		AND json_extract(data, '$.strategy') IS NOT NULL
		GROUP BY json_extract(data, '$.strategy')
		ORDER BY total_attempts DESC
	`;

	const result = await db.query(query, []);
	const rows = result.rows as Array<{
		strategy: string;
		total_attempts: number;
		successes: number;
	}>;

	return rows.map((row) => {
		const successRate = (row.successes / row.total_attempts) * 100;
		return {
			strategy: row.strategy,
			successRate: Math.round(successRate * 100) / 100,
			totalAttempts: row.total_attempts,
			recommendation: getStrategyRecommendation(row.strategy, successRate),
		};
	});
}

/**
 * Generate recommendation based on strategy and success rate.
 *
 * @param strategy - Strategy name (e.g., "file-based", "feature-based")
 * @param successRate - Success rate percentage (0-100)
 * @returns Recommendation string based on performance thresholds
 *
 * @example
 * ```typescript
 * getStrategyRecommendation("file-based", 85);
 * // Returns: "file-based is performing well (85% success)"
 *
 * getStrategyRecommendation("feature-based", 35);
 * // Returns: "AVOID feature-based - high failure rate (35%)"
 * ```
 */
function getStrategyRecommendation(strategy: string, successRate: number): string {
	if (successRate >= 80) {
		return `${strategy} is performing well (${successRate.toFixed(0)}% success)`;
	}
	if (successRate >= 60) {
		return `${strategy} is moderate - monitor for issues`;
	}
	if (successRate >= 40) {
		return `${strategy} has low success - consider alternatives`;
	}
	return `AVOID ${strategy} - high failure rate (${successRate.toFixed(0)}%)`;
}

// ============================================================================
// File Insights
// ============================================================================

/**
 * Get insights for specific files based on historical outcomes.
 *
 * Queries the event store for failures involving these files and
 * semantic memory for file-specific gotchas.
 *
 * @param swarmMail - SwarmMail adapter for database access
 * @param files - Array of file paths to analyze
 * @returns Promise resolving to array of file-specific insights including failure counts and gotchas
 *
 * @example
 * ```typescript
 * const insights = await getFileInsights(swarmMail, ["src/auth.ts", "src/db.ts"]);
 * // Returns: [
 * //   { file: "src/auth.ts", failureCount: 3, lastFailure: "2025-12-20T10:30:00Z", gotchas: [...] }
 * // ]
 * ```
 */
export async function getFileInsights(
	swarmMail: SwarmMailAdapter,
	files: string[],
): Promise<FileInsight[]> {
	if (files.length === 0) return [];

	const db = await swarmMail.getDatabase();
	const insights: FileInsight[] = [];

	for (const file of files) {
		// Query for failures involving this file
		const query = `
			SELECT 
				COUNT(*) as failure_count,
				MAX(timestamp) as last_failure
			FROM events
			WHERE type = 'subtask_outcome'
			AND json_extract(data, '$.success') = 'false'
			AND json_extract(data, '$.files_touched') LIKE ?
		`;

		const result = await db.query(query, [`%${file}%`]);
		const row = result.rows[0] as {
			failure_count: number;
			last_failure: string | null;
		};

		if (row && row.failure_count > 0) {
			// Query semantic memory for gotchas (simplified - would use actual memory search)
			const gotchas = await getFileGotchas(swarmMail, file);

			insights.push({
				file,
				failureCount: row.failure_count,
				lastFailure: row.last_failure,
				gotchas,
			});
		}
	}

	return insights;
}

/**
 * Get gotchas for a file from semantic memory.
 *
 * In a full implementation, this would query the semantic memory
 * for file-specific learnings. For now, returns empty array.
 *
 * @param _swarmMail - SwarmMail adapter (currently unused)
 * @param _file - File path to query learnings for
 * @returns Promise resolving to array of gotcha strings (currently empty, TODO)
 *
 * @example
 * ```typescript
 * const gotchas = await getFileGotchas(swarmMail, "src/auth.ts");
 * // TODO: Will return semantic memory learnings like:
 * // ["OAuth tokens need 5min buffer", "Always validate refresh token expiry"]
 * ```
 */
async function getFileGotchas(
	_swarmMail: SwarmMailAdapter,
	_file: string,
): Promise<string[]> {
	// TODO: Query semantic memory for file-specific learnings
	// const memories = await semanticMemoryFind({ query: `file:${file}`, limit: 3 });
	// return memories.map(m => m.summary);
	return [];
}

// ============================================================================
// Pattern Insights
// ============================================================================

/**
 * Get common failure patterns and anti-patterns.
 *
 * Analyzes event store for recurring failure patterns and
 * queries the anti-pattern registry.
 *
 * @param swarmMail - SwarmMail adapter for database access
 * @returns Promise resolving to array of pattern insights with frequency and recommendations
 *
 * @example
 * ```typescript
 * const patterns = await getPatternInsights(swarmMail);
 * // Returns: [
 * //   { pattern: "type_error", frequency: 5, recommendation: "Add explicit type annotations and null checks" },
 * //   { pattern: "timeout", frequency: 3, recommendation: "Consider breaking into smaller tasks" }
 * // ]
 * ```
 */
export async function getPatternInsights(
	swarmMail: SwarmMailAdapter,
): Promise<PatternInsight[]> {
	const db = await swarmMail.getDatabase();
	const patterns: PatternInsight[] = [];

	// Query for common error patterns
	const query = `
		SELECT 
			json_extract(data, '$.error_type') as error_type,
			COUNT(*) as frequency
		FROM events
		WHERE type = 'subtask_outcome'
		AND json_extract(data, '$.success') = 'false'
		AND json_extract(data, '$.error_type') IS NOT NULL
		GROUP BY json_extract(data, '$.error_type')
		HAVING COUNT(*) >= 2
		ORDER BY frequency DESC
		LIMIT 5
	`;

	const result = await db.query(query, []);
	const rows = result.rows as Array<{
		error_type: string;
		frequency: number;
	}>;

	for (const row of rows) {
		patterns.push({
			pattern: row.error_type,
			frequency: row.frequency,
			recommendation: getPatternRecommendation(row.error_type),
		});
	}

	return patterns;
}

/**
 * Generate recommendation for a failure pattern.
 *
 * @param errorType - Type of error pattern (e.g., "type_error", "timeout", "conflict")
 * @returns Recommendation string for addressing the pattern
 *
 * @example
 * ```typescript
 * getPatternRecommendation("type_error");
 * // Returns: "Add explicit type annotations and null checks"
 *
 * getPatternRecommendation("unknown_error");
 * // Returns: "Address unknown_error issues"
 * ```
 */
function getPatternRecommendation(errorType: string): string {
	// Common patterns and their recommendations
	const recommendations: Record<string, string> = {
		type_error: "Add explicit type annotations and null checks",
		timeout: "Consider breaking into smaller tasks",
		conflict: "Check file reservations before editing",
		test_failure: "Run tests incrementally during implementation",
	};

	return recommendations[errorType] || `Address ${errorType} issues`;
}

// ============================================================================
// Prompt Formatting
// ============================================================================

/**
 * Format insights bundle for prompt injection.
 *
 * Produces a concise, context-efficient summary suitable for
 * inclusion in coordinator or worker prompts.
 *
 * @param bundle - Insights bundle containing strategies, files, and patterns
 * @param options - Formatting options (maxTokens defaults to 500)
 * @returns Formatted markdown string for prompt injection, or empty string if no insights
 *
 * @example
 * ```typescript
 * const bundle = {
 *   strategies: [{ strategy: "file-based", successRate: 85.5, totalAttempts: 12, recommendation: "..." }],
 *   files: [{ file: "src/auth.ts", failureCount: 2, lastFailure: null, gotchas: [] }],
 *   patterns: [{ pattern: "type_error", frequency: 3, recommendation: "Add type checks" }]
 * };
 * const formatted = formatInsightsForPrompt(bundle, { maxTokens: 300 });
 * // Returns formatted markdown with top 3 strategies, top 5 files, top 3 patterns
 * ```
 */
export function formatInsightsForPrompt(
	bundle: InsightsBundle,
	options: FormatOptions = {},
): string {
	const { maxTokens = 500 } = options;
	const sections: string[] = [];

	// Format strategy insights
	if (bundle.strategies && bundle.strategies.length > 0) {
		const strategyLines = bundle.strategies
			.slice(0, 3) // Top 3 strategies
			.map(
				(s) =>
					`- ${s.strategy}: ${s.successRate.toFixed(0)}% success (${s.totalAttempts} attempts)`,
			);
		sections.push(`**Strategy Performance:**\n${strategyLines.join("\n")}`);
	}

	// Format file insights
	if (bundle.files && bundle.files.length > 0) {
		const fileLines = bundle.files.slice(0, 5).map((f) => {
			const gotchaStr =
				f.gotchas.length > 0 ? ` - ${f.gotchas[0]}` : "";
			return `- ${f.file}: ${f.failureCount} past failures${gotchaStr}`;
		});
		sections.push(`**File-Specific Gotchas:**\n${fileLines.join("\n")}`);
	}

	// Format pattern insights
	if (bundle.patterns && bundle.patterns.length > 0) {
		const patternLines = bundle.patterns
			.slice(0, 3)
			.map((p) => `- ${p.pattern} (${p.frequency}x): ${p.recommendation}`);
		sections.push(`**Common Pitfalls:**\n${patternLines.join("\n")}`);
	}

	if (sections.length === 0) {
		return "";
	}

	let result = sections.join("\n\n");

	// Truncate to fit token budget (rough estimate: 4 chars per token)
	const maxChars = maxTokens * 4;
	if (result.length > maxChars) {
		result = result.slice(0, maxChars - 3) + "...";
	}

	return result;
}

// ============================================================================
// Caching (for future optimization)
// ============================================================================

// Simple in-memory cache with TTL
const insightsCache = new Map<
	string,
	{ data: InsightsBundle; expires: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached insights or compute fresh ones.
 *
 * Simple in-memory cache with 5-minute TTL to avoid redundant database queries.
 *
 * @param _swarmMail - SwarmMail adapter (currently unused, reserved for future cache invalidation)
 * @param cacheKey - Unique key for caching (e.g., "strategies:task-name" or "files:src/auth.ts")
 * @param computeFn - Function to compute fresh insights if cache miss
 * @returns Promise resolving to cached or freshly computed insights bundle
 *
 * @example
 * ```typescript
 * const insights = await getCachedInsights(
 *   swarmMail,
 *   "strategies:add-auth",
 *   async () => ({
 *     strategies: await getStrategyInsights(swarmMail, "add auth"),
 *   })
 * );
 * // First call: computes and caches. Subsequent calls within 5min: returns cached.
 * ```
 */
export async function getCachedInsights(
	_swarmMail: SwarmMailAdapter,
	cacheKey: string,
	computeFn: () => Promise<InsightsBundle>,
): Promise<InsightsBundle> {
	const cached = insightsCache.get(cacheKey);
	if (cached && cached.expires > Date.now()) {
		return cached.data;
	}

	const data = await computeFn();
	insightsCache.set(cacheKey, {
		data,
		expires: Date.now() + CACHE_TTL_MS,
	});

	return data;
}

/**
 * Clear the insights cache.
 *
 * Useful for testing or forcing fresh insights computation.
 *
 * @returns void
 *
 * @example
 * ```typescript
 * clearInsightsCache();
 * // All cached insights invalidated, next getCachedInsights() will recompute
 * ```
 */
export function clearInsightsCache(): void {
	insightsCache.clear();
}
