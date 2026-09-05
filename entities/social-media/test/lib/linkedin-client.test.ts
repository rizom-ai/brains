import { describe, it, expect, beforeEach } from "bun:test";
import { LinkedInClient } from "../../src/lib/linkedin-client";
import type { LinkedinConfig } from "../../src/config";
import type { PublishImageData, PublishMediaData } from "@brains/contracts";
import { caughtError, createMockLogger } from "@brains/test-utils";
import { expectDefined } from "@brains/utils/expect-defined";
import type { FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const TINY_PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF\n");

const linkedInUgcPostBodySchema = z.looseObject({
  specificContent: z.looseObject({
    "com.linkedin.ugc.ShareContent": z.looseObject({
      shareMediaCategory: z.string(),
      media: z.unknown().optional(),
    }),
  }),
});

const linkedInAuthoredPostBodySchema = z.looseObject({
  author: z.string(),
});

const linkedInRegisterUploadBodySchema = z.looseObject({
  registerUploadRequest: z.looseObject({
    owner: z.string(),
  }),
});

interface RecordedRequest {
  url: string;
  init: RequestInit;
}

interface RecordingFetch {
  fetch: FetchLike;
  calls: RecordedRequest[];
}

/**
 * A FetchLike that records every request and answers with whatever the
 * responder returns for it. Responders return real Response objects, so
 * nothing here has to pretend to be one and the client is typed exactly as
 * it is in production.
 */
function recordFetch(
  respond: (call: RecordedRequest, index: number) => Response,
): RecordingFetch {
  const calls: RecordedRequest[] = [];
  const fetchFn: FetchLike = (input, init) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return Promise.resolve(respond(call, calls.length - 1));
  };
  return { fetch: fetchFn, calls };
}

const userinfo = (): Response => Response.json({ sub: "user123" });
const empty = (): Response => new Response("");
const created = (shareId: string): Response =>
  new Response("", { headers: { "X-RestLi-Id": shareId } });
const failed = (status: number, body: string): Response =>
  new Response(body, { status });

function parseRequestJson(options: RequestInit): unknown {
  if (typeof options.body !== "string") {
    throw new Error("Expected string request body");
  }
  return JSON.parse(options.body);
}

async function expectRejectsWith(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let error: unknown;
  try {
    await promise;
  } catch (err) {
    error = err;
  }

  expect(error).toBeInstanceOf(Error);
  expect(caughtError(error).message).toMatch(pattern);
}

describe("LinkedInClient", () => {
  let config: LinkedinConfig;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    config = { accessToken: "test-token" };
    logger = createMockLogger();
  });

  describe("publish without image", () => {
    it("should publish text-only post with shareMediaCategory NONE", async () => {
      // One answer serves both the userinfo lookup and the post creation.
      const { fetch, calls } = recordFetch(() =>
        Response.json(
          { sub: "user123" },
          { headers: { "X-RestLi-Id": "urn:li:share:123" } },
        ),
      );
      const client = new LinkedInClient(config, logger, { fetch });

      const result = await client.publish("Hello LinkedIn!", {});

      expect(calls).toHaveLength(2);
      const { init } = expectDefined(calls[1]);
      const body = linkedInUgcPostBodySchema.parse(parseRequestJson(init));

      expect(
        body.specificContent["com.linkedin.ugc.ShareContent"]
          .shareMediaCategory,
      ).toBe("NONE");
      expect(result.id).toBe("urn:li:share:123");
    });
  });

  describe("publish with image", () => {
    it("should register upload, upload binary, then publish with IMAGE category", async () => {
      const { fetch, calls } = recordFetch((_call, index) =>
        index === 0
          ? userinfo()
          : index === 1
            ? Response.json({
                value: {
                  uploadMechanism: {
                    "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest":
                      {
                        uploadUrl: "https://api.linkedin.com/upload/123",
                      },
                  },
                  asset: "urn:li:digitalmediaAsset:abc123",
                },
              })
            : index === 2
              ? empty()
              : created("urn:li:share:456"),
      );
      const client = new LinkedInClient(config, logger, { fetch });

      const imageData: PublishImageData = {
        data: Buffer.from(TINY_PNG_BASE64, "base64"),
        mimeType: "image/png",
      };

      const result = await client.publish("Post with image!", {}, imageData);

      expect(calls).toHaveLength(4);
      expect(result.id).toBe("urn:li:share:456");

      const { init } = expectDefined(calls[3]);
      const body = linkedInUgcPostBodySchema.parse(parseRequestJson(init));
      expect(
        body.specificContent["com.linkedin.ugc.ShareContent"]
          .shareMediaCategory,
      ).toBe("IMAGE");
      expect(
        body.specificContent["com.linkedin.ugc.ShareContent"].media,
      ).toBeDefined();
    });

    it("should fall back to text-only if image upload fails", async () => {
      const { fetch, calls } = recordFetch((_call, index) =>
        index === 0
          ? userinfo()
          : index === 1
            ? failed(500, "Upload service unavailable")
            : created("urn:li:share:789"),
      );
      const client = new LinkedInClient(config, logger, { fetch });

      const imageData: PublishImageData = {
        data: Buffer.from(TINY_PNG_BASE64, "base64"),
        mimeType: "image/png",
      };

      const result = await client.publish(
        "Post with failed image",
        {},
        imageData,
      );

      expect(logger.warn).toHaveBeenCalled();
      expect(result.id).toBe("urn:li:share:789");

      const { init } = expectDefined(calls[2]);
      const body = linkedInUgcPostBodySchema.parse(parseRequestJson(init));
      expect(
        body.specificContent["com.linkedin.ugc.ShareContent"]
          .shareMediaCategory,
      ).toBe("NONE");
    });
  });

  describe("publish with document", () => {
    it("should initialize document upload, upload PDF, then publish a native document post", async () => {
      const { fetch, calls } = recordFetch((_call, index) =>
        index === 0
          ? userinfo()
          : index === 1
            ? Response.json({
                value: {
                  uploadUrl: "https://api.linkedin.com/upload/doc123",
                  document: "urn:li:document:doc123",
                },
              })
            : index === 2
              ? empty()
              : created("urn:li:share:doc456"),
      );
      const client = new LinkedInClient(config, logger, { fetch });

      const documentData: PublishMediaData[] = [
        {
          type: "document",
          data: TINY_PDF_BYTES,
          mimeType: "application/pdf",
          filename: "carousel.pdf",
        },
      ];

      const result = await client.publish(
        "Post with PDF carousel!",
        {},
        undefined,
        documentData,
      );

      expect(calls).toHaveLength(4);
      expect(result.id).toBe("urn:li:share:doc456");

      const register = expectDefined(calls[1]);
      expect(register.url).toBe(
        "https://api.linkedin.com/rest/documents?action=initializeUpload",
      );
      expect(register.init.headers).toMatchObject({
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
        "Linkedin-Version": "202604",
        "X-Restli-Protocol-Version": "2.0.0",
      });
      expect(parseRequestJson(register.init)).toEqual({
        initializeUploadRequest: {
          owner: "urn:li:person:user123",
        },
      });

      const upload = expectDefined(calls[2]);
      expect(upload.init.headers).toEqual({
        Authorization: "Bearer test-token",
        "Content-Type": "application/pdf",
      });

      const publish = expectDefined(calls[3]);
      expect(publish.url).toBe("https://api.linkedin.com/rest/posts");
      expect(publish.init.headers).toMatchObject({
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
        "Linkedin-Version": "202604",
        "X-Restli-Protocol-Version": "2.0.0",
      });
      expect(parseRequestJson(publish.init)).toEqual({
        author: "urn:li:person:user123",
        commentary: "Post with PDF carousel!",
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          media: {
            id: "urn:li:document:doc123",
            title: "carousel.pdf",
          },
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      });
    });

    it("should throw if document upload fails and skip the publish call", async () => {
      const { fetch, calls } = recordFetch((_call, index) =>
        index === 0 ? userinfo() : failed(500, "Upload service unavailable"),
      );
      const client = new LinkedInClient(config, logger, { fetch });

      const documentData: PublishMediaData[] = [
        {
          type: "document",
          data: TINY_PDF_BYTES,
          mimeType: "application/pdf",
          filename: "carousel.pdf",
        },
      ];

      await expectRejectsWith(
        client.publish(
          "Post with failed document",
          {},
          undefined,
          documentData,
        ),
        /document upload initialization failed: 500/,
      );

      // userinfo + initialize upload only; no publish call attempted.
      expect(calls).toHaveLength(2);
    });

    it("should throw if document binary upload fails", async () => {
      const { fetch, calls } = recordFetch((_call, index) =>
        index === 0
          ? userinfo()
          : index === 1
            ? Response.json({
                value: {
                  uploadUrl: "https://api.linkedin.com/upload/doc-err",
                  document: "urn:li:document:doc-err",
                },
              })
            : failed(502, ""),
      );
      const client = new LinkedInClient(config, logger, { fetch });

      const documentData: PublishMediaData[] = [
        {
          type: "document",
          data: TINY_PDF_BYTES,
          mimeType: "application/pdf",
          filename: "carousel.pdf",
        },
      ];

      await expectRejectsWith(
        client.publish(
          "Post with failed binary upload",
          {},
          undefined,
          documentData,
        ),
        /document binary upload failed: 502/,
      );

      // userinfo + initialize + binary PUT; no publish call attempted.
      expect(calls).toHaveLength(3);
    });

    it("should throw if native document post creation fails", async () => {
      const { fetch, calls } = recordFetch((_call, index) =>
        index === 0
          ? userinfo()
          : index === 1
            ? Response.json({
                value: {
                  uploadUrl: "https://api.linkedin.com/upload/doc-post-err",
                  document: "urn:li:document:doc-post-err",
                },
              })
            : index === 2
              ? empty()
              : failed(422, "Invalid document post"),
      );
      const client = new LinkedInClient(config, logger, { fetch });

      const documentData: PublishMediaData[] = [
        {
          type: "document",
          data: TINY_PDF_BYTES,
          mimeType: "application/pdf",
          filename: "carousel.pdf",
        },
      ];

      await expectRejectsWith(
        client.publish(
          "Post with failed native document post",
          {},
          undefined,
          documentData,
        ),
        /document post API error: 422/,
      );

      expect(calls).toHaveLength(4);
      expect(expectDefined(calls[3]).url).toBe(
        "https://api.linkedin.com/rest/posts",
      );
    });
  });

  describe("error body scrubbing", () => {
    it("should truncate oversized LinkedIn error bodies in the thrown message", async () => {
      const longBody = "x".repeat(500);
      const { fetch } = recordFetch(() => failed(500, longBody));
      const orgClient = new LinkedInClient(
        { accessToken: "test-token", organizationId: "12345" },
        logger,
        { fetch },
      );

      let error: unknown;
      try {
        await orgClient.publish("Hello", {});
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(Error);
      const message = caughtError(error).message;
      expect(message).toContain("truncated");
      expect(message.length).toBeLessThan(longBody.length);
    });
  });

  describe("organization mode", () => {
    function makeOrgClient(fetchFn: FetchLike): LinkedInClient {
      return new LinkedInClient(
        { accessToken: "test-token", organizationId: "12345" },
        logger,
        { fetch: fetchFn },
      );
    }

    it("should use organization URN as author", async () => {
      const { fetch, calls } = recordFetch(() => created("urn:li:share:123"));
      const orgClient = makeOrgClient(fetch);

      const result = await orgClient.publish("Hello org!", {});

      expect(calls).toHaveLength(1);
      const { url, init } = expectDefined(calls[0]);
      expect(url).toContain("/ugcPosts");
      const body = linkedInAuthoredPostBodySchema.parse(parseRequestJson(init));
      expect(body.author).toBe("urn:li:organization:12345");
      expect(result.id).toBe("urn:li:share:123");
    });

    it("should use organization URN as owner in image upload", async () => {
      const { fetch, calls } = recordFetch((_call, index) =>
        index === 0
          ? Response.json({
              value: {
                uploadMechanism: {
                  "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest":
                    {
                      uploadUrl: "https://api.linkedin.com/upload/123",
                    },
                },
                asset: "urn:li:digitalmediaAsset:abc123",
              },
            })
          : index === 1
            ? empty()
            : created("urn:li:share:org456"),
      );
      const orgClient = makeOrgClient(fetch);

      const imageData: PublishImageData = {
        data: Buffer.from(TINY_PNG_BASE64, "base64"),
        mimeType: "image/png",
      };

      await orgClient.publish("Org post with image!", {}, imageData);

      expect(calls).toHaveLength(3);

      const { init } = expectDefined(calls[0]);
      const registerBody = linkedInRegisterUploadBodySchema.parse(
        parseRequestJson(init),
      );
      expect(registerBody.registerUploadRequest.owner).toBe(
        "urn:li:organization:12345",
      );
    });
  });

  describe("validateCredentials", () => {
    it("should return true when token is valid", async () => {
      const { fetch } = recordFetch(() => userinfo());
      const client = new LinkedInClient(config, logger, { fetch });

      const result = await client.validateCredentials();
      expect(result).toBe(true);
    });

    it("should return false when no token configured", async () => {
      const clientNoToken = new LinkedInClient({ accessToken: "" }, logger);
      const result = await clientNoToken.validateCredentials();
      expect(result).toBe(false);
    });

    it("should validate org credentials by fetching organization endpoint", async () => {
      const { fetch, calls } = recordFetch(() => Response.json({ id: 12345 }));
      const orgClient = new LinkedInClient(
        { accessToken: "test-token", organizationId: "12345" },
        logger,
        { fetch },
      );

      const result = await orgClient.validateCredentials();
      expect(result).toBe(true);

      expect(expectDefined(calls[0]).url).toContain("/organizations/12345");
    });

    it("should return false when org validation fails", async () => {
      const { fetch } = recordFetch(() => failed(403, "Forbidden"));
      const orgClient = new LinkedInClient(
        { accessToken: "test-token", organizationId: "12345" },
        logger,
        { fetch },
      );

      const result = await orgClient.validateCredentials();
      expect(result).toBe(false);
    });
  });
});
