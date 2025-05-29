/**
 * Base interface for storage implementations in the MCP architecture
 * 
 * This interface defines the standard contract for storage components that
 * provide persistence capabilities to context components.
 */

/**
 * Common search criteria for all storage implementations
 */
export interface SearchCriteria {
  [key: string]: unknown;
}

/**
 * Common list options for all storage implementations
 */
export interface ListOptions {
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

/**
 * Base storage interface for all context storage implementations
 * @template T The type of entity being stored
 * @template ID The type of ID used for entities (defaults to string)
 */
export interface StorageInterface<T, ID = string> {
  /**
   * Create a new entity
   * @param item The entity to create (may be partial for creation)
   * @returns Promise that resolves to the ID of the created entity
   */
  create(item: Partial<T>): Promise<ID>;
  
  /**
   * Read an entity by ID
   * @param id The ID of the entity to read
   * @returns Promise that resolves to the entity or null if not found
   */
  read(id: ID): Promise<T | null>;
  
  /**
   * Update an existing entity
   * @param id The ID of the entity to update
   * @param updates The partial entity with updates to apply
   * @returns Promise that resolves to true if update was successful
   */
  update(id: ID, updates: Partial<T>): Promise<boolean>;
  
  /**
   * Delete an entity by ID
   * @param id The ID of the entity to delete
   * @returns Promise that resolves to true if deletion was successful
   */
  delete(id: ID): Promise<boolean>;
  
  /**
   * Search for entities matching criteria
   * @param criteria The search criteria to use
   * @returns Promise that resolves to an array of matching entities
   */
  search(criteria: SearchCriteria): Promise<T[]>;
  
  /**
   * List entities with pagination
   * @param options Options for listing entities
   * @returns Promise that resolves to an array of entities
   */
  list(options?: ListOptions): Promise<T[]>;
  
  /**
   * Count entities matching criteria
   * @param criteria Optional search criteria to count matching entities
   * @returns Promise that resolves to the count of matching entities
   */
  count(criteria?: SearchCriteria): Promise<number>;
}