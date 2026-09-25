import { MAX_ASSET_BYTES } from "@brains/assets";
import type { FetchLike } from "@brains/utils/fetch-like";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type {
  LinkedInUploadRecovery,
  PublishProvider,
  PublishResult,
  PublishImageData,
  PublishMediaData,
} from "@brains/contracts";
import type { LinkedinConfig } from "../config";
import { AcknowledgedLinkedInPostError } from "./linkedin-post-error";
import {
  ReceivedEntityFileHttpError,
  type EntityServiceClient,
} from "@brains/plugins";
import { readBoundedJsonResponse } from "@brains/utils/bounded-json-response";
export type LinkedInFileTransfers = Pick<
  NonNullable<EntityServiceClient["fileAssets"]>,
  "putHttp"
>;

/**
 * External HTTP dependency for the LinkedIn client.
 * Injected via the constructor so tests can pass a stub function instead of
 * mocking globalThis.fetch.
 */
export interface LinkedInClientDeps {
  fetch?: FetchLike;
  getFileTransfers?: () => LinkedInFileTransfers | undefined;
}

/** Upload and post-attempt evidence is not a published post or retry authority. */
export class PartialLinkedInUploadError extends Error {
  public readonly recovery: Readonly<LinkedInUploadRecovery>;
  constructor(recovery: LinkedInUploadRecovery, cause: unknown) {
    super("LinkedIn media publication failed after upload registration", {
      cause,
    });
    this.name = "PartialLinkedInUploadError";
    this.recovery = Object.freeze({
      kind: recovery.kind,
      resourceUrn: recovery.resourceUrn,
      sha256: recovery.sha256,
      sizeBytes: recovery.sizeBytes,
      stage: recovery.stage,
    });
  }
}

const uploadFactsSchema = z.object({
  sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
  sha256: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
});
const uploadReceiptSchema = uploadFactsSchema.extend({
  statusCode: z.number().int().min(200).max(599),
});
const linkedInResourceUrnSchema = z
  .string()
  .max(1024)
  .regex(/^urn:li:[A-Za-z0-9:._-]+$/)
  .refine((value) => value.trim() === value);
const ERROR_BODY_MAX_LENGTH = 200;
const LINKEDIN_MEDIA_UPLOAD_REQUEST_KEY =
  "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest";

/**
 * Truncate raw LinkedIn API error bodies before logging or surfacing them in
 * thrown errors. LinkedIn occasionally echoes scopes / auth context back in
 * error bodies, and unbounded bodies can flood logs.
 */
async function summarizeApiError(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const errors: unknown[] = [];
  const remember = (error: unknown): void => {
    if (!errors.includes(error)) errors.push(error);
  };
  const decoder = new TextDecoder();
  let text = "";
  let remaining = ERROR_BODY_MAX_LENGTH * 4 + 1;
  let drained = false;
  try {
    while (remaining > 0) {
      const chunk = await reader.read();
      if (chunk.done) {
        drained = true;
        break;
      }
      const prefix = chunk.value.subarray(0, remaining);
      remaining -= prefix.byteLength;
      text += decoder.decode(prefix, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    remember(error);
  } finally {
    if (!drained) {
      try {
        await reader.cancel(errors[0]);
      } catch (error) {
        remember(error);
      }
    }
    try {
      reader.releaseLock();
    } catch (error) {
      remember(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "LinkedIn error response and retirement failed",
      { cause: errors[0] },
    );
  return !drained || text.length > ERROR_BODY_MAX_LENGTH
    ? `${text.slice(0, ERROR_BODY_MAX_LENGTH)}… (truncated)`
    : text;
}

const linkedInUserInfoSchema = z.looseObject({
  sub: z.string(),
});

const linkedInMeSchema = z.looseObject({
  id: z.string(),
});

const linkedInUploadInfoSchema = z
  .looseObject({
    value: z.looseObject({
      asset: linkedInResourceUrnSchema,
      uploadMechanism: z.looseObject({
        [LINKEDIN_MEDIA_UPLOAD_REQUEST_KEY]: z.looseObject({
          uploadUrl: z.url(),
        }),
      }),
    }),
  })
  .transform((data) => ({
    uploadUrl:
      data.value.uploadMechanism[LINKEDIN_MEDIA_UPLOAD_REQUEST_KEY].uploadUrl,
    assetUrn: data.value.asset,
  }));

const linkedInDocumentUploadInfoSchema = z
  .looseObject({
    value: z.looseObject({
      uploadUrl: z.url(),
      document: linkedInResourceUrnSchema,
    }),
  })
  .transform((data) => ({
    uploadUrl: data.value.uploadUrl,
    documentUrn: data.value.document,
  }));

type LinkedInUploadInfo = z.output<typeof linkedInUploadInfoSchema>;
type LinkedInDocumentUploadInfo = z.output<
  typeof linkedInDocumentUploadInfoSchema
>;

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
  const parsed = linkedInUploadInfoSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseDocumentUploadInfo(
  value: unknown,
): LinkedInDocumentUploadInfo | null {
  const parsed = linkedInDocumentUploadInfoSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
const DEFAULT_LINKEDIN_REST_API_VERSION = "202604";

export class LinkedInClient implements PublishProvider {
  private config: LinkedinConfig;
  private logger: Logger;
  public readonly name = "linkedin";
  private readonly apiBaseUrl = "https://api.linkedin.com/v2";
  private readonly restApiBaseUrl = "https://api.linkedin.com/rest";
  private readonly fetch: FetchLike;
  private readonly getFileTransfers:
    (() => LinkedInFileTransfers | undefined) | undefined;
  private cachedUserId: string | null = null;

  constructor(
    config: LinkedinConfig,
    logger: Logger,
    deps: LinkedInClientDeps = {},
  ) {
    this.config = config;
    this.logger = logger;
    this.fetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
    this.getFileTransfers = deps.getFileTransfers;
  }

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

    const signals = [
      imageData?.signal,
      ...(documentData ?? []).map((file) => file.signal),
    ].filter((signal): signal is AbortSignal => signal !== undefined);
    const signal = AbortSignal.any(signals);
    signal.throwIfAborted();
    if ((imageData || documentData?.length) && !this.getFileTransfers?.())
      throw new Error("LinkedIn file uploads are not provisioned");
    // Get author URN (organization or personal)
    const author = await this.getAuthor(signal);
    signal.throwIfAborted();

    const documentAttachment = documentData?.[0];
    if (documentData && documentData.length > 1) {
      this.logger.warn("LinkedIn document publishing supports one PDF", {
        count: documentData.length,
      });
    }

    // Invocation-local state: concurrent publications must never share evidence.
    const completed: { recovery?: LinkedInUploadRecovery } = {};
    const recordUpload = (recovery: LinkedInUploadRecovery): void => {
      completed.recovery = Object.freeze({ ...recovery });
    };
    const markPostAttempt = (): void => {
      if (completed.recovery)
        recordUpload({ ...completed.recovery, stage: "post-attempted" });
    };
    try {
      let mediaAsset: LinkedInShareMediaAsset | null = null;
      if (documentAttachment) {
        const title = documentAttachment.filename;
        // Document uploads must succeed: the document IS the post (PDF carousel),
        // so a silent text-only fallback would publish something the caller never
        // asked for. Native document posts use LinkedIn's versioned /rest APIs;
        // keep UGC Posts below for text/image publishing.
        const documentUrn = await this.uploadDocument(
          author,
          documentAttachment,
          signal,
          recordUpload,
        );
        signal.throwIfAborted();
        markPostAttempt();
        return await this.publishDocumentPost(
          author,
          content,
          documentUrn,
          title,
          signal,
        );
      } else if (imageData) {
        const assetUrn = await this.uploadImage(
          author,
          imageData,
          signal,
          recordUpload,
        );
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

      signal.throwIfAborted();
      markPostAttempt();
      const response = await this.fetch(`${this.apiBaseUrl}/ugcPosts`, {
        signal,
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
        const errorText = await summarizeApiError(response);
        this.logger.error("LinkedIn API error", {
          status: response.status,
          error: errorText,
        });
        throw new Error(
          `LinkedIn API error: ${response.status} - ${errorText}`,
        );
      }

      // Extract post ID from response headers or body
      const postId = response.headers.get("X-RestLi-Id") ?? "";

      const result: PublishResult = { id: postId };
      if (postId) {
        result.url = `https://www.linkedin.com/feed/update/${postId}`;
      }
      return await this.settleAcknowledgedResponse(response, result, () => {
        this.logger.info("LinkedIn post created", {
          postId,
          mediaCategory: mediaAsset?.category ?? "NONE",
        });
      });
    } catch (error) {
      if (completed.recovery)
        throw new PartialLinkedInUploadError(completed.recovery, error);
      throw error;
    }
  }

  private async settleAcknowledgedResponse(
    response: Response,
    result: PublishResult,
    report: () => void,
  ): Promise<PublishResult> {
    const acknowledged = Object.freeze({ ...result });
    const causes: unknown[] = [];
    let diagnosticFailed = false;
    try {
      report();
    } catch (error) {
      diagnosticFailed = true;
      causes.push(error);
    }
    let outcome: PublishResult = acknowledged;
    try {
      // Always join retirement, even when the preceding diagnostic failed.
      await response.body?.cancel();
    } catch (error) {
      causes.push(error);
      outcome = Object.freeze({
        ...acknowledged,
        metadata: Object.freeze({ responseRetirementFailed: true }),
      });
      try {
        this.logger.warn(
          "LinkedIn post acknowledged but response retirement failed",
          { result: outcome, error },
        );
      } catch (reportError) {
        diagnosticFailed = true;
        causes.push(reportError);
      }
    }
    if (diagnosticFailed)
      throw new AcknowledgedLinkedInPostError(
        acknowledged.id,
        causes.length === 1
          ? causes[0]
          : new AggregateError(
              causes,
              "LinkedIn post diagnostics and retirement failed",
              { cause: causes[0] },
            ),
      );
    return outcome;
  }

  /**
   * Headers required by LinkedIn's versioned /rest APIs.
   */
  private getRestHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      "Content-Type": "application/json",
      "Linkedin-Version":
        this.config.apiVersion ?? DEFAULT_LINKEDIN_REST_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    };
  }

  /**
   * Upload an image to LinkedIn and return the asset URN
   * Explicit negative receipts allow text-only fallback. Transport, cancellation
   * and retirement failures retain their causes; uncertain sends are not retried.
   */
  private async uploadImage(
    author: string,
    imageData: PublishImageData,
    signal: AbortSignal,
    recordUpload: (recovery: LinkedInUploadRecovery) => void,
  ): Promise<string | null> {
    signal.throwIfAborted();
    const source: PublishImageData = {
      sourceFile: imageData.sourceFile,
      mimeType: imageData.mimeType,
      signal,
      ...uploadFactsSchema.parse(imageData),
    };
    // Step 1: Register the upload
    const registerResponse = await this.fetch(
      `${this.apiBaseUrl}/assets?action=registerUpload`,
      {
        signal,
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
      const errorText = await summarizeApiError(registerResponse);
      this.logger.warn("LinkedIn image upload registration failed", {
        status: registerResponse.status,
        error: errorText,
      });
      return null;
    }

    const uploadInfo = parseUploadInfo(
      await readBoundedJsonResponse(registerResponse, 64 * 1024),
    );
    if (!uploadInfo) {
      this.logger.warn("LinkedIn image upload registration was malformed");
      return null;
    }

    const { uploadUrl, assetUrn } = uploadInfo;

    const uploadResponse = await this.uploadRegisteredFile(
      "image",
      assetUrn,
      uploadUrl,
      source,
      signal,
    );

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      this.logger.warn("LinkedIn image binary upload failed", {
        status: uploadResponse.statusCode,
        recovery: { kind: "image", resourceUrn: assetUrn, stage: "registered" },
      });
      return null;
    }

    recordUpload({
      kind: "image",
      resourceUrn: assetUrn,
      sha256: uploadResponse.sha256,
      sizeBytes: uploadResponse.sizeBytes,
      stage: "uploaded",
    });
    this.logger.info("LinkedIn image uploaded", { assetUrn });
    return assetUrn;
  }

  /**
   * Upload a PDF document to LinkedIn and return the native document URN.
   * Throws on any failure — the document is the post, so silent fallback
   * would mislead the caller about what was published.
   */
  private async uploadDocument(
    author: string,
    documentData: PublishMediaData,
    signal: AbortSignal,
    recordUpload: (recovery: LinkedInUploadRecovery) => void,
  ): Promise<string> {
    signal.throwIfAborted();
    if (documentData.type !== "document")
      throw new Error("LinkedIn document upload requires a PDF");
    const source: PublishImageData = {
      sourceFile: documentData.sourceFile,
      mimeType: documentData.mimeType,
      signal,
      ...uploadFactsSchema.parse(documentData),
    };
    const registerResponse = await this.fetch(
      `${this.restApiBaseUrl}/documents?action=initializeUpload`,
      {
        signal,
        method: "POST",
        headers: this.getRestHeaders(),
        body: JSON.stringify({
          initializeUploadRequest: {
            owner: author,
          },
        }),
      },
    );

    if (!registerResponse.ok) {
      const errorText = await summarizeApiError(registerResponse);
      throw new Error(
        `LinkedIn document upload initialization failed: ${registerResponse.status} - ${errorText}`,
      );
    }

    const uploadInfo = parseDocumentUploadInfo(
      await readBoundedJsonResponse(registerResponse, 64 * 1024),
    );
    if (!uploadInfo) {
      throw new Error("LinkedIn document upload initialization was malformed");
    }

    const uploadResponse = await this.uploadRegisteredFile(
      "document",
      uploadInfo.documentUrn,
      uploadInfo.uploadUrl,
      source,
      signal,
    );

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      throw new PartialLinkedInUploadError(
        {
          kind: "document",
          resourceUrn: uploadInfo.documentUrn,
          sha256: uploadResponse.sha256,
          sizeBytes: uploadResponse.sizeBytes,
          stage: "registered",
        },
        new Error(
          `LinkedIn document binary upload failed: ${uploadResponse.statusCode}`,
        ),
      );
    }

    recordUpload({
      kind: "document",
      resourceUrn: uploadInfo.documentUrn,
      sha256: uploadResponse.sha256,
      sizeBytes: uploadResponse.sizeBytes,
      stage: "uploaded",
    });
    this.logger.info("LinkedIn document uploaded", {
      documentUrn: uploadInfo.documentUrn,
      filename: documentData.filename,
    });
    return uploadInfo.documentUrn;
  }

  private async uploadRegisteredFile(
    kind: "image" | "document",
    resourceUrn: string,
    uploadUrl: string,
    data: PublishImageData,
    signal: AbortSignal,
  ): Promise<Awaited<ReturnType<LinkedInFileTransfers["putHttp"]>>> {
    const facts = Object.freeze({
      sizeBytes: data.sizeBytes,
      sha256: data.sha256,
    });
    let stage: LinkedInUploadRecovery["stage"] = "registered";
    const matches = (outcome: z.infer<typeof uploadReceiptSchema>): boolean =>
      outcome.sizeBytes === facts.sizeBytes && outcome.sha256 === facts.sha256;
    try {
      signal.throwIfAborted();
      const files = this.getFileTransfers?.();
      if (!files) throw new Error("LinkedIn file uploads are not provisioned");
      const result = await files.putHttp(
        {
          sourceFile: data.sourceFile,
          facts,
          url: uploadUrl,
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            "Content-Type": data.mimeType,
          },
        },
        { signal },
      );
      const receipt = Object.freeze(uploadReceiptSchema.parse(result));
      if (!matches(receipt))
        throw new Error(
          "LinkedIn upload receipt does not match its source or status",
        );
      return receipt;
    } catch (error) {
      if (error instanceof ReceivedEntityFileHttpError) {
        try {
          const receipt = uploadReceiptSchema.safeParse(error.outcome);
          if (
            receipt.success &&
            matches(receipt.data) &&
            receipt.data.statusCode < 300
          )
            stage = "upload-received";
        } catch {
          // Malformed evidence cannot advance the stage or erase the failure.
          stage = "registered";
        }
      }
      throw new PartialLinkedInUploadError(
        { kind, resourceUrn, ...facts, stage },
        error,
      );
    }
  }

  /**
   * Publish a native LinkedIn document post via the versioned /rest Posts API.
   */
  private async publishDocumentPost(
    author: string,
    content: string,
    documentUrn: string,
    title: string,
    signal: AbortSignal,
  ): Promise<PublishResult> {
    signal.throwIfAborted();
    const response = await this.fetch(`${this.restApiBaseUrl}/posts`, {
      signal,
      method: "POST",
      headers: this.getRestHeaders(),
      body: JSON.stringify({
        author,
        commentary: content,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          media: {
            id: documentUrn,
            title,
          },
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });

    if (!response.ok) {
      const errorText = await summarizeApiError(response);
      this.logger.error("LinkedIn document post API error", {
        status: response.status,
        error: errorText,
      });
      throw new Error(
        `LinkedIn document post API error: ${response.status} - ${errorText}`,
      );
    }

    const postId = response.headers.get("X-RestLi-Id") ?? "";
    const result: PublishResult = { id: postId };
    if (postId) {
      result.url = `https://www.linkedin.com/feed/update/${postId}`;
    }
    return this.settleAcknowledgedResponse(response, result, () => {
      this.logger.info("LinkedIn document post created", {
        postId,
        documentUrn,
      });
    });
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
        const response = await this.fetch(
          `${this.apiBaseUrl}/organizations/${this.config.organizationId}`,
          {
            headers: {
              Authorization: `Bearer ${this.config.accessToken}`,
            },
          },
        );
        await response.body?.cancel();
        return response.ok;
      }

      await this.getUserId();
      return true;
    } catch {
      // Credentials we cannot check are credentials we cannot use, so
      // unreachable and invalid are the same answer to this question.
      return false;
    }
  }

  /**
   * Get the author URN for posting.
   * Returns organization URN if organizationId is configured, otherwise personal URN.
   */
  private async getAuthor(signal?: AbortSignal): Promise<string> {
    if (this.config.organizationId) {
      return `urn:li:organization:${this.config.organizationId}`;
    }
    return this.getUserId(signal);
  }

  /**
   * Get the current user's LinkedIn ID (URN)
   * Tries /v2/userinfo first (requires openid scope), falls back to /v2/me
   */
  private async getUserId(signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    if (this.cachedUserId) {
      return this.cachedUserId;
    }

    if (!this.config.accessToken) {
      throw new Error("LinkedIn access token not configured");
    }

    // Try OpenID Connect userinfo endpoint first (requires openid scope)
    try {
      const userinfoResponse = await this.fetch(
        "https://api.linkedin.com/v2/userinfo",
        {
          ...(signal && { signal }),
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
          },
        },
      );

      if (userinfoResponse.ok) {
        const parsedUserInfo = linkedInUserInfoSchema.safeParse(
          await readBoundedJsonResponse(userinfoResponse, 64 * 1024),
        );
        if (parsedUserInfo.success) {
          this.cachedUserId = `urn:li:person:${parsedUserInfo.data.sub}`;
          return this.cachedUserId;
        }
      } else await userinfoResponse.body?.cancel();
    } catch (error) {
      if (signal?.aborted) throw error;
      // OpenID is optional; the authenticated /me endpoint can still work.
      this.logger.debug("LinkedIn OpenID lookup unavailable", { error });
    }

    signal?.throwIfAborted();
    // Fall back to /v2/me endpoint (works with w_member_social)
    const meResponse = await this.fetch("https://api.linkedin.com/v2/me", {
      ...(signal && { signal }),
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    });

    if (!meResponse.ok) {
      const errorText = await summarizeApiError(meResponse);
      throw new Error(
        `Failed to get LinkedIn user ID: ${meResponse.status} - ${errorText}`,
      );
    }

    const meData = linkedInMeSchema.parse(
      await readBoundedJsonResponse(meResponse, 64 * 1024),
    );
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
  deps: LinkedInClientDeps = {},
): PublishProvider {
  return new LinkedInClient(config, logger, deps);
}
