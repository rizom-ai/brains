import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SocialMediaPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { mockFetch, type FetchHandler } from "@brains/test-utils";
import type { SocialPost } from "../src/schemas/social-post";

const samplePost: SocialPost = {
  id: "post-1",
  entityType: "social-post",
  visibility: "public",
  content: `---
title: Test LinkedIn Post
platform: linkedin
status: queued
---
This is a test post for LinkedIn.`,
  metadata: {
    title: "Test LinkedIn Post",
    platform: "linkedin",
    status: "queued",
    slug: "linkedin-test-linkedin-post-20260114",
  },
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

describe("SocialMediaPlugin - Execute Handler", () => {
  let harness: PluginTestHarness<SocialMediaPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<SocialMediaPlugin>({
      dataDir: "/tmp/test-social",
    });
    receivedMessages = [];

    for (const eventType of [
      "publish:report:success",
      "publish:report:failure",
    ]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }

    await harness.installPlugin(new SocialMediaPlugin({}));
  });

  describe("publish:execute handler", () => {
    it("should report failure when entity not found", async () => {
      await harness.sendMessage("publish:execute", {
        entityType: "social-post",
        entityId: "non-existent",
      });

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]?.type).toBe("publish:report:failure");
      expect(receivedMessages[0]?.payload).toMatchObject({
        entityType: "social-post",
        entityId: "non-existent",
        error: expect.stringContaining("not found"),
      });
    });

    it("should report failure when provider not configured", async () => {
      const entityService = harness.getEntityService();
      await entityService.createEntity({ entity: samplePost });

      await harness.sendMessage("publish:execute", {
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]?.type).toBe("publish:report:failure");
      expect(receivedMessages[0]?.payload).toMatchObject({
        entityType: "social-post",
        entityId: "post-1",
        error: expect.stringContaining("No provider"),
      });
    });

    it("should skip non-social-post entity types", async () => {
      await harness.sendMessage("publish:execute", {
        entityType: "blog-post",
        entityId: "post-1",
      });

      expect(receivedMessages).toHaveLength(0);
    });

    it("should skip already published posts", async () => {
      const publishedPost: SocialPost = {
        ...samplePost,
        metadata: { ...samplePost.metadata, status: "published" },
      };
      const entityService = harness.getEntityService();
      await entityService.createEntity({ entity: publishedPost });

      await harness.sendMessage("publish:execute", {
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(receivedMessages).toHaveLength(0);
    });
  });

  describe("with mock provider", () => {
    let providerHarness: PluginTestHarness<SocialMediaPlugin>;
    let originalFetch: typeof globalThis.fetch;
    let requestedUrls: string[];
    let respond: FetchHandler;

    beforeEach(async () => {
      originalFetch = globalThis.fetch;
      requestedUrls = [];
      // `LinkedInClient` binds `deps.fetch ?? globalThis.fetch` in its
      // constructor, and the plugin builds the provider without deps. The mock
      // therefore has to be installed before the plugin, or the client captures
      // the real transport and the publish path reaches api.linkedin.com — which
      // is what previously made this suite time out under load.
      respond = async (): Promise<Partial<Response>> => ({
        ok: false,
        status: 500,
        text: async (): Promise<string> => "unstubbed request",
      });
      mockFetch(async (url, options) => {
        requestedUrls.push(url);
        return respond(url, options);
      });
      providerHarness = createPluginHarness<SocialMediaPlugin>({
        dataDir: "/tmp/test-social-provider",
      });
      receivedMessages = [];

      for (const eventType of [
        "publish:report:success",
        "publish:report:failure",
      ]) {
        providerHarness.subscribe(eventType, async (msg) => {
          receivedMessages.push({ type: eventType, payload: msg.payload });
          return { success: true };
        });
      }

      await providerHarness.installPlugin(
        new SocialMediaPlugin({ linkedin: { accessToken: "test-token" } }),
      );
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("should report success on successful publish", async () => {
      respond = async (url): Promise<Partial<Response>> =>
        url.endsWith("/v2/userinfo")
          ? {
              ok: true,
              status: 200,
              json: async (): Promise<unknown> => ({ sub: "member-1" }),
            }
          : {
              ok: true,
              status: 201,
              json: async (): Promise<unknown> => ({}),
              headers: new Headers({ "X-RestLi-Id": "urn:li:share:12345" }),
            };
      const entityService = providerHarness.getEntityService();
      await entityService.createEntity({ entity: samplePost });

      await providerHarness.sendMessage("publish:execute", {
        entityType: "social-post",
        visibility: "public",
        entityId: "post-1",
      });

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]?.type).toBe("publish:report:success");
      expect(requestedUrls).toEqual([
        "https://api.linkedin.com/v2/userinfo",
        "https://api.linkedin.com/v2/ugcPosts",
      ]);
    });

    it("should report failure when the LinkedIn API rejects the post", async () => {
      respond = async (url): Promise<Partial<Response>> =>
        url.endsWith("/v2/userinfo")
          ? {
              ok: true,
              status: 200,
              json: async (): Promise<unknown> => ({ sub: "member-1" }),
            }
          : {
              ok: false,
              status: 401,
              text: async (): Promise<string> =>
                JSON.stringify({ message: "Invalid access token" }),
            };
      const entityService = providerHarness.getEntityService();
      await entityService.createEntity({ entity: samplePost });

      await providerHarness.sendMessage("publish:execute", {
        entityType: "social-post",
        visibility: "public",
        entityId: "post-1",
      });

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]?.type).toBe("publish:report:failure");
    });
  });
});
