import type { Logger } from "@brains/utils";
import type { SocialMediaProvider, CreatePostResult } from "./provider";
import type { LinkedinConfig } from "../config";

/**
 * LinkedIn API response for user info
 */
interface LinkedInUserInfo {
  sub: string; // User ID (URN format: urn:li:person:xxx)
}

/**
 * LinkedIn provider for posting content via the Share API v2
 *
 * Requires OAuth2 access token with `w_member_social` scope.
 * Access tokens expire after 60 days, refresh tokens after 1 year.
 *
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */
export class LinkedInClient implements SocialMediaProvider {
  public readonly platform = "linkedin";
  private readonly apiBaseUrl = "https://api.linkedin.com/v2";
  private cachedUserId: string | null = null;

  constructor(
    private config: LinkedinConfig,
    private logger: Logger,
  ) {}

  /**
   * Create a text post on LinkedIn
   */
  async createPost(content: string): Promise<CreatePostResult> {
    if (!this.config.accessToken) {
      throw new Error("LinkedIn access token not configured");
    }

    // Get user ID (author URN)
    const userId = await this.getUserId();

    // Create the post using UGC Posts API
    const response = await fetch(`${this.apiBaseUrl}/ugcPosts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: userId,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: {
              text: content,
            },
            shareMediaCategory: "NONE",
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error("LinkedIn API error", {
        status: response.status,
        error: errorText,
      });
      throw new Error(`LinkedIn API error: ${response.status} - ${errorText}`);
    }

    // Extract post ID from response headers or body
    const postId = response.headers.get("X-RestLi-Id") ?? "";

    this.logger.info("LinkedIn post created", { postId });

    const result: CreatePostResult = { postId };
    if (postId) {
      result.url = `https://www.linkedin.com/feed/update/${postId}`;
    }
    return result;
  }

  /**
   * Validate that credentials are configured and working
   */
  async validateCredentials(): Promise<boolean> {
    if (!this.config.accessToken) {
      return false;
    }

    try {
      await this.getUserId();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current user's LinkedIn ID (URN)
   * Uses the userinfo endpoint which is more reliable
   */
  private async getUserId(): Promise<string> {
    if (this.cachedUserId) {
      return this.cachedUserId;
    }

    if (!this.config.accessToken) {
      throw new Error("LinkedIn access token not configured");
    }

    // Use OpenID Connect userinfo endpoint
    const response = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get LinkedIn user info: ${response.status} - ${errorText}`,
      );
    }

    const data = (await response.json()) as LinkedInUserInfo;

    // The sub field contains the user ID, we need to format it as URN
    this.cachedUserId = `urn:li:person:${data.sub}`;
    return this.cachedUserId;
  }
}

/**
 * Create a LinkedIn provider instance
 */
export function createLinkedInProvider(
  config: LinkedinConfig,
  logger: Logger,
): SocialMediaProvider {
  return new LinkedInClient(config, logger);
}
