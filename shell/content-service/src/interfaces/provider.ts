/**
 * Content Provider Interface
 * 
 * Plugins implement this interface to register as content providers
 * with the content-service. Each provider manages its own content types
 * and generation logic.
 */

/**
 * Definition of a content type that a provider can generate
 */
export interface ContentTypeDefinition {
  id: string; // e.g., "page", "email", "report"
  name: string; // Human-readable name
  description?: string;
  schema?: unknown; // Zod schema for validation
}

/**
 * Context for content generation operations
 */
export interface ContentContext {
  userId?: string;
  conversationId?: string;
  [key: string]: unknown;
}

/**
 * Request for content generation
 */
export interface GenerateRequest {
  type: string; // Content type to generate
  data: unknown; // Provider-specific data
  context?: ContentContext;
}

/**
 * Universal content representation
 */
export interface Content {
  id: string;
  provider: string; // Which provider owns this
  type: string; // Provider-specific type
  data: unknown; // Provider-specific data
  metadata: {
    created: string;
    updated: string;
    version?: string;
    [key: string]: unknown; // Provider-specific metadata
  };
}

/**
 * Provider content types summary
 */
export interface ProviderContentTypes {
  provider: string;
  types: ContentTypeDefinition[];
}

/**
 * Interface that content provider plugins must implement
 */
export interface IContentProvider {
  readonly id: string; // Unique provider ID (e.g., "site", "email", "docs")
  readonly name: string; // Human-readable name
  readonly version: string; // Provider version

  /**
   * Get the content types this provider can generate
   */
  getContentTypes(): ContentTypeDefinition[];

  /**
   * Generate content based on the request
   */
  generate(request: GenerateRequest): Promise<Content>;

  /**
   * Optional: Transform content to a different format
   * To be added in future phases as needed
   */
  // transform?(content: Content, format: string): Promise<Content>;

  /**
   * Optional: Validate content against provider's rules
   * To be added in future phases as needed
   */
  // validate?(content: Content): Promise<boolean>;
}