/**
 * Services Layer - Internal application services
 * 
 * This module serves as the entry point for the services layer,
 * providing access to internal services through a standardized interface.
 * 
 * PUBLIC API: These exports are intended for use by upstream consumers
 * Note: Long-term goal is to access all services through ServiceRegistry
 * rather than directly importing from barrel files.
 */

// Export ServiceRegistry - main public API for accessing all services
export { ServiceRegistry, ServiceIdentifiers } from './serviceRegistry';

// Export service interfaces - needed by consumers for type information
export type { IEmbeddingService } from './interfaces/IEmbeddingService';
export type { IRepository } from './interfaces/IRepository';
export type { ISearchService } from './interfaces/ISearchService';