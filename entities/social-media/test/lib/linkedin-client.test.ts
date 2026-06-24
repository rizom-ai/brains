import { describe, it, expect, beforeEach, mock } from "bun:test";
import { LinkedInClient } from "../../src/lib/linkedin-client";
import type { LinkedinConfig } from "../../src/config";
import type { PublishImageData, PublishMediaData } from "@brains/contracts";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod-v4";

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

type FetchHandler = (...args: unknown[]) => Promise<Partial<Response>>;

function createFetchStub(handler: FetchHandler): ReturnType<typeof mock> {
  return mock(handler);
}

function getMockCall(
  mocked: ReturnType<typeof mock>,
  index: number,
): unknown[] {
  const call = mocked.mock.calls[index];
  if (!call) {
    throw new Error(`Expected mock call at index ${index}`);
  }
  return call;
}

function getRequestOptions(call: unknown[]): RequestInit {
  const options = call[1];
  if (!isRequestInit(options)) {
    throw new Error("Expected request options");
  }
  return options;
}

function isRequestInit(value: unknown): value is RequestInit {
  return typeof value === "object" && value !== null;
}

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
  expect((error as Error).message).toMatch(pattern);
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
      const fetchStub = createFetchStub(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ "X-RestLi-Id": "urn:li:share:123" }),
          json: () => Promise.resolve({ sub: "user123" }),
          text: () => Promise.resolve(""),
        }),
      );
      const client = new LinkedInClient(config, logger, {
        fetch: fetchStub,
      });

      const result = await client.publish("Hello LinkedIn!", {});

      expect(fetchStub).toHaveBeenCalled();
      const [, options] = fetchStub.mock.calls[1] as [string, RequestInit];
      const body = linkedInUgcPostBodySchema.parse(parseRequestJson(options));

      expect(
        body.specificContent["com.linkedin.ugc.ShareContent"]
          .shareMediaCategory,
      ).toBe("NONE");
      expect(result.id).toBe("urn:li:share:123");
    });
  });

  describe("publish with image", () => {
    it("should register upload, upload binary, then publish with IMAGE category", async () => {
      let callCount = 0;
      const fetchStub = createFetchStub(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sub: "user123" }),
          });
        } else if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                value: {
                  uploadMechanism: {
                    "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest":
                      {
                        uploadUrl: "https://api.linkedin.com/upload/123",
                      },
                  },
                  asset: "urn:li:digitalmediaAsset:abc123",
                },
              }),
          });
        } else if (callCount === 3) {
          return Promise.resolve({ ok: true });
        } else {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "X-RestLi-Id": "urn:li:share:456" }),
          });
        }
      });
      const client = new LinkedInClient(config, logger, {
        fetch: fetchStub,
      });

      const imageData: PublishImageData = {
        data: Buffer.from(TINY_PNG_BASE64, "base64"),
        mimeType: "image/png",
      };

      const result = await client.publish("Post with image!", {}, imageData);

      expect(fetchStub).toHaveBeenCalledTimes(4);
      expect(result.id).toBe("urn:li:share:456");

      const [, options] = fetchStub.mock.calls[3] as [string, RequestInit];
      const body = linkedInUgcPostBodySchema.parse(parseRequestJson(options));
      expect(
        body.specificContent["com.linkedin.ugc.ShareContent"]
          .shareMediaCategory,
      ).toBe("IMAGE");
      expect(
        body.specificContent["com.linkedin.ugc.ShareContent"].media,
      ).toBeDefined();
    });

    it("should fall back to text-only if image upload fails", async () => {
      let callCount = 0;
      const fetchStub = createFetchStub(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sub: "user123" }),
          });
        } else if (callCount === 2) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve("Upload service unavailable"),
          });
        } else {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "X-RestLi-Id": "urn:li:share:789" }),
          });
        }
      });
      const client = new LinkedInClient(config, logger, {
        fetch: fetchStub,
      });

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

      const [, options] = fetchStub.mock.calls[2] as [string, RequestInit];
      const body = linkedInUgcPostBodySchema.parse(parseRequestJson(options));
      expect(
        body.specificContent["com.linkedin.ugc.ShareContent"]
          .shareMediaCategory,
      ).toBe("NONE");
    });
  });

  describe("publish with document", () => {
    it("should initialize document upload, upload PDF, then publish a native document post", async () => {
      let callCount = 0;
      const fetchStub = createFetchStub(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sub: "user123" }),
          });
        } else if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                value: {
                  uploadUrl: "https://api.linkedin.com/upload/doc123",
                  document: "urn:li:document:doc123",
                },
              }),
          });
        } else if (callCount === 3) {
          return Promise.resolve({ ok: true });
        } else {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "X-RestLi-Id": "urn:li:share:doc456" }),
          });
        }
      });
      const client = new LinkedInClient(config, logger, {
        fetch: fetchStub,
      });

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

      expect(fetchStub).toHaveBeenCalledTimes(4);
      expect(result.id).toBe("urn:li:share:doc456");

      const [initializeUrl] = getMockCall(fetchStub, 1) as [
        string,
        RequestInit,
      ];
      expect(initializeUrl).toBe(
        "https://api.linkedin.com/rest/documents?action=initializeUpload",
      );
      const registerOptions = getRequestOptions(getMockCall(fetchStub, 1));
      expect(registerOptions.headers).toMatchObject({
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
        "Linkedin-Version": "202604",
        "X-Restli-Protocol-Version": "2.0.0",
      });
      const registerBody = parseRequestJson(registerOptions);
      expect(registerBody).toEqual({
        initializeUploadRequest: {
          owner: "urn:li:person:user123",
        },
      });

      const uploadOptions = getRequestOptions(getMockCall(fetchStub, 2));
      expect(uploadOptions.headers).toEqual({
        Authorization: "Bearer test-token",
        "Content-Type": "application/pdf",
      });

      const [publishUrl] = getMockCall(fetchStub, 3) as [string, RequestInit];
      expect(publishUrl).toBe("https://api.linkedin.com/rest/posts");
      const publishOptions = getRequestOptions(getMockCall(fetchStub, 3));
      expect(publishOptions.headers).toMatchObject({
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
        "Linkedin-Version": "202604",
        "X-Restli-Protocol-Version": "2.0.0",
      });
      const publishBody = parseRequestJson(publishOptions);
      expect(publishBody).toEqual({
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
      let callCount = 0;
      const fetchStub = createFetchStub(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sub: "user123" }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Upload service unavailable"),
        });
      });
      const client = new LinkedInClient(config, logger, {
        fetch: fetchStub,
      });

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
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });

    it("should throw if document binary upload fails", async () => {
      let callCount = 0;
      const fetchStub = createFetchStub(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sub: "user123" }),
          });
        } else if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                value: {
                  uploadUrl: "https://api.linkedin.com/upload/doc-err",
                  document: "urn:li:document:doc-err",
                },
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 502 });
      });
      const client = new LinkedInClient(config, logger, {
        fetch: fetchStub,
      });

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
      expect(fetchStub).toHaveBeenCalledTimes(3);
    });

    it("should throw if native document post creation fails", async () => {
      let callCount = 0;
      const fetchStub = createFetchStub(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sub: "user123" }),
          });
        } else if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                value: {
                  uploadUrl: "https://api.linkedin.com/upload/doc-post-err",
                  document: "urn:li:document:doc-post-err",
                },
              }),
          });
        } else if (callCount === 3) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({
          ok: false,
          status: 422,
          text: () => Promise.resolve("Invalid document post"),
        });
      });
      const client = new LinkedInClient(config, logger, {
        fetch: fetchStub,
      });

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

      expect(fetchStub).toHaveBeenCalledTimes(4);
      const [publishUrl] = getMockCall(fetchStub, 3) as [string, RequestInit];
      expect(publishUrl).toBe("https://api.linkedin.com/rest/posts");
    });
  });

  describe("error body scrubbing", () => {
    it("should truncate oversized LinkedIn error bodies in the thrown message", async () => {
      const longBody = "x".repeat(500);
      const fetchStub = createFetchStub(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve(longBody),
        }),
      );
      const orgClient = new LinkedInClient(
        { accessToken: "test-token", organizationId: "12345" },
        logger,
        { fetch: fetchStub },
      );

      let error: unknown;
      try {
        await orgClient.publish("Hello", {});
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain("truncated");
      expect(message.length).toBeLessThan(longBody.length);
    });
  });

  describe("organization mode", () => {
    function makeOrgClient(fetchStub: ReturnType<typeof mock>): LinkedInClient {
      return new LinkedInClient(
        { accessToken: "test-token", organizationId: "12345" },
        logger,
        { fetch: fetchStub },
      );
    }

    it("should use organization URN as author", async () => {
      const fetchStub = createFetchStub(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ "X-RestLi-Id": "urn:li:share:123" }),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(""),
        }),
      );
      const orgClient = makeOrgClient(fetchStub);

      const result = await orgClient.publish("Hello org!", {});

      expect(fetchStub).toHaveBeenCalledTimes(1);
      const [url, options] = fetchStub.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/ugcPosts");
      const body = linkedInAuthoredPostBodySchema.parse(
        parseRequestJson(options),
      );
      expect(body.author).toBe("urn:li:organization:12345");
      expect(result.id).toBe("urn:li:share:123");
    });

    it("should use organization URN as owner in image upload", async () => {
      let callCount = 0;
      const fetchStub = createFetchStub(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                value: {
                  uploadMechanism: {
                    "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest":
                      {
                        uploadUrl: "https://api.linkedin.com/upload/123",
                      },
                  },
                  asset: "urn:li:digitalmediaAsset:abc123",
                },
              }),
          });
        } else if (callCount === 2) {
          return Promise.resolve({ ok: true });
        } else {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "X-RestLi-Id": "urn:li:share:org456" }),
          });
        }
      });
      const orgClient = makeOrgClient(fetchStub);

      const imageData: PublishImageData = {
        data: Buffer.from(TINY_PNG_BASE64, "base64"),
        mimeType: "image/png",
      };

      await orgClient.publish("Org post with image!", {}, imageData);

      expect(fetchStub).toHaveBeenCalledTimes(3);

      const [, registerOptions] = fetchStub.mock.calls[0] as [
        string,
        RequestInit,
      ];
      const registerBody = linkedInRegisterUploadBodySchema.parse(
        parseRequestJson(registerOptions),
      );
      expect(registerBody.registerUploadRequest.owner).toBe(
        "urn:li:organization:12345",
      );
    });
  });

  describe("validateCredentials", () => {
    it("should return true when token is valid", async () => {
      const fetchStub = createFetchStub(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sub: "user123" }),
        }),
      );
      const client = new LinkedInClient(config, logger, {
        fetch: fetchStub,
      });

      const result = await client.validateCredentials();
      expect(result).toBe(true);
    });

    it("should return false when no token configured", async () => {
      const clientNoToken = new LinkedInClient({ accessToken: "" }, logger);
      const result = await clientNoToken.validateCredentials();
      expect(result).toBe(false);
    });

    it("should validate org credentials by fetching organization endpoint", async () => {
      const fetchStub = createFetchStub(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 12345 }),
        }),
      );
      const orgClient = new LinkedInClient(
        { accessToken: "test-token", organizationId: "12345" },
        logger,
        { fetch: fetchStub },
      );

      const result = await orgClient.validateCredentials();
      expect(result).toBe(true);

      const [url] = fetchStub.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/organizations/12345");
    });

    it("should return false when org validation fails", async () => {
      const fetchStub = createFetchStub(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve("Forbidden"),
        }),
      );
      const orgClient = new LinkedInClient(
        { accessToken: "test-token", organizationId: "12345" },
        logger,
        { fetch: fetchStub },
      );

      const result = await orgClient.validateCredentials();
      expect(result).toBe(false);
    });
  });
});
