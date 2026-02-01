/**
 * Taxonomy Extraction - SKOS-compliant entity hierarchy builder
 *
 * Extracts taxonomic relationships between entities using SKOS vocabulary:
 * - broader/narrower: Hierarchical parent/child relationships
 * - related: Associative relationships (non-hierarchical)
 *
 * Based on SKOS (Simple Knowledge Organization System) standard.
 *
 * @module memory/taxonomy-extraction
 */

import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { Client } from "@libsql/client";
import type { ExtractedEntity } from "./entity-extraction.js";

// ============================================================================
// Types
// ============================================================================

export type RelationshipType = "broader" | "narrower" | "related";

export interface TaxonomyRelationship {
  id: string;
  entityId: string;
  relatedEntityId: string;
  relationshipType: RelationshipType;
  createdAt: Date;
}

/** Extracted taxonomy relationship from LLM (before DB storage) */
export interface ExtractedTaxonomyRelationship {
  entityName: string;
  relatedEntityName: string;
  relationshipType: RelationshipType;
}

/** Result from LLM taxonomy extraction */
export interface TaxonomyExtractionResult {
  relationships: ExtractedTaxonomyRelationship[];
}

// ============================================================================
// Zod Schemas for LLM Structured Output
// ============================================================================

const TaxonomyRelationshipSchema = z.object({
  entityName: z.string().describe("Name of the subject entity"),
  relatedEntityName: z.string().describe("Name of the related entity"),
  relationshipType: z
    .enum(["broader", "narrower", "related"])
    .describe(
      "SKOS relationship type: 'broader' (parent), 'narrower' (child), 'related' (associative)"
    ),
});

const TaxonomyExtractionSchema = z.object({
  relationships: z
    .array(TaxonomyRelationshipSchema)
    .describe("SKOS taxonomic relationships between entities"),
});

// ============================================================================
// LLM Extraction
// ============================================================================

/**
 * Extract taxonomic relationships between entities using LLM
 *
 * Analyzes content and entity list to identify SKOS relationships:
 * - broader: Parent concept (e.g., "React" is broader than "React Hooks")
 * - narrower: Child concept (e.g., "useState" is narrower than "React Hooks")
 * - related: Related but not hierarchical (e.g., "React" related to "Vue")
 *
 * @param content - Text content for context
 * @param entities - Extracted entities to analyze relationships between
 * @param config - Model configuration (model name + API key OR LanguageModel instance)
 * @returns Extracted taxonomy relationships
 *
 * @example
 * ```typescript
 * // With model string (Anthropic via AI Gateway)
 * const result = await extractTaxonomy(
 *   "React is a library. React Hooks like useState are part of React.",
 *   [
 *     { name: "React", entityType: "technology" },
 *     { name: "React Hooks", entityType: "concept" },
 *     { name: "useState", entityType: "concept" }
 *   ],
 *   { model: "anthropic/claude-haiku-4-5", apiKey: process.env.API_KEY }
 * );
 *
 * // With Ollama LanguageModel instance
 * import { getOllamaExtractionModel } from "./ollama-llm.js";
 * const result = await extractTaxonomy(
 *   "...",
 *   entities,
 *   { languageModel: getOllamaExtractionModel() }
 * );
 * ```
 */
export async function extractTaxonomy(
  content: string,
  entities: ExtractedEntity[],
  config: { model?: string; apiKey?: string; languageModel?: LanguageModel }
): Promise<TaxonomyExtractionResult> {
  // Skip if fewer than 2 entities (need at least 2 for relationships)
  if (entities.length < 2) {
    return { relationships: [] };
  }

  try {
    // Support both string model names (AI Gateway) and LanguageModel instances (Ollama)
    const modelConfig = config.languageModel
      ? { model: config.languageModel as LanguageModel }
      : {
          model: config.model!,
          headers: config.apiKey
            ? { Authorization: `Bearer ${config.apiKey}` }
            : undefined,
        };

    const entityList = entities.map((e) => e.name).join(", ");

    const { output } = await generateText({
      ...modelConfig,
      prompt: `Given the following text and list of entities, identify SKOS taxonomic relationships between them.

SKOS Relationship Types:
- broader: A is broader than B means A is the parent/superclass of B (e.g., "React" is broader than "React Hooks")
- narrower: A is narrower than B means A is the child/subclass of B (e.g., "useState" is narrower than "React Hooks")
- related: A is related to B means they are associated but not hierarchical (e.g., "React" related to "Vue")

Important:
- Only identify relationships between entities in the provided list
- Broader/narrower are inverse relationships (if A broader than B, then B narrower than A)
- Only include relationships that are clearly supported by the content
- Don't invent relationships based on general knowledge alone

Text: ${content}

Entities: ${entityList}`,
      output: Output.object({
        schema: TaxonomyExtractionSchema,
      }),
    });

    return output as TaxonomyExtractionResult;
  } catch (error) {
    console.error("Taxonomy extraction failed:", error);
    return { relationships: [] };
  }
}

// ============================================================================
// Database Storage
// ============================================================================

/**
 * Store taxonomy relationships in database with deduplication
 *
 * Deduplicates by (entity_id, related_entity_id, relationship_type) triple.
 * Uses INSERT OR IGNORE for idempotent inserts.
 *
 * Note: Broader/narrower are inverse relationships - you typically only store one direction
 * and infer the inverse at query time. This function stores exactly what's passed.
 *
 * @param relationships - Extracted relationships (entity names, not IDs)
 * @param db - libSQL client
 * @returns Stored relationships with IDs
 */
export async function storeTaxonomy(
  relationships: ExtractedTaxonomyRelationship[],
  db: Client
): Promise<TaxonomyRelationship[]> {
  const stored: TaxonomyRelationship[] = [];

  for (const rel of relationships) {
    // Lookup entity IDs by name (case-insensitive)
    const entityResult = await db.execute(
      `SELECT id FROM entities WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [rel.entityName]
    );

    const relatedEntityResult = await db.execute(
      `SELECT id FROM entities WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [rel.relatedEntityName]
    );

    // Skip if either entity doesn't exist
    if (entityResult.rows.length === 0 || relatedEntityResult.rows.length === 0) {
      continue;
    }

    const entityId = entityResult.rows[0].id as string;
    const relatedEntityId = relatedEntityResult.rows[0].id as string;

    // Generate ID
    const id = `tax-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    // Insert with INSERT OR IGNORE for deduplication
    await db.execute(
      `
      INSERT OR IGNORE INTO entity_taxonomy (id, entity_id, related_entity_id, relationship_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
      [id, entityId, relatedEntityId, rel.relationshipType, now]
    );

    // Check if insert succeeded (might have been ignored due to duplicate)
    const checkResult = await db.execute(
      `
      SELECT id, entity_id, related_entity_id, relationship_type, created_at
      FROM entity_taxonomy
      WHERE entity_id = ? AND related_entity_id = ? AND relationship_type = ?
    `,
      [entityId, relatedEntityId, rel.relationshipType]
    );

    if (checkResult.rows.length > 0) {
      const row = checkResult.rows[0];
      stored.push({
        id: row.id as string,
        entityId: row.entity_id as string,
        relatedEntityId: row.related_entity_id as string,
        relationshipType: row.relationship_type as RelationshipType,
        createdAt: new Date(row.created_at as string),
      });
    }
  }

  return stored;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all taxonomy relationships for an entity
 *
 * Returns both outgoing (this entity as subject) and incoming (this entity as object).
 *
 * @param entityId - Entity ID to get relationships for
 * @param db - libSQL client
 * @returns All taxonomy relationships involving the entity
 */
export async function getTaxonomyForEntity(
  entityId: string,
  db: Client
): Promise<TaxonomyRelationship[]> {
  const result = await db.execute(
    `
    SELECT id, entity_id, related_entity_id, relationship_type, created_at
    FROM entity_taxonomy
    WHERE entity_id = ? OR related_entity_id = ?
  `,
    [entityId, entityId]
  );

  return result.rows.map((row) => ({
    id: row.id as string,
    entityId: row.entity_id as string,
    relatedEntityId: row.related_entity_id as string,
    relationshipType: row.relationship_type as RelationshipType,
    createdAt: new Date(row.created_at as string),
  }));
}

/**
 * Get entity hierarchy (broader/narrower chain)
 *
 * Traverses the taxonomy graph in the specified direction:
 * - 'up': Follow broader relationships (to parents/ancestors)
 * - 'down': Follow narrower relationships (to children/descendants)
 *
 * Note: This is a simple one-level traversal. For deep hierarchies,
 * consider implementing recursive CTE or graph traversal.
 *
 * @param entityId - Starting entity ID
 * @param direction - Direction to traverse ('up' for broader, 'down' for narrower)
 * @param db - libSQL client
 * @returns Entity IDs in the hierarchy chain
 */
export async function getEntityHierarchy(
  entityId: string,
  direction: "up" | "down",
  db: Client
): Promise<string[]> {
  const relationshipType = direction === "up" ? "broader" : "narrower";

  // Find relationships in the specified direction
  const result = await db.execute(
    `
    SELECT related_entity_id
    FROM entity_taxonomy
    WHERE entity_id = ? AND relationship_type = ?
  `,
    [entityId, relationshipType]
  );

  return result.rows.map((row) => row.related_entity_id as string);
}

/**
 * Find entities by taxonomy relationship type
 *
 * Useful for queries like "find all broader concepts" or "find related concepts".
 *
 * @param entityId - Source entity ID
 * @param relationshipType - Type of relationship to filter by
 * @param db - libSQL client
 * @returns Entity IDs related via the specified relationship type
 */
export async function findByTaxonomy(
  entityId: string,
  relationshipType: RelationshipType,
  db: Client
): Promise<string[]> {
  const result = await db.execute(
    `
    SELECT related_entity_id
    FROM entity_taxonomy
    WHERE entity_id = ? AND relationship_type = ?
  `,
    [entityId, relationshipType]
  );

  return result.rows.map((row) => row.related_entity_id as string);
}

/**
 * Get inverse relationships
 *
 * For broader/narrower pairs, returns the inverse relationship.
 * E.g., if A is broader than B, returns B is narrower than A.
 *
 * @param entityId - Entity ID to get inverse relationships for
 * @param db - libSQL client
 * @returns Inverse relationships
 */
export async function getInverseRelationships(
  entityId: string,
  db: Client
): Promise<TaxonomyRelationship[]> {
  // Get relationships where this entity is the target (related_entity_id)
  // and invert the relationship type
  const result = await db.execute(
    `
    SELECT id, related_entity_id as entity_id, entity_id as related_entity_id,
           CASE relationship_type
             WHEN 'broader' THEN 'narrower'
             WHEN 'narrower' THEN 'broader'
             ELSE relationship_type
           END as relationship_type,
           created_at
    FROM entity_taxonomy
    WHERE related_entity_id = ?
  `,
    [entityId]
  );

  return result.rows.map((row) => ({
    id: row.id as string,
    entityId: row.entity_id as string,
    relatedEntityId: row.related_entity_id as string,
    relationshipType: row.relationship_type as RelationshipType,
    createdAt: new Date(row.created_at as string),
  }));
}
