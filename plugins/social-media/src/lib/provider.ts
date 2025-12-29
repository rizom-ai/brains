/**
 * Result from creating a post on a social media platform
 */
export interface CreatePostResult {
  postId: string;
  url?: string;
}

/**
 * Interface for social media platform providers
 * Each platform (LinkedIn, Twitter, etc.) implements this interface
 */
export interface SocialMediaProvider {
  /** Platform identifier */
  readonly platform: string;

  /**
   * Create a post on the platform
   * @param content The text content of the post
   * @returns Result with platform-specific post ID
   */
  createPost(content: string): Promise<CreatePostResult>;

  /**
   * Validate that credentials are configured and valid
   * @returns true if credentials are valid, false otherwise
   */
  validateCredentials(): Promise<boolean>;

  /**
   * Refresh access tokens if needed (for OAuth providers)
   */
  refreshAccessToken?(): Promise<void>;
}
