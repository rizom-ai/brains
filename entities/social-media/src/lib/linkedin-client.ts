import type { Logger } from "@brains/utils";
import type {
  PublishProvider,
  PublishResult,
  PublishImageData,
  PublishMediaData,
} from "@brains/contracts";
import type { LinkedinConfig } from "../config";

/**
 * LinkedIn API response for user info
 */
interface LinkedInUserInfo {
  sub: string; // User ID (URN format: urn:li:person:xxx)
}

interface LinkedInUploadInfo {
  uploadUrl: string;
  assetUrn: string;
}

interface LinkedInShareMediaAsset {
  category: "DOCUMENT" | "IMAGE";
  urn: string;
  title?: string;
}

function createShareMediaEntry(
  asset: LinkedInShareMediaAsset,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    status: "READY",
    media: asset.urn,
  };

  if (asset.title) {
    entry["title"] = { text: asset.title };
  }

  return entry;
}

function parseUploadInfo(value: unknown): LinkedInUploadInfo | null {
  if (!isRecord(value)) return null;

  const responseValue = getRecordProperty(value, "value");
  if (!responseValue) return null;

  const uploadMechanism = getRecordProperty(responseValue, "uploadMechanism");
  if (!uploadMechanism) return null;

  const uploadRequest = getRecordProperty(
    uploadMechanism,
    "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest",
  );
  if (!uploadRequest) return null;

  const uploadUrl = uploadRequest["uploadUrl"];
  const assetUrn = responseValue["asset"];

  if (typeof uploadUrl !== "string" || typeof assetUrn !== "string") {
    return null;
  }

  return { uploadUrl, assetUrn };
}

function getRecordProperty(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const property = value[key];
  return isRecord(property) ? property : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * LinkedIn provider for posting content via the Share API v2
 *
 * Requires OAuth2 access token with `w_member_social` scope for personal posting,
 * or `w_organization_social` scope for organization posting (set `organizationId` in config).
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
   * Publish a post to LinkedIn, optionally with an image or PDF document.
   * Documents take precedence over images because LinkedIn carousels are
   * represented as document posts.
   */
  async publish(
    content: string,
    _metadata: Record<string, unknown>,
    imageData?: PublishImageData,
    documentData?: PublishMediaData[],
  ): Promise<PublishResult> {
    if (!this.config.accessToken) {
      throw new Error("LinkedIn access token not configured");
    }

    // Get author URN (organization or personal)
    const author = await this.getAuthor();

    const documentAttachment = documentData?.[0];
    if (documentData && documentData.length > 1) {
      this.logger.warn("LinkedIn document publishing supports one PDF", {
        count: documentData.length,
      });
    }

    let mediaAsset: LinkedInShareMediaAsset | null = null;
    if (documentAttachment) {
      const assetUrn = await this.uploadDocument(author, documentAttachment);
      if (assetUrn) {
        mediaAsset = {
          category: "DOCUMENT",
          urn: assetUrn,
          title: documentAttachment.filename,
        };
      }
    } else if (imageData) {
      const assetUrn = await this.uploadImage(author, imageData);
      if (assetUrn) {
        mediaAsset = { category: "IMAGE", urn: assetUrn };
      }
    }

    // Create the post using UGC Posts API
    const shareContent: Record<string, unknown> = {
      shareCommentary: {
        text: content,
      },
      shareMediaCategory: mediaAsset?.category ?? "NONE",
      ...(mediaAsset && {
        media: [createShareMediaEntry(mediaAsset)],
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
        author,
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

    this.logger.info("LinkedIn post created", {
      postId,
      mediaCategory: mediaAsset?.category ?? "NONE",
    });

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
    author: string,
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
              owner: author,
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

      const uploadInfo = parseUploadInfo(await registerResponse.json());
      if (!uploadInfo) {
        this.logger.warn("LinkedIn image upload registration was malformed");
        return null;
      }

      const { uploadUrl, assetUrn } = uploadInfo;

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
   * Upload a PDF document to LinkedIn and return the asset URN.
   * Returns null if upload fails (allows graceful fallback to text-only).
   */
  private async uploadDocument(
    author: string,
    documentData: PublishMediaData,
  ): Promise<string | null> {
    try {
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
              recipes: ["urn:li:digitalmediaRecipe:feedshare-document"],
              owner: author,
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
        this.logger.warn("LinkedIn document upload registration failed", {
          status: registerResponse.status,
          error: errorText,
        });
        return null;
      }

      const uploadInfo = parseUploadInfo(await registerResponse.json());
      if (!uploadInfo) {
        this.logger.warn("LinkedIn document upload registration was malformed");
        return null;
      }

      const uploadResponse = await fetch(uploadInfo.uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": documentData.mimeType,
        },
        body: new Uint8Array(documentData.data),
      });

      if (!uploadResponse.ok) {
        this.logger.warn("LinkedIn document binary upload failed", {
          status: uploadResponse.status,
        });
        return null;
      }

      this.logger.info("LinkedIn document uploaded", {
        assetUrn: uploadInfo.assetUrn,
        filename: documentData.filename,
      });
      return uploadInfo.assetUrn;
    } catch (error) {
      this.logger.warn("LinkedIn document upload error", { error });
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
      if (this.config.organizationId) {
        const response = await fetch(
          `${this.apiBaseUrl}/organizations/${this.config.organizationId}`,
          {
            headers: {
              Authorization: `Bearer ${this.config.accessToken}`,
            },
          },
        );
        return response.ok;
      }

      await this.getUserId();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the author URN for posting.
   * Returns organization URN if organizationId is configured, otherwise personal URN.
   */
  private async getAuthor(): Promise<string> {
    if (this.config.organizationId) {
      return `urn:li:organization:${this.config.organizationId}`;
    }
    return this.getUserId();
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
