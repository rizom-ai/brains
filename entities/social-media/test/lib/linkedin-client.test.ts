import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { LinkedInClient } from "../../src/lib/linkedin-client";
import type { LinkedinConfig } from "../../src/config";
import type { PublishImageData, PublishMediaData } from "@brains/contracts";
import { createMockLogger } from "@brains/test-utils";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const TINY_PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF\n");

const originalFetch = globalThis.fetch;

// Centralizes the single `as unknown as typeof fetch` cast needed for bun's mock type
function installFetchMock(
  handler: (...args: unknown[]) => Promise<Partial<Response>>,
): ReturnType<typeof mock> {
  const mocked = mock(handler);
  globalThis.fetch = mocked as unknown as typeof fetch;
  return mocked;
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
  let client: LinkedInClient;
  let config: LinkedinConfig;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchMock: ReturnType<typeof mock>;

  beforeEach(() => {
    config = { accessToken: "test-token" };
    logger = createMockLogger();
    client = new LinkedInClient(config, logger);

    fetchMock = installFetchMock(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "X-RestLi-Id": "urn:li:share:123" }),
        json: () => Promise.resolve({ sub: "user123" }),
        text: () => Promise.resolve(""),
      }),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("publish without image", () => {
    it("should publish text-only post with shareMediaCategory NONE", async () => {
      const result = await client.publish("Hello LinkedIn!", {});

      expect(fetchMock).toHaveBeenCalled();
      const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
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
      // Mock responses for the 3-step flow
      let callCount = 0;
      fetchMock = installFetchMock(() => {
        callCount++;
        if (callCount === 1) {
          // getUserId call
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sub: "user123" }),
          });
        } else if (callCount === 2) {
          // registerUpload call
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
          // uploadBinary call
          return Promise.resolve({ ok: true });
        } else {
          // publishPost call
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "X-RestLi-Id": "urn:li:share:456" }),
          });
        }
      });

      const imageData: PublishImageData = {
        data: Buffer.from(TINY_PNG_BASE64, "base64"),
        mimeType: "image/png",
      };

      const result = await client.publish("Post with image!", {}, imageData);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(result.id).toBe("urn:li:share:456");

      // Verify the final post has IMAGE category
      const [, options] = fetchMock.mock.calls[3] as [string, RequestInit];
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
      fetchMock = installFetchMock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sub: "user123" }),
          });
        } else if (callCount === 2) {
          // registerUpload fails
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve("Upload service unavailable"),
          });
        } else {
          // Should still publish text-only
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "X-RestLi-Id": "urn:li:share:789" }),
          });
        }
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

      // Should have logged warning and published without image
      expect(logger.warn).toHaveBeenCalled();
      expect(result.id).toBe("urn:li:share:789");

      // Verify text-only post
      const [, options] = fetchMock.mock.calls[2] as [string, RequestInit];
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
      fetchMock = installFetchMock(() => {
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

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(result.id).toBe("urn:li:share:doc456");

      const registerOptions = getRequestOptions(getMockCall(fetchMock, 1));
      const registerBody = parseRequestJson(registerOptions);
      expect(registerBody).toMatchObject({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-document"],
        },
      });

      const uploadOptions = getRequestOptions(getMockCall(fetchMock, 2));
      expect(uploadOptions.headers).toEqual({
        Authorization: "Bearer test-token",
        "Content-Type": "application/pdf",
      });

      const publishOptions = getRequestOptions(getMockCall(fetchMock, 3));
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
      fetchMock = installFetchMock(() => {
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

      const publishOptions = getRequestOptions(getMockCall(fetchMock, 2));
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

  describe("organization mode", () => {
    let orgClient: LinkedInClient;

    beforeEach(() => {
      const orgConfig: LinkedinConfig = {
        accessToken: "test-token",
        organizationId: "12345",
      };
      orgClient = new LinkedInClient(orgConfig, logger);
    });

    it("should use organization URN as author", async () => {
      const result = await orgClient.publish("Hello org!", {});

      // Only 1 fetch call — no getUserId needed
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/ugcPosts");
      const body = JSON.parse(options.body as string);
      expect(body.author).toBe("urn:li:organization:12345");
      expect(result.id).toBe("urn:li:share:123");
    });

    it("should use organization URN as owner in image upload", async () => {
      let callCount = 0;
      fetchMock = installFetchMock(() => {
        callCount++;
        if (callCount === 1) {
          // registerUpload (no getUserId — org mode skips it)
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
          // uploadBinary
          return Promise.resolve({ ok: true });
        } else {
          // publishPost
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "X-RestLi-Id": "urn:li:share:org456" }),
          });
        }
      });

      const imageData: PublishImageData = {
        data: Buffer.from(TINY_PNG_BASE64, "base64"),
        mimeType: "image/png",
      };

      await orgClient.publish("Org post with image!", {}, imageData);

      // 3 calls: registerUpload, uploadBinary, publishPost (no getUserId)
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // Verify register upload has org URN as owner
      const [, registerOptions] = fetchMock.mock.calls[0] as [
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
      const result = await client.validateCredentials();
      expect(result).toBe(true);
    });

    it("should return false when no token configured", async () => {
      const clientNoToken = new LinkedInClient({ accessToken: "" }, logger);
      const result = await clientNoToken.validateCredentials();
      expect(result).toBe(false);
    });

    it("should validate org credentials by fetching organization endpoint", async () => {
      const orgConfig: LinkedinConfig = {
        accessToken: "test-token",
        organizationId: "12345",
      };
      const orgClient = new LinkedInClient(orgConfig, logger);

      fetchMock = installFetchMock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 12345 }),
        }),
      );

      const result = await orgClient.validateCredentials();
      expect(result).toBe(true);

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/organizations/12345");
    });

    it("should return false when org validation fails", async () => {
      const orgConfig: LinkedinConfig = {
        accessToken: "test-token",
        organizationId: "12345",
      };
      const orgClient = new LinkedInClient(orgConfig, logger);

      fetchMock = installFetchMock(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve("Forbidden"),
        }),
      );

      const result = await orgClient.validateCredentials();
      expect(result).toBe(false);
    });
  });
});
