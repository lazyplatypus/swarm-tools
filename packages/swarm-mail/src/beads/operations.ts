/**
 * Bead Operations - High-level CRUD operations using BeadsAdapter
 *
 * Convenience functions that wrap BeadsAdapter with validation.
 * Plugin tools should use these operations instead of calling adapter directly.
 *
 * ## Layering
 * - BeadsAdapter: Low-level event sourcing operations
 * - operations.ts: High-level validated CRUD (THIS FILE)
 * - Plugin tools: Type-safe Zod-validated wrappers
 */

import type {
  BeadsAdapter,
  Bead,
  QueryBeadsOptions,
} from "../types/beads-adapter.js";
import {
  validateCreateBead,
  validateUpdateBead,
  type CreateBeadOptions,
  type UpdateBeadOptions,
} from "./validation.js";

/**
 * Create a new bead with validation
 *
 * @throws {Error} If validation fails
 */
export async function createBead(
  adapter: BeadsAdapter,
  projectKey: string,
  options: CreateBeadOptions,
): Promise<Bead> {
  // Validate options
  const validation = validateCreateBead(options);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // Create bead via adapter
  return adapter.createBead(projectKey, {
    title: options.title,
    type: options.type,
    priority: options.priority ?? 2,
    description: options.description,
    parent_id: options.parent_id,
    assignee: options.assignee,
    created_by: options.created_by,
  });
}

/**
 * Get a bead by ID
 *
 * @returns Bead or null if not found
 */
export async function getBead(
  adapter: BeadsAdapter,
  projectKey: string,
  beadId: string,
): Promise<Bead | null> {
  return adapter.getBead(projectKey, beadId);
}

/**
 * Update a bead with validation
 *
 * @throws {Error} If validation fails or bead not found
 */
export async function updateBead(
  adapter: BeadsAdapter,
  projectKey: string,
  beadId: string,
  updates: UpdateBeadOptions,
): Promise<Bead> {
  // Validate updates
  const validation = validateUpdateBead(updates);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // Update via adapter
  return adapter.updateBead(projectKey, beadId, updates);
}

/**
 * Close a bead
 *
 * @throws {Error} If bead not found
 */
export async function closeBead(
  adapter: BeadsAdapter,
  projectKey: string,
  beadId: string,
  reason: string,
  closedBy?: string,
): Promise<Bead> {
  return adapter.closeBead(projectKey, beadId, reason, {
    closed_by: closedBy,
  });
}

/**
 * Reopen a closed bead
 *
 * @throws {Error} If bead not found or invalid transition
 */
export async function reopenBead(
  adapter: BeadsAdapter,
  projectKey: string,
  beadId: string,
  reopenedBy?: string,
): Promise<Bead> {
  return adapter.reopenBead(projectKey, beadId, {
    reopened_by: reopenedBy,
  });
}

/**
 * Delete a bead (soft delete - creates tombstone)
 *
 * @throws {Error} If bead not found
 */
export async function deleteBead(
  adapter: BeadsAdapter,
  projectKey: string,
  beadId: string,
  reason: string,
  deletedBy?: string,
): Promise<void> {
  await adapter.deleteBead(projectKey, beadId, {
    reason,
    deleted_by: deletedBy,
  });
}

/**
 * Search beads by title
 *
 * Simple text search across bead titles with optional filters.
 */
export async function searchBeads(
  adapter: BeadsAdapter,
  projectKey: string,
  query: string,
  filter?: QueryBeadsOptions,
): Promise<Bead[]> {
  // Get all beads matching filter
  const allBeads = await adapter.queryBeads(projectKey, filter);

  // Filter by query string if provided
  if (!query || query.trim().length === 0) {
    return allBeads;
  }

  const lowerQuery = query.toLowerCase();
  return allBeads.filter(
    (bead) =>
      bead.title.toLowerCase().includes(lowerQuery) ||
      bead.description?.toLowerCase().includes(lowerQuery),
  );
}
