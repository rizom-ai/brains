/**
 * Interface defining external knowledge source capabilities
 */

export interface ExternalSourceResult {
  content: string;
  title: string;
  url: string;
  source: string;
  sourceType: string;
  timestamp: Date;
  embedding?: number[];
  confidence: number;
}

export interface ExternalSearchOptions {
  query: string;
  limit?: number;
  addEmbeddings?: boolean;
}

/**
 * Base interface for all external knowledge sources
 */
export interface ExternalSourceInterface {
  /**
   * The name of the external source
   */
  readonly name: string;
  
  /**
   * Search the external source for information
   */
  search(options: ExternalSearchOptions): Promise<ExternalSourceResult[]>;
  
  /**
   * Check if the source is available/accessible
   */
  checkAvailability(): Promise<boolean>;
  
  /**
   * Get source metadata including usage limits, rate limits, etc.
   */
  getSourceMetadata(): Promise<Record<string, unknown>>;
}