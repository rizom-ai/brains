/**
 * BrainProtocol orchestrates the interaction between models and context
 * This is the primary export from the protocol layer
 */

// Direct export of the main BrainProtocol implementation
import { BrainProtocol } from './core/brainProtocol';
export { BrainProtocol };

// Export types needed by consumers of the protocol
export type { BrainProtocolOptions, QueryOptions, QueryResult } from './types';