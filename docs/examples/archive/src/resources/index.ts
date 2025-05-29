/**
 * Resources Layer - External services and providers
 * 
 * This module serves as the entry point for the resources layer,
 * providing access to external services through a standardized interface.
 * 
 * PUBLIC API: These exports are intended for use by upstream consumers
 */

// Only export ResourceRegistry as that's the primary component imported directly
export { ResourceRegistry } from './resourceRegistry';