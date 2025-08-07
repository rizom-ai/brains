/**
 * Personal Brain Shell Package
 *
 * This is the core package that provides the foundational architecture
 * for the Personal Brain application.
 *
 * IMPORTANT: To avoid import side effects, components should be imported directly
 * from their source files rather than from this barrel export.
 *
 * Example:
 *   import { Shell } from "@brains/shell/src/shell";
 *   import { EntityRegistry } from "@brains/shell/src/entity/entityRegistry";
 *
 * This prevents loading unnecessary dependencies (like fastembed/onnxruntime)
 * when you only need type definitions or specific components.
 */

// Re-export only the main Shell class as it's the primary entry point
export { Shell } from "./shell";

// Re-export essential types that don't trigger side effects
export type { ShellConfig } from "./config";
export type { IEmbeddingService } from "@brains/embedding-service";
export type { SerializableEntity, SerializableQueryResult } from "./types";
