/**
 * Protocol Layer
 * 
 * Coordinates interactions between contexts and resources using the brain protocol architecture.
 * This layer contains the main protocol implementation and its supporting components.
 * 
 * PUBLIC API: This barrel file only exports the public API components that should be used by external consumers.
 * Implementation details should be imported directly from their source files.
 */

// Main protocol implementation - the primary public API
export { BrainProtocol } from './core/brainProtocol';