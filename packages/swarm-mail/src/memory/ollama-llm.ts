/**
 * Ollama LLM Provider for Entity/Taxonomy Extraction
 *
 * Provides Ollama-backed LLM for structured extraction tasks.
 * Separate from ollama.ts which handles embeddings.
 *
 * Uses ai-sdk-ollama for AI SDK 6 compatibility (v2 model spec).
 *
 * @module memory/ollama-llm
 */

import { createOllama } from "ai-sdk-ollama";
import type { LanguageModel } from "ai";

/**
 * Default Ollama LLM model for extraction tasks
 * Can be overridden via OLLAMA_LLM_MODEL env var
 */
export const DEFAULT_EXTRACTION_MODEL = "qwen2.5:3b";

/**
 * Get extraction model name from config or env
 */
export function getExtractionModel(): string {
  return process.env.OLLAMA_LLM_MODEL || DEFAULT_EXTRACTION_MODEL;
}

/**
 * Get configured Ollama model for extraction
 *
 * Uses ai-sdk-ollama which implements AI SDK 6 v2 model spec.
 *
 * @param host - Ollama host (default: from OLLAMA_HOST or localhost:11434)
 * @returns Language model instance compatible with AI SDK 6
 */
export function getOllamaExtractionModel(host?: string): LanguageModel {
  const ollamaHost = host || process.env.OLLAMA_HOST || "http://localhost:11434";
  const provider = createOllama({ baseURL: ollamaHost });
  const modelName = getExtractionModel();

  return provider(modelName);
}
