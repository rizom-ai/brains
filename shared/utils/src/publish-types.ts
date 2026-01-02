/**
 * Shared types for publish functionality.
 * Used by both publish-pipeline and content plugins (social-media, blog, decks).
 */

/**
 * Result returned by a publish provider after successful publish
 */
export interface PublishResult {
  /** Platform-specific ID of the published content */
  id: string;
  /** URL to the published content (if applicable) */
  url?: string;
  /** Additional platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for publish providers that handle actual publishing to platforms.
 * Plugins implement this interface for external platforms (LinkedIn, etc.)
 * or use the default InternalPublishProvider for internal publishing.
 */
export interface PublishProvider {
  /** Name of the provider (e.g., "linkedin", "internal") */
  name: string;

  /**
   * Publish content to the platform
   * @param content - The content to publish (markdown body)
   * @param metadata - Entity metadata for context
   * @returns Result with platform-specific ID
   */
  publish(
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<PublishResult>;

  /**
   * Optionally validate that credentials are configured correctly
   * @returns true if credentials are valid
   */
  validateCredentials?(): Promise<boolean>;
}
