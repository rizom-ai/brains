/**
 * External sources module for Model Context Protocol
 * Exports interface and implementations for external knowledge sources
 * This barrel file simplifies imports from external sources
 */
import type {
  ExternalSearchOptions,
  ExternalSourceInterface,
  ExternalSourceResult,
} from './externalSourceInterface';
import { NewsApiSource } from './newsApiSource';
import { WikipediaSource } from './wikipediaSource';

// Export class implementations
export { WikipediaSource, NewsApiSource };

export type {
  ExternalSourceInterface,
  ExternalSourceResult,
  ExternalSearchOptions,
}; 
