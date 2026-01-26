import type {
  Logger,
  PublishProvider,
  PublishResult,
  PublishImageData,
} from "@brains/utils";
import type { LinkedinConfig } from "../config";

/**
 * LinkedIn API response for user info
 */
interface LinkedInUserInfo {
  sub: string; // User ID (URN format: urn:li:person:xxx)
}

/**
 * LinkedIn API response for image upload registration
 */
interface LinkedInUploadResponse {
  value: {
    uploadMechanism: {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
        uploadUrl: string;
      };
    };
    asset: string; // URN of the asset (e.g., urn:li:digitalmediaAsset:xxx)
  };
}

/**
 * LinkedIn provider for posting content via the Share API v2
 *
 * Requires OAuth2 access token with `w_member_social` scope.
 * Access tokens expire after 60 days, refresh tokens after 1 year.
 *
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */
export class LinkedInClient implements PublishProvider {
  public readonly name = "linkedin";
  private readonly apiBaseUrl = "https://api.linkedin.com/v2";
  private cachedUserId: string | null = null;

  constructor(
    private config: LinkedinConfig,
    private logger: Logger,
  ) {}

  /**
   * Publish a post to LinkedIn, optionally with an image
   */
  async publish(
    content: string,
    _metadata: Record<string, unknown>,
    imageData?: PublishImageData,
  ): Promise<PublishResult> {
    if (!this.config.accessToken) {
      throw new Error("LinkedIn access token not configured");
    }

    // Get user ID (author URN)
    const userId = await this.getUserId();

    // Upload image if provided
    let assetUrn: string | null = null;
    if (imageData) {
      assetUrn = await this.uploadImage(userId, imageData);
    }

    // Create the post using UGC Posts API
    const shareContent: Record<string, unknown> = {
      shareCommentary: {
        text: content,
      },
      shareMediaCategory: assetUrn ? "IMAGE" : "NONE",
      ...(assetUrn && {
        media: [
          {
            status: "READY",
            media: assetUrn,
          },
        ],
      }),
    };

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
          "com.linkedin.ugc.ShareContent": shareContent,
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

    this.logger.info("LinkedIn post created", { postId, hasImage: !!assetUrn });

    const result: PublishResult = { id: postId };
    if (postId) {
      result.url = `https://www.linkedin.com/feed/update/${postId}`;
    }
    return result;
  }

  /**
   * Upload an image to LinkedIn and return the asset URN
   * Returns null if upload fails (allows graceful fallback to text-only)
   */
  private async uploadImage(
    userId: string,
    imageData: PublishImageData,
  ): Promise<string | null> {
    try {
      // Step 1: Register the upload
      const registerResponse = await fetch(
        `${this.apiBaseUrl}/assets?action=registerUpload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
              owner: userId,
              serviceRelationships: [
                {
                  relationshipType: "OWNER",
                  identifier: "urn:li:userGeneratedContent",
                },
              ],
            },
          }),
        },
      );

      if (!registerResponse.ok) {
        const errorText = await registerResponse.text();
        this.logger.warn("LinkedIn image upload registration failed", {
          status: registerResponse.status,
          error: errorText,
        });
        return null;
      }

      const registerData =
        (await registerResponse.json()) as LinkedInUploadResponse;
      const uploadUrl =
        registerData.value.uploadMechanism[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ].uploadUrl;
      const assetUrn = registerData.value.asset;

      // Step 2: Upload the binary image data
      // Create Uint8Array view for fetch compatibility (works in Node, Bun, browser)
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": imageData.mimeType,
        },
        body: new Uint8Array(imageData.data),
      });

      if (!uploadResponse.ok) {
        this.logger.warn("LinkedIn image binary upload failed", {
          status: uploadResponse.status,
        });
        return null;
      }

      this.logger.info("LinkedIn image uploaded", { assetUrn });
      return assetUrn;
    } catch (error) {
      this.logger.warn("LinkedIn image upload error", { error });
      return null;
    }
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
   * Tries /v2/userinfo first (requires openid scope), falls back to /v2/me
   */
  private async getUserId(): Promise<string> {
    if (this.cachedUserId) {
      return this.cachedUserId;
    }

    if (!this.config.accessToken) {
      throw new Error("LinkedIn access token not configured");
    }

    // Try OpenID Connect userinfo endpoint first (requires openid scope)
    try {
      const userinfoResponse = await fetch(
        "https://api.linkedin.com/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
          },
        },
      );

      if (userinfoResponse.ok) {
        const data = (await userinfoResponse.json()) as LinkedInUserInfo;
        this.cachedUserId = `urn:li:person:${data.sub}`;
        return this.cachedUserId;
      }
    } catch {
      // Fall through to /v2/me
    }

    // Fall back to /v2/me endpoint (works with w_member_social)
    const meResponse = await fetch("https://api.linkedin.com/v2/me", {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    });

    if (!meResponse.ok) {
      const errorText = await meResponse.text();
      throw new Error(
        `Failed to get LinkedIn user ID: ${meResponse.status} - ${errorText}`,
      );
    }

    const meData = (await meResponse.json()) as { id: string };
    this.cachedUserId = `urn:li:person:${meData.id}`;
    return this.cachedUserId;
  }
}

/**
 * Create a LinkedIn provider instance
 */
export function createLinkedInProvider(
  config: LinkedinConfig,
  logger: Logger,
): PublishProvider {
  return new LinkedInClient(config, logger);
}
