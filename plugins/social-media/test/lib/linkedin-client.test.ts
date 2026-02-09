import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { LinkedInClient } from "../../src/lib/linkedin-client";
import type { LinkedinConfig } from "../../src/config";
import type { PublishImageData } from "@brains/utils";

// Mock logger
interface MockLogger {
  child: () => MockLogger;
  info: ReturnType<typeof mock>;
  debug: ReturnType<typeof mock>;
  error: ReturnType<typeof mock>;
  warn: ReturnType<typeof mock>;
}

function createMockLogger(): MockLogger {
  const logger: MockLogger = {
    child: (): MockLogger => createMockLogger(),
    info: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
  };
  return logger;
}

// Minimal 1x1 PNG for testing
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// Store original fetch to restore after tests
const originalFetch = globalThis.fetch;

describe("LinkedInClient", () => {
  let client: LinkedInClient;
  let config: LinkedinConfig;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchMock: ReturnType<typeof mock>;

  beforeEach(() => {
    config = { accessToken: "test-token" };
    logger = createMockLogger();
    client = new LinkedInClient(config, logger as never);

    // Mock fetch globally
    fetchMock = mock(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "X-RestLi-Id": "urn:li:share:123" }),
        json: () => Promise.resolve({ sub: "user123" }),
        text: () => Promise.resolve(""),
      }),
    );
    globalThis.fetch = fetchMock as never;
  });

  afterEach(() => {
    // Restore original fetch
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
      fetchMock = mock(() => {
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
      globalThis.fetch = fetchMock as never;

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
      fetchMock = mock(() => {
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
      globalThis.fetch = fetchMock as never;

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

  describe("organization mode", () => {
    let orgClient: LinkedInClient;

    beforeEach(() => {
      const orgConfig: LinkedinConfig = {
        accessToken: "test-token",
        organizationId: "12345",
      };
      orgClient = new LinkedInClient(orgConfig, logger as never);
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
      fetchMock = mock(() => {
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
      globalThis.fetch = fetchMock as never;

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
      const clientNoToken = new LinkedInClient(
        { accessToken: "" },
        logger as never,
      );
      const result = await clientNoToken.validateCredentials();
      expect(result).toBe(false);
    });

    it("should validate org credentials by fetching organization endpoint", async () => {
      const orgConfig: LinkedinConfig = {
        accessToken: "test-token",
        organizationId: "12345",
      };
      const orgClient = new LinkedInClient(orgConfig, logger as never);

      fetchMock = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 12345 }),
        }),
      );
      globalThis.fetch = fetchMock as never;

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
      const orgClient = new LinkedInClient(orgConfig, logger as never);

      fetchMock = mock(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve("Forbidden"),
        }),
      );
      globalThis.fetch = fetchMock as never;

      const result = await orgClient.validateCredentials();
      expect(result).toBe(false);
    });
  });
});
