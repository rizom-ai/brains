/**
 * Interface for search services
 * Defines methods for searching entities
 */

/**
 * Common search options
 */
export interface SearchOptions {
  query?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  semanticSearch?: boolean;
}

/**
 * Base search service interface
 */
export interface ISearchService<TEntity> {
  /**
   * Search for entities with various options
   * @param options Search options
   */
  search(options: SearchOptions): Promise<TEntity[]>;
  
  /**
   * Find related entities based on a source entity
   * @param entityId ID of the source entity
   * @param maxResults Maximum number of results to return
   */
  findRelated(entityId: string, maxResults?: number): Promise<TEntity[]>;
}