import { describe, it, expect, beforeEach, mock } from "bun:test";
import { LinkedInClient } from "../../src/lib/linkedin-client";
import type { LinkedinConfig } from "../../src/config";
import type { PublishImageData, PublishMediaData } from "@brains/contracts";
import { createMockLogger } from "@brains/test-utils";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const TINY_PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF\n");

type FetchHandler = (...args: unknown[]) => Promise<Partial<Response>>;

function createFetchStub(handler: FetchHandler): ReturnType<typeof mock> {
  return mock(handler);
}

function asFetch(stub: ReturnType<typeof mock>): typeof fetch {
  return stub as unknown as typeof fetch;
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
        fetch: asFetch(fetchStub),
      });

      const result = await client.publish("Hello LinkedIn!", {});

      expect(fetchStub).toHaveBeenCalled();
      const [, options] = fetchStub.mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(options.body as string);

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
        fetch: asFetch(fetchStub),
      });

      const imageData: PublishImageData = {
        data: Buffer.from(TINY_PNG_BASE64, "base64"),
        mimeType: "image/png",
      };

      const result = await client.publish("Post with image!", {}, imageData);

      expect(fetchStub).toHaveBeenCalledTimes(4);
      expect(result.id).toBe("urn:li:share:456");

      const [, options] = fetchStub.mock.calls[3] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
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
        fetch: asFetch(fetchStub),
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
      const body = JSON.parse(options.body as string);
      expect(
        body.specificContent["com.linkedin.ugc.ShareContent"]
          .shareMediaCategory,
      ).toBe("NONE");
    });
  });

  describe("publish with document", () => {
    it("should register upload, upload PDF, then publish with DOCUMENT category", async () => {
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
                        uploadUrl: "https://api.linkedin.com/upload/doc123",
                      },
                  },
                  asset: "urn:li:digitalmediaAsset:doc123",
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
        fetch: asFetch(fetchStub),
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

      const registerOptions = getRequestOptions(getMockCall(fetchStub, 1));
      const registerBody = parseRequestJson(registerOptions);
      expect(registerBody).toMatchObject({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-document"],
        },
      });

      const uploadOptions = getRequestOptions(getMockCall(fetchStub, 2));
      expect(uploadOptions.headers).toEqual({
        Authorization: "Bearer test-token",
        "Content-Type": "application/pdf",
      });

      const publishOptions = getRequestOptions(getMockCall(fetchStub, 3));
      const publishBody = parseRequestJson(publishOptions);
      expect(publishBody).toMatchObject({
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareMediaCategory: "DOCUMENT",
            media: [
              {
                status: "READY",
                media: "urn:li:digitalmediaAsset:doc123",
                title: { text: "carousel.pdf" },
              },
            ],
          },
        },
      });
    });

    it("should fall back to text-only if document upload fails", async () => {
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
            headers: new Headers({ "X-RestLi-Id": "urn:li:share:doc789" }),
          });
        }
      });
      const client = new LinkedInClient(config, logger, {
        fetch: asFetch(fetchStub),
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
        "Post with failed document",
        {},
        undefined,
        documentData,
      );

      expect(logger.warn).toHaveBeenCalled();
      expect(result.id).toBe("urn:li:share:doc789");

      const publishOptions = getRequestOptions(getMockCall(fetchStub, 2));
      const publishBody = parseRequestJson(publishOptions);
      expect(publishBody).toMatchObject({
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareMediaCategory: "NONE",
          },
        },
      });
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
        { fetch: asFetch(fetchStub) },
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
        { fetch: asFetch(fetchStub) },
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
      const body = JSON.parse(options.body as string);
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
      const registerBody = JSON.parse(registerOptions.body as string);
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
        fetch: asFetch(fetchStub),
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
        { fetch: asFetch(fetchStub) },
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
        { fetch: asFetch(fetchStub) },
      );

      const result = await orgClient.validateCredentials();
      expect(result).toBe(false);
    });
  });
});
