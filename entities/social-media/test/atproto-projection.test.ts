import { describe, expect, it, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { createSocialPostAtprotoProjection } from "../src/atproto-projection";
import { SocialMediaPlugin } from "../src/plugin";
import type { SocialPost } from "../src/schemas/social-post";

const socialPost: SocialPost = {
  id: "social-post-1",
  entityType: "social-post",
  content:
    "---\ntitle: Launch Note\nplatform: linkedin\nstatus: published\npublishedAt: 2026-05-28T10:00:00.000Z\nplatformPostId: urn:li:share:123\nsourceEntityId: post-1\nsourceEntityType: post\n---\nSharing our launch note with the network.",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: {
    title: "Launch Note",
    slug: "linkedin-launch-note",
    platform: "linkedin",
    status: "published",
    publishedAt: "2026-05-28T10:00:00.000Z",
    platformPostId: "urn:li:share:123",
  },
};

describe("social-post ATProto projection", () => {
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("maps social posts to ai.rizom.brain.socialPost records", async () => {
    const projection = createSocialPostAtprotoProjection();

    const record = await projection.buildRecord({
      entity: socialPost,
      context: createPluginHarness().getServiceContext("social-media"),
      config: {
        brainDid: "did:web:brain.example.com",
      },
    });

    expect(record).toEqual({
      $type: "ai.rizom.brain.socialPost",
      title: "Launch Note",
      platform: "linkedin",
      body: "Sharing our launch note with the network.",
      format: "text/markdown",
      status: "published",
      publishedAt: "2026-05-28T10:00:00.000Z",
      platformPostId: "urn:li:share:123",
      sourceLocalEntityType: "post",
      sourceLocalEntityId: "post-1",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "social-post",
      sourceEntityId: "social-post-1",
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("registers the social-post projection when the social media plugin registers", async () => {
    const harness = createPluginHarness({
      dataDir: "/tmp/test-social-post-atproto",
    });
    await harness.installPlugin(new SocialMediaPlugin({}));

    const projection =
      AtprotoProjectionRegistry.getInstance().get("social-post");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.socialPost");
  });
});
